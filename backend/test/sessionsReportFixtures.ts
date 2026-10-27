import { completeStageAttempt, db, recordStageAttempt, setRunFailure, setRunPaused } from "../src/db.ts";
import { createDecompositionFailure, createVoiceOverFailure } from "../src/sessionStateMachine.ts";
import type { AssemblyFailure } from "../src/types.ts";
import { newRun } from "./failedStageFixtures.ts";
import { plusMs } from "./providerUsageFixtures.ts";

// report-sessions (JOS-225) — seeding helpers shared by the sessions-report and route tests.

/** A session created at `createdAt`, with the facts the report derives its row from. Times are seconds after `createdAt`. */
export function seedSession(input: {
  title?: string;
  script?: string;
  createdAt: string;
  paused?: boolean;
  /** The voice-over completes this many seconds after creation. */
  voiceOverAfter?: number;
  /** An assembly attempt succeeds this many seconds after creation. */
  assemblyAfter?: number;
  failure?: "voice-over" | "decomposition" | "assembly";
  failureCause?: string;
}): string {
  const runId = newRun(input.title ?? "A session", input.script ?? "The lighthouse stands alone.");
  db.prepare("UPDATE runs SET created_at = ? WHERE id = ?").run(input.createdAt, runId);
  if (input.paused) setRunPaused(runId, true);
  if (input.voiceOverAfter !== undefined) {
    db.prepare(
      "INSERT INTO voice_overs (run_id, audio_path, timestamps_path, duration_seconds, size_bytes, native_timestamps_available, provider_request_id, completed_at) VALUES (?, 'voice.mp3', NULL, 10, 1, 0, NULL, ?)",
    ).run(runId, plusMs(input.createdAt, input.voiceOverAfter * 1000));
  }
  if (input.assemblyAfter !== undefined) {
    const sentAt = plusMs(input.createdAt, (input.assemblyAfter - 1) * 1000);
    const attempt = recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: sentAt, sentAt });
    completeStageAttempt(attempt.id, { outcome: "success", finishedAt: plusMs(input.createdAt, input.assemblyAfter * 1000) });
  }
  if (input.failure) {
    const cause = input.failureCause ?? "a failure";
    const occurredAt = new Date(input.createdAt);
    if (input.failure === "voice-over") setRunFailure(runId, createVoiceOverFailure({ cause, retryable: true, occurredAt }));
    else if (input.failure === "decomposition") setRunFailure(runId, createDecompositionFailure({ cause, retryable: true, occurredAt }));
    else setRunFailure(runId, { phase: "assembly", cause, retryable: true, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 1, occurredAt: occurredAt.toISOString() } satisfies AssemblyFailure);
  }
  return runId;
}
