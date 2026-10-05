import { readFileSync } from "node:fs";
import type { AlignmentProvider } from "./alignmentProvider.ts";
import { getDecompositionDependencies } from "./decompositionDependencies.ts";
import {
  completeStageAttempt,
  countScenesForRun,
  getNarrationTimestamps,
  getRun,
  getStageAttempts,
  getVoiceOver,
  recordStageAttempt,
  resolveArtefactPath,
  setRunFailure,
} from "./db.ts";
import { admitLaunch, registerStageLauncher, type StageLauncher } from "./launchGate.ts";
import { obtainNarrationTimestamps, storedFileSchema } from "./narrationTimestampsPhase.ts";
import { broadcast, launchImageStageForRun } from "./orchestrator.ts";
import { registerAttemptSender, releaseSessionAttempts } from "./retry/retryScheduler.ts";
import { registerDecomposition, type RegistrationResult, type RetryPosition } from "./sceneRegistration.ts";
import { segmentScript } from "./segmentation.ts";
import { createDecompositionFailure } from "./sessionStateMachine.ts";
import type { TimestampCharacter } from "./narrationTimestamps.ts";
import type { DecompositionFailure, Run, StageAttempt } from "./types.ts";
import type { VisualInstructionGenerator } from "./visualInstructions.ts";

// segment-script-into-chunks (JOS-140) — PRD §5 step 4, design Decisions 5 and
// 7: segment the session's stored timestamps into fragments and register them
// as chunks (JOS-144), and the one entry point that obtains the timestamps
// first (JOS-139). Nothing in the running app calls it yet: JOS-136's voice
// phase calls it once a narration completes.

export type SegmentStoredResult =
  | RegistrationResult
  | { ok: false; reason: "no-timestamps" | "held" };

export type DecompositionPhaseResult = SegmentStoredResult | { ok: false; reason: "no-voice-over" | "held" };

export interface DecompositionDependencies {
  alignmentProvider: AlignmentProvider;
  instructionGenerator: VisualInstructionGenerator;
}

/** Decision 5 — recorded on the session, worded so it never blames the User's script; the same input gives the same result, so it is not retryable. */
function recordSegmentationFailure(runId: string, detail: string, now: Date, retryState: RetryPosition): SegmentStoredResult {
  const failure: DecompositionFailure = createDecompositionFailure({
    cause: `The system could not divide the script into scenes: ${detail}. This is not an error in your script, which is unchanged.`,
    retryable: false,
    occurredAt: now,
    ...retryState,
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

/** The division step's own provider, recorded on its attempts (retry-decomposition, Decision 3). */
export const DECOMPOSITION_ATTEMPT_PROVIDER = "openai-decomposition";

/** How the step's result closes its attempt: a refusal because chunks already exist closes it as done, since nothing failed. */
function closeAttempt(attempt: StageAttempt, result: SegmentStoredResult, finishedAt: string): void {
  if (result.ok || result.reason === "already-registered") {
    completeStageAttempt(attempt.id, { outcome: "success", finishedAt });
  } else if (result.reason === "decomposition-failed") {
    completeStageAttempt(attempt.id, {
      outcome: result.failure.retryable ? "transient" : "not-retryable",
      finishedAt,
      errorMessage: result.failure.cause,
    });
  } else {
    completeStageAttempt(attempt.id, { outcome: "not-retryable", finishedAt, errorMessage: result.reason });
  }
}

export async function segmentStoredTimestamps(
  runId: string,
  instructionGenerator: VisualInstructionGenerator,
  now: () => Date = () => new Date(),
  /** A retry's scheduled attempt, already claimed in flight: completed instead of recording a new one (retry-decomposition, Decision 4). */
  claimedAttempt?: StageAttempt,
): Promise<SegmentStoredResult> {
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown-session" };
  const guard = (): SegmentStoredResult | null => {
    if (!admitLaunch(runId).admitted) return { ok: false, reason: "held" };
    if (!getNarrationTimestamps(runId) || !getVoiceOver(runId)) return { ok: false, reason: "no-timestamps" };
    // §6 — established chunks are never replaced; a session is decomposed once.
    if (countScenesForRun(runId) > 0) return { ok: false, reason: "already-registered" };
    return null;
  };
  const refused = guard();
  if (refused) {
    if (claimedAttempt) closeAttempt(claimedAttempt, refused, now().toISOString());
    return refused;
  }
  const timestamps = getNarrationTimestamps(runId)!;
  const voiceOver = getVoiceOver(runId)!;

  // Recorded in flight before anything is segmented or sent. The first try of the step is `initial`, even though the
  // timestamps attempt already opened the shared instance.
  const startedAt = now().toISOString();
  const attempt =
    claimedAttempt ??
    recordStageAttempt({
      runId,
      stage: "decomposition",
      providerId: DECOMPOSITION_ATTEMPT_PROVIDER,
      queuedAt: startedAt,
      sentAt: startedAt,
      ...(getStageAttempts(runId, "decomposition").length === 0 ? { trigger: "initial" as const } : {}),
    });
  const retryState: RetryPosition = { cycle: attempt.cycle, attemptsInCycle: attempt.sequenceInCycle };

  const result = await divideStoredTimestamps(run, timestamps.path, voiceOver.durationSeconds, instructionGenerator, now, retryState);
  closeAttempt(attempt, result, now().toISOString());
  // generate-chunk-image (JOS-145), AC1 — launches every newly-registered
  // chunk's image generation automatically, with no further User action.
  // Not awaited: the caller observes progress through `broadcast`/SSE, the
  // same as every other launch (design Decision 7).
  if (result.ok) launchImageStageForRun(runId);
  return result;
}

async function divideStoredTimestamps(
  run: Run,
  timestampsPath: string,
  durationSeconds: number,
  instructionGenerator: VisualInstructionGenerator,
  now: () => Date,
  retryState: RetryPosition,
): Promise<SegmentStoredResult> {
  const runId = run.id;
  const characters = readStoredCharacters(run, timestampsPath);
  if (!characters) return recordSegmentationFailure(runId, "the stored timestamps could not be read", now(), retryState);

  const segmentation = segmentScript(run.script, run.language, characters, durationSeconds);
  if (!segmentation.ok) return recordSegmentationFailure(runId, segmentation.reason, now(), retryState);

  return registerDecomposition(runId, segmentation.fragments, instructionGenerator, durationSeconds, now, retryState);
}

export async function runDecompositionPhase(
  runId: string,
  dependencies: DecompositionDependencies,
  now: () => Date = () => new Date(),
): Promise<DecompositionPhaseResult> {
  const admission = admitLaunch(runId);
  if (!admission.admitted) {
    if (admission.reason === "unknown-session") return { ok: false, reason: "unknown-session" };
    return { ok: false, reason: "held" };
  }
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

/**
 * A retry's scheduled attempt, claimed by the gate (retry-decomposition, Decision 4): runs the step it names on the
 * configured providers. A timestamps attempt that succeeds goes on to divide, as `runDecompositionPhase` does.
 */
async function sendDecompositionAttempt(attempt: StageAttempt): Promise<void> {
  const dependencies = getDecompositionDependencies();
  if (attempt.stage === "timestamps") {
    const obtained = await obtainNarrationTimestamps(attempt.runId, dependencies.alignmentProvider, () => new Date(), attempt);
    if (!obtained.ok) {
      // A refusal before the attempt was used leaves it in flight; "already-obtained" means the step's work is done.
      completeStageAttempt(attempt.id, {
        outcome: obtained.reason === "already-obtained" ? "success" : "not-retryable",
        finishedAt: new Date().toISOString(),
        ...(obtained.reason === "decomposition-failed" ? {} : { errorMessage: obtained.reason }),
      });
      if (obtained.reason !== "already-obtained") return;
    }
    await segmentStoredTimestamps(attempt.runId, dependencies.instructionGenerator);
    return;
  }
  await segmentStoredTimestamps(attempt.runId, dependencies.instructionGenerator, () => new Date(), attempt);
}

registerAttemptSender("timestamps", sendDecompositionAttempt);
registerAttemptSender("decomposition", sendDecompositionAttempt);

/**
 * The stage's entry in the phase-launch gate (retry-decomposition, Decision 5). Held work is a retry's scheduled
 * attempt for a session with no chunks. JOS-136's "directly after the narration" start joins the held-work and launch
 * terms here, when it launches this phase itself.
 */
export const decompositionLauncher: StageLauncher = {
  stage: "decomposition",
  heldWork: (sessionId: string) => {
    const retryScheduled =
      countScenesForRun(sessionId) === 0 &&
      [...getStageAttempts(sessionId, "timestamps"), ...getStageAttempts(sessionId, "decomposition")].some(
        (attempt) => attempt.outcome === "scheduled",
      );
    return { count: retryScheduled ? 1 : 0, sceneIds: [] };
  },
  launch: (sessionId: string) => {
    if (!admitLaunch(sessionId).admitted) return;
    releaseSessionAttempts(sessionId);
  },
};

registerStageLauncher(decompositionLauncher);
