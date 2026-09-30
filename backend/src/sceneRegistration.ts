import { randomUUID } from "node:crypto";
import { SEGMENTATION_LOWER_BOUND_SECONDS, SEGMENTATION_UPPER_BOUND_SECONDS } from "./config/providers.ts";
import { countScenesForRun, getRun, insertRegisteredScenes, setRunFailure } from "./db.ts";
import { broadcast } from "./orchestrator.ts";
import { createDecompositionFailure } from "./sessionStateMachine.ts";
import type { DecompositionFailure } from "./types.ts";
import type { VisualInstructionGenerator, VisualInstructionPair } from "./visualInstructions.ts";

// assign-scene-identifiers (JOS-144) — PRD §5 step 5: number the ordered
// fragments 1..N, obtain their IMAGE and VIDEO instructions, check the whole
// result, and register the chunks, or record a decomposition failure.
//
// Nothing in the running app calls this yet (product owner decision,
// 2026-09-27, design Decision 1): the segmentation story (JOS-140) produces the
// fragments and calls `registerDecomposition` once the voice-over and
// timestamps exist.

/** The two §6.1.1 exceptions segmentation may flag on a fragment outside the bounds. */
export type FragmentException = "script-below-lower-bound" | "unsplittable-sentence";

/** PRD §3 narration interval: where a chunk sits in the voice-over, in seconds. */
export interface NarrationInterval {
  startSeconds: number;
  endSeconds: number;
}

/** The narrated duration of an interval; the one place it is derived, so a duration can never disagree with its interval. */
export function intervalDurationSeconds(interval: NarrationInterval): number {
  return interval.endSeconds - interval.startSeconds;
}

/** What segmentation hands over for each fragment, in script order. */
export interface SegmentedFragment {
  /** The exact text of the script this fragment narrates; it becomes the chunk's PROMPT. */
  text: string;
  /** From the D11 boundaries `unitBoundaries` gives segmentation (assign-narration-intervals, JOS-143, Decision 1). */
  narrationInterval: NarrationInterval;
  exception?: FragmentException;
}

export type RegistrationResult =
  | { ok: true; sceneIds: string[] }
  | { ok: false; reason: "unknown-session" | "already-registered" }
  | { ok: false; reason: "decomposition-failed"; failure: DecompositionFailure };

/** §4.2 — whitespace is the only difference allowed between the joined fragments and the script. */
function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Decision 5 — checks the fragments before anything is generated or written.
 * Returns a description of the first problem, or null when they are valid.
 */
function findFragmentProblem(script: string, fragments: readonly SegmentedFragment[]): string | null {
  if (fragments.length === 0) return "it produced no scenes";

  for (const [position, fragment] of fragments.entries()) {
    const number = position + 1;
    if (fragment.text.trim() === "") return `scene ${number} has no text`;

    const duration = intervalDurationSeconds(fragment.narrationInterval);
    if (!Number.isFinite(duration) || duration <= 0) return `scene ${number} has no valid narrated duration`;

    // §6.1 bounds, with the two §6.1.1 exceptions.
    if (duration < SEGMENTATION_LOWER_BOUND_SECONDS) {
      const wholeScriptBelowBound = fragment.exception === "script-below-lower-bound" && fragments.length === 1;
      if (!wholeScriptBelowBound) {
        return `scene ${number} lasts ${duration} s, below the ${SEGMENTATION_LOWER_BOUND_SECONDS} s lower bound`;
      }
    }
    if (duration > SEGMENTATION_UPPER_BOUND_SECONDS && fragment.exception !== "unsplittable-sentence") {
      return `scene ${number} lasts ${duration} s, above the ${SEGMENTATION_UPPER_BOUND_SECONDS} s upper bound`;
    }
  }

  const joined = fragments.map((fragment) => fragment.text).join(" ");
  if (normaliseWhitespace(joined) !== normaliseWhitespace(script)) {
    return "its scenes, joined in order, do not reproduce the script";
  }
  return null;
}

/**
 * assign-narration-intervals (JOS-143), Decision 2 — the intervals, in order, must be
 * contiguous and cover the voice-over from 0 to its duration. Exact comparisons: every
 * boundary comes from one `unitBoundaries` array, so a correct segmentation is bit-identical.
 */
function findPartitionProblem(fragments: readonly SegmentedFragment[], voiceOverDurationSeconds: number): string | null {
  let previousEnd = 0;
  for (const [position, fragment] of fragments.entries()) {
    const number = position + 1;
    const { startSeconds, endSeconds } = fragment.narrationInterval;
    if (startSeconds !== previousEnd) {
      return position === 0
        ? `scene 1 starts at ${startSeconds} s instead of 0 s`
        : `scene ${number} starts at ${startSeconds} s but scene ${number - 1} ends at ${previousEnd} s`;
    }
    if (!(endSeconds > startSeconds)) return `scene ${number} has an empty narration interval`;
    previousEnd = endSeconds;
  }
  if (previousEnd !== voiceOverDurationSeconds) {
    return `scene ${fragments.length} ends at ${previousEnd} s but the voice-over lasts ${voiceOverDurationSeconds} s`;
  }
  return null;
}

function findInstructionProblem(pairs: readonly VisualInstructionPair[], expected: number): string | null {
  if (pairs.length !== expected) return `it produced ${pairs.length} visual instruction pairs for ${expected} scenes`;
  const incomplete = pairs.findIndex((pair) => pair.image.trim() === "" || pair.video.trim() === "");
  return incomplete === -1 ? null : `scene ${incomplete + 1} is missing its image or video instruction`;
}

/** Decision 6 — records the failure on the session, worded so it never blames the User's script. */
function recordFailure(runId: string, detail: string, retryable: boolean, now: Date): RegistrationResult {
  const failure = createDecompositionFailure({
    cause: `The system's scene decomposition was invalid: ${detail}. This is not an error in your script, which is unchanged.`,
    retryable,
    occurredAt: now,
  });
  setRunFailure(runId, failure);
  broadcast(runId);
  return { ok: false, reason: "decomposition-failed", failure };
}

export async function registerDecomposition(
  runId: string,
  fragments: readonly SegmentedFragment[],
  generator: VisualInstructionGenerator,
  voiceOverDurationSeconds: number,
  now: () => Date = () => new Date(),
): Promise<RegistrationResult> {
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown-session" };
  // §6 — established chunks are never replaced; a session is decomposed once.
  if (countScenesForRun(runId) > 0) return { ok: false, reason: "already-registered" };

  const fragmentProblem = findFragmentProblem(run.script, fragments);
  // A validation failure is retryable: a new decomposition can come out valid.
  if (fragmentProblem) return recordFailure(runId, fragmentProblem, true, now());

  // Without a usable duration the partition cannot be checked, and retrying the same input cannot change that.
  if (!Number.isFinite(voiceOverDurationSeconds) || voiceOverDurationSeconds <= 0) {
    return recordFailure(runId, `the voice-over duration (${voiceOverDurationSeconds}) is not usable`, false, now());
  }
  const partitionProblem = findPartitionProblem(fragments, voiceOverDurationSeconds);
  if (partitionProblem) return recordFailure(runId, partitionProblem, true, now());

  const instructions = await generator.generate(
    fragments.map((fragment) => fragment.text),
    run.language,
  );
  if (instructions.kind === "failed_transient" || instructions.kind === "invalid_output") {
    return recordFailure(runId, instructions.reason, true, now());
  }
  if (instructions.kind === "failed_not_retryable") {
    return recordFailure(runId, instructions.reason, false, now());
  }

  const instructionProblem = findInstructionProblem(instructions.pairs, fragments.length);
  if (instructionProblem) return recordFailure(runId, instructionProblem, true, now());

  const scenes = fragments.map((fragment, position) => ({
    id: randomUUID(),
    index: position + 1,
    prompt: fragment.text,
    imageInstruction: instructions.pairs[position]!.image.trim(),
    videoInstruction: instructions.pairs[position]!.video.trim(),
  }));
  try {
    insertRegisteredScenes(runId, scenes);
  } catch (err: any) {
    // Another registration won the race; the unique (run_id, idx) index refused this one.
    if (/UNIQUE constraint failed/i.test(String(err?.message))) return { ok: false, reason: "already-registered" };
    throw err;
  }
  broadcast(runId);
  return { ok: true, sceneIds: scenes.map((scene) => scene.id) };
}
