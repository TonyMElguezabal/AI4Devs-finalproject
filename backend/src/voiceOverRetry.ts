import { getRun, getStageAttempts } from "./db.ts";
import { toSnapshot } from "./orchestrator.ts";
import { releaseSessionAttempts } from "./retry/retryScheduler.ts";
import { startNewCycle } from "./retry/stageAttemptRecorder.ts";
import { canLaunchVoiceOver } from "./voiceLaunchGuard.ts";

// retry-voice-over (JOS-155) Decision 2 — the one command behind the manual
// voice-over retry. Every check reads the store and nothing is sent until
// `startNewCycle` has committed, so a refusal can never reach the provider.

export type VoiceOverRetryRefusal =
  | "session-not-found"
  | "not-failed-in-voice-over"
  | "narration-complete"
  | "not-retryable"
  | "retry-already-pending";

export type VoiceOverRetryResult = { ok: true; held: boolean } | { ok: false; reason: VoiceOverRetryRefusal };

/** A retry is pending when the newest attempt waits or runs and is not the session's first request. */
function hasPendingRetry(sessionId: string): boolean {
  const attempts = getStageAttempts(sessionId, "voice-over");
  const latest = attempts[attempts.length - 1];
  return latest !== undefined && (latest.outcome === "scheduled" || latest.outcome === "in-flight") && latest.trigger !== "initial";
}

export function retryVoiceOver(sessionId: string): VoiceOverRetryResult {
  const run = getRun(sessionId);
  if (!run) return { ok: false, reason: "session-not-found" };
  if (hasPendingRetry(sessionId)) return { ok: false, reason: "retry-already-pending" };

  const session = toSnapshot(sessionId)?.session;
  if (!session || session.state !== "failed" || session.failedPhase !== "voice-over") {
    return { ok: false, reason: "not-failed-in-voice-over" };
  }
  if (!canLaunchVoiceOver(sessionId).allowed) return { ok: false, reason: "narration-complete" };
  if (!run.failure?.manualRetryAvailable) return { ok: false, reason: "not-retryable" };

  const started = startNewCycle({ sessionId, stage: "voice-over" });
  if (!started.started) {
    return { ok: false, reason: started.reason === "not-retryable" ? "not-retryable" : "retry-already-pending" };
  }

  const sent = releaseSessionAttempts(sessionId);
  return { ok: true, held: sent === 0 };
}
