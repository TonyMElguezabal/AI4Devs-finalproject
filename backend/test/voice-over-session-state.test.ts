import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeStageAttempt,
  createRun,
  getRun,
  getStageAttempts,
  startVoiceAttempt,
  insertVoiceOver,
  recordStageAttempt,
  resetAll,
  setRunFailure,
} from "../src/db.ts";
import { deriveSessionState, toSnapshot } from "../src/orchestrator.ts";
import { createDecompositionFailure, createVoiceOverFailure } from "../src/sessionStateMachine.ts";

// generate-voice-over (JOS-136), task 5.15 and Decision 12 — the session's
// voice-over states are derived from the records, never stored: an in-flight
// attempt is voice-over-generating, a voice-over record is voice-over-complete,
// a stored failure is failed, and nothing at all is submitted.

beforeEach(() => {
  resetAll();
});

describe("deriveSessionState with voice-over records", () => {
  it("is submitted with no records", () => {
    expect(deriveSessionState([], null, {})).toEqual({ state: "submitted" });
  });

  it("is voice-over-generating while a voice attempt is in flight", () => {
    expect(deriveSessionState([], null, { voiceAttemptInFlight: true })).toEqual({ state: "voice-over-generating" });
  });

  it("is voice-over-complete once the voice-over exists", () => {
    expect(deriveSessionState([], null, { hasVoiceOver: true })).toEqual({ state: "voice-over-complete" });
  });

  it("is failed in the voice-over phase when the session carries that failure", () => {
    const failure = createVoiceOverFailure({ cause: "rejected", retryable: false, occurredAt: new Date() });
    expect(deriveSessionState([], failure, {})).toEqual({ state: "failed", failedPhase: "voice-over" });
  });

  it("a failure wins over a stale in-flight attempt", () => {
    const failure = createVoiceOverFailure({ cause: "rejected", retryable: false, occurredAt: new Date() });
    expect(deriveSessionState([], failure, { voiceAttemptInFlight: true })).toEqual({ state: "failed", failedPhase: "voice-over" });
  });

  it("a later failure keeps its own phase beside an existing voice-over", () => {
    const failure = createDecompositionFailure({ cause: "bad split", retryable: false, occurredAt: new Date() });
    expect(deriveSessionState([], failure, { hasVoiceOver: true })).toEqual({ state: "failed", failedPhase: "decomposition" });
  });

  it("the timestamps stage wins over the completed voice-over", () => {
    expect(deriveSessionState([], null, { hasVoiceOver: true, timestampsStarted: true })).toEqual({ state: "chunk-decomposing" });
  });

  it("a completed voice-over wins over an in-flight attempt record", () => {
    expect(deriveSessionState([], null, { hasVoiceOver: true, voiceAttemptInFlight: true })).toEqual({ state: "voice-over-complete" });
  });
});

describe("toSnapshot reads the records", () => {
  function newRunId(): string {
    const runId = randomUUID();
    createRun(runId, "State test", "A script.", "en");
    return runId;
  }

  function startAttempt(runId: string) {
    const now = new Date().toISOString();
    return recordStageAttempt({ runId, stage: "voice-over", providerId: "stub-voice", queuedAt: now, sentAt: now });
  }

  it("derives each state from the stored records, in order", () => {
    const runId = newRunId();
    expect(toSnapshot(runId)?.session.state).toBe("submitted");

    const attempt = startAttempt(runId);
    expect(toSnapshot(runId)?.session.state).toBe("voice-over-generating");

    completeStageAttempt(attempt.id, { outcome: "not-retryable", finishedAt: new Date().toISOString() });
    setRunFailure(runId, createVoiceOverFailure({ cause: "rejected", retryable: false, occurredAt: new Date() }));
    expect(toSnapshot(runId)?.session.state).toBe("failed");
    expect(toSnapshot(runId)?.session.failedPhase).toBe("voice-over");
  });

  it("is voice-over-complete once the voice-over is stored, whatever the attempts say", () => {
    const runId = newRunId();
    const attempt = startAttempt(runId);
    completeStageAttempt(attempt.id, { outcome: "success", finishedAt: new Date().toISOString() });
    insertVoiceOver({
      runId,
      audioPath: "voice-over.mp3",
      timestampsPath: null,
      durationSeconds: 3,
      sizeBytes: 100,
      nativeTimestampsAvailable: false,
      providerRequestId: null,
      completedAt: new Date().toISOString(),
    });

    expect(toSnapshot(runId)?.session.state).toBe("voice-over-complete");
  });
});

describe("startVoiceAttempt (Decision 2)", () => {
  it("writes the binding and the in-flight attempt together", () => {
    const runId = randomUUID();
    createRun(runId, "T", "Script.", "en");

    const attempt = startVoiceAttempt({ runId, providerId: "stub-voice", queuedAt: "2026-01-01T00:00:00.000Z", sentAt: "2026-01-01T00:00:01.000Z" });

    expect(attempt.outcome).toBe("in-flight");
    expect(getRun(runId)?.voiceProviderId).toBe("stub-voice");
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
  });

  it("rolls back as a whole when the attempt cannot be recorded", () => {
    const unknownRunId = randomUUID();

    expect(() => startVoiceAttempt({ runId: unknownRunId, providerId: "stub-voice", queuedAt: "x", sentAt: "y" })).toThrow();

    expect(getStageAttempts(unknownRunId, "voice-over")).toEqual([]);

    const runId = randomUUID();
    createRun(runId, "T", "Script.", "en");
    expect(startVoiceAttempt({ runId, providerId: "stub-voice", queuedAt: "x", sentAt: "y" }).outcome).toBe("in-flight");
  });
});
