import { countScenesForRun, getNarrationTimestamps, getRun, getStageInstanceAttempts, stageInstanceKeyOf } from "./db.ts";
import "./decompositionPhase.ts";
import { toSnapshot } from "./orchestrator.ts";
import { releaseSessionAttempts } from "./retry/retryScheduler.ts";
import { startNewCycle } from "./retry/stageAttemptRecorder.ts";

// retry-decomposition (JOS-156) Decision 2 — the one command behind the manual
// decomposition retry. Every check reads the store and nothing is sent until
// `startNewCycle` has committed, so a refusal can never reach a provider.
// Importing the phase registers the attempt senders the gate hands the attempt to.

export type DecompositionRetryRefusal =
  | "session-not-found"
  | "already-registered"
  | "retry-already-pending"
  | "not-failed-in-decomposition"
  | "not-retryable";

export type DecompositionRetryResult = { ok: true; held: boolean } | { ok: false; reason: DecompositionRetryRefusal };

/** A retry is pending when the newest attempt of either step waits or runs and is not the first one. */
function hasPendingRetry(sessionId: string): boolean {
  const attempts = getStageInstanceAttempts(stageInstanceKeyOf(sessionId, "decomposition"));
  const latest = attempts[attempts.length - 1];
  return latest !== undefined && (latest.outcome === "scheduled" || latest.outcome === "in-flight") && latest.trigger !== "initial";
}

export function retryDecomposition(sessionId: string): DecompositionRetryResult {
  const run = getRun(sessionId);
  if (!run) return { ok: false, reason: "session-not-found" };
  if (countScenesForRun(sessionId) > 0) return { ok: false, reason: "already-registered" };
  if (hasPendingRetry(sessionId)) return { ok: false, reason: "retry-already-pending" };

  const session = toSnapshot(sessionId)?.session;
  if (!session || session.state !== "failed" || session.failedPhase !== "decomposition") {
    return { ok: false, reason: "not-failed-in-decomposition" };
  }
  if (!run.failure?.manualRetryAvailable) return { ok: false, reason: "not-retryable" };

  const stage = getNarrationTimestamps(sessionId) ? "decomposition" : "timestamps";
  const started = startNewCycle({ sessionId, stage });
  if (!started.started) {
    return { ok: false, reason: started.reason === "not-retryable" ? "not-retryable" : "retry-already-pending" };
  }

  const sent = releaseSessionAttempts(sessionId);
  return { ok: true, held: sent === 0 };
}
