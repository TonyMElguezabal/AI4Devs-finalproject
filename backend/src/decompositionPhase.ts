import { readFileSync } from "node:fs";
import type { AlignmentProvider } from "./alignmentProvider.ts";
import { countScenesForRun, getNarrationTimestamps, getRun, getVoiceOver, resolveArtefactPath, setRunFailure } from "./db.ts";
import { obtainNarrationTimestamps, storedFileSchema } from "./narrationTimestampsPhase.ts";
import { broadcast, launchImageStageForRun } from "./orchestrator.ts";
import { registerDecomposition, type RegistrationResult } from "./sceneRegistration.ts";
import { segmentScript } from "./segmentation.ts";
import { createDecompositionFailure } from "./sessionStateMachine.ts";
import type { TimestampCharacter } from "./narrationTimestamps.ts";
import type { DecompositionFailure, Run } from "./types.ts";
import type { VisualInstructionGenerator } from "./visualInstructions.ts";

// segment-script-into-chunks (JOS-140) — PRD §5 step 4, design Decisions 5 and
// 7: segment the session's stored timestamps into fragments and register them
// as chunks (JOS-144), and the one entry point that obtains the timestamps
// first (JOS-139). Nothing in the running app calls it yet: JOS-136's voice
// phase calls it once a narration completes.

export type SegmentStoredResult =
  | RegistrationResult
  | { ok: false; reason: "no-timestamps" };

export type DecompositionPhaseResult = SegmentStoredResult | { ok: false; reason: "no-voice-over" };

export interface DecompositionDependencies {
  alignmentProvider: AlignmentProvider;
  instructionGenerator: VisualInstructionGenerator;
}

/** Decision 5 — recorded on the session, worded so it never blames the User's script; the same input gives the same result, so it is not retryable. */
function recordSegmentationFailure(runId: string, detail: string, now: Date): SegmentStoredResult {
  const failure: DecompositionFailure = createDecompositionFailure({
    cause: `The system could not divide the script into scenes: ${detail}. This is not an error in your script, which is unchanged.`,
    retryable: false,
    occurredAt: now,
  });
  setRunFailure(runId, failure);
  broadcast(runId);
  return { ok: false, reason: "decomposition-failed", failure };
}

function readStoredCharacters(run: Run, relativePath: string): TimestampCharacter[] | null {
  try {
    const parsed = storedFileSchema.safeParse(JSON.parse(readFileSync(resolveArtefactPath(run.projectFolder, relativePath), "utf8")));
    return parsed.success ? parsed.data.characters : null;
  } catch {
    return null;
  }
}

export async function segmentStoredTimestamps(
  runId: string,
  instructionGenerator: VisualInstructionGenerator,
  now: () => Date = () => new Date(),
): Promise<SegmentStoredResult> {
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown-session" };
  const timestamps = getNarrationTimestamps(runId);
  const voiceOver = getVoiceOver(runId);
  if (!timestamps || !voiceOver) return { ok: false, reason: "no-timestamps" };
  // §6 — established chunks are never replaced; a session is decomposed once.
  if (countScenesForRun(runId) > 0) return { ok: false, reason: "already-registered" };

  const characters = readStoredCharacters(run, timestamps.path);
  if (!characters) return recordSegmentationFailure(runId, "the stored timestamps could not be read", now());

  const segmentation = segmentScript(run.script, run.language, characters, voiceOver.durationSeconds);
  if (!segmentation.ok) return recordSegmentationFailure(runId, segmentation.reason, now());

  const result = await registerDecomposition(runId, segmentation.fragments, instructionGenerator, voiceOver.durationSeconds, now);
  // generate-chunk-image (JOS-145), AC1 — launches every newly-registered
  // chunk's image generation automatically, with no further User action.
  // Not awaited: the caller observes progress through `broadcast`/SSE, the
  // same as every other launch (design Decision 7).
  if (result.ok) launchImageStageForRun(runId);
  return result;
}

export async function runDecompositionPhase(
  runId: string,
  dependencies: DecompositionDependencies,
  now: () => Date = () => new Date(),
): Promise<DecompositionPhaseResult> {
  if (!getNarrationTimestamps(runId)) {
    const obtained = await obtainNarrationTimestamps(runId, dependencies.alignmentProvider, now);
    // "already-obtained" means another run stored them first, which is what this step needed.
    if (!obtained.ok) {
      if (obtained.reason === "decomposition-failed") return obtained;
      if (obtained.reason !== "already-obtained") return { ok: false, reason: obtained.reason };
    }
  }
  return segmentStoredTimestamps(runId, dependencies.instructionGenerator, now);
}
