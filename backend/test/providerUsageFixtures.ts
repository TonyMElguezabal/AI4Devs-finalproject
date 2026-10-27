import { randomUUID } from "node:crypto";
import { completeStageAttempt, db, insertProviderRequest, recordStageAttempt, scheduleStageAttempt } from "../src/db.ts";
import type { AttemptStage, AttemptTrigger, ProviderOutcomeMode, StageAttemptOutcome } from "../src/types.ts";
import { newRun } from "./failedStageFixtures.ts";

// report-provider-usage (JOS-223) — seeding helpers shared by the report and route tests.

export const PERIOD = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" } as const;

/** `moment` plus `ms` milliseconds, as the ISO string every writer of `sent_at` stores. */
export function plusMs(moment: string, ms: number): string {
  return new Date(Date.parse(moment) + ms).toISOString();
}

/** One session-level attempt on a fresh session whose script has `scriptLength` characters; `latencyMs` null leaves it without a finish time. */
export function seedAttempt(input: {
  stage: AttemptStage;
  providerId: string | null;
  sentAt: string;
  outcome: StageAttemptOutcome;
  latencyMs?: number;
  scriptLength?: number;
  runId?: string;
  /** Defaults to the stage instance's latest cycle; a manual retry starts the next one. */
  cycle?: number;
  trigger?: AttemptTrigger;
  /** The failure wording stored on a failed attempt. */
  errorMessage?: string;
}): string {
  const runId = input.runId ?? newRun("Usage", "x".repeat(input.scriptLength ?? 28));
  const base = {
    runId,
    stage: input.stage,
    providerId: input.providerId,
    queuedAt: input.sentAt,
    ...(input.cycle !== undefined ? { cycle: input.cycle } : {}),
    ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
  };
  if (input.outcome === "scheduled") {
    scheduleStageAttempt({ ...base, dueAt: input.sentAt });
    return runId;
  }
  const attempt = recordStageAttempt({ ...base, sentAt: input.sentAt });
  if (input.outcome !== "in-flight") {
    completeStageAttempt(attempt.id, {
      outcome: input.outcome,
      finishedAt: plusMs(input.sentAt, input.latencyMs ?? 100),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
    });
  }
  return runId;
}

export function seedVoiceOver(runId: string, durationSeconds: number): void {
  db.prepare(
    "INSERT INTO voice_overs (run_id, audio_path, timestamps_path, duration_seconds, size_bytes, native_timestamps_available, provider_request_id, completed_at) VALUES (?, 'voice.mp3', NULL, ?, 1, 0, NULL, ?)",
  ).run(runId, durationSeconds, PERIOD.from);
}

/** One scene-level attempt recorded in `provider_requests`, stamped `sentAt`. */
export function seedSceneAttempt(input: { sceneId: string; stage: "image" | "video"; mode: ProviderOutcomeMode; latencyMs: number; sentAt: string }): void {
  const request = insertProviderRequest(randomUUID(), input.sceneId, input.latencyMs, input.mode, 1, input.stage);
  db.prepare("UPDATE provider_requests SET sent_at = ? WHERE id = ?").run(input.sentAt, request.id);
}

export function bindScene(sceneId: string, binding: { provider?: string; videoProvider?: string }): void {
  if (binding.provider) db.prepare("UPDATE scenes SET provider = ? WHERE id = ?").run(binding.provider, sceneId);
  if (binding.videoProvider) db.prepare("UPDATE scenes SET video_provider = ? WHERE id = ?").run(binding.videoProvider, sceneId);
}

/** The clip length registered for the scene (locked once the chunk exists). */
export function requestedSecondsOf(sceneId: string): number {
  return (db.prepare("SELECT requested_duration_seconds AS seconds FROM scenes WHERE id = ?").get(sceneId) as unknown as { seconds: number }).seconds;
}
