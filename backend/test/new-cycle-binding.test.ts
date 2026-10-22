import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { completeStageAttempt, createRun, db, getStageAttempts, recordStageAttempt, resetAll } from "../src/db.ts";
import { recordAttemptOutcome, startNewCycle } from "../src/retry/stageAttemptRecorder.ts";
import type { AttemptStage } from "../src/types.ts";

// move-failed-stage-to-active-provider (JOS-172), group 2 — design Decision 5: a manual retry takes the provider of the
// stage instance's current binding, so a moved session-level stage retries on the provider it was moved to.

const NOW = new Date("2026-10-22T10:00:00.000Z");
const options = { now: () => NOW, onScheduled: () => {} };

beforeEach(() => resetAll());

function failedStage(stage: AttemptStage, providerId: string, outcome: "transient" | "not-retryable" = "transient"): string {
  const runId = randomUUID();
  createRun(runId, "Binding test", "A short script.", "en");
  const attempt = recordStageAttempt({ runId, stage, providerId, queuedAt: NOW.toISOString(), sentAt: NOW.toISOString() });
  completeStageAttempt(attempt.id, { outcome, finishedAt: NOW.toISOString(), errorMessage: "stub: failed" });
  return runId;
}

/** Sets the binding directly: the rebinding functions of group 4 do not exist yet, and the first attempt already bound the stage. */
const COLUMN = { "voice-over": "voice_provider_id", timestamps: "alignment_provider_id", decomposition: "decomposition_provider_id" } as const;
function setBinding(stage: keyof typeof COLUMN, runId: string, providerId: string): void {
  db.prepare(`UPDATE runs SET ${COLUMN[stage]} = ? WHERE id = ?`).run(providerId, runId);
}

describe("startNewCycle takes the stage's binding", () => {
  it.each(["voice-over", "timestamps", "decomposition"] as const)("%s: a stage bound to stub-b whose latest attempt ran on stub-a retries on stub-b", (stage) => {
    const runId = failedStage(stage, "stub-a");
    setBinding(stage, runId, "stub-b");

    const result = startNewCycle({ sessionId: runId, stage }, options);

    expect(result).toMatchObject({ started: true, attempt: { providerId: "stub-b", trigger: "manual", cycle: 2 } });
    expect(getStageAttempts(runId, stage).map((attempt) => attempt.providerId)).toEqual(["stub-a", "stub-b"]);
  });

  it.each(["voice-over", "timestamps", "decomposition"] as const)("%s: with no binding it copies the latest attempt's provider, as before", (stage) => {
    const runId = failedStage(stage, "stub-a");
    expect(startNewCycle({ sessionId: runId, stage }, options)).toMatchObject({ started: true, attempt: { providerId: "stub-a" } });
  });

  it("an alignment step whose latest attempt used the native timestamps keeps the native provider", () => {
    const runId = failedStage("timestamps", "elevenlabs-native");
    setBinding("timestamps", runId, "stub-b");
    expect(startNewCycle({ sessionId: runId, stage: "timestamps" }, options)).toMatchObject({ started: true, attempt: { providerId: "elevenlabs-native" } });
  });

  it("automatic retries inside a cycle still copy the previous attempt", () => {
    const runId = randomUUID();
    createRun(runId, "Automatic", "A short script.", "en");
    const first = recordStageAttempt({ runId, stage: "voice-over", providerId: "stub-a", queuedAt: NOW.toISOString(), sentAt: NOW.toISOString() });
    setBinding("voice-over", runId, "stub-b");

    const outcome = recordAttemptOutcome(first.id, { outcome: "transient", errorMessage: "stub: 503" }, options);

    expect(outcome).toMatchObject({ action: "scheduled", next: { providerId: "stub-a", trigger: "automatic" } });
  });
});
