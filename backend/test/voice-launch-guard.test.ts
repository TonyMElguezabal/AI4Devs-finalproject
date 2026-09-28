import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeStageAttempt,
  createRun,
  createScene,
  insertVoiceOver,
  markSceneFailed,
  recordStageAttempt,
  resetAll,
  setRunFailure,
  type VoiceOverInput,
} from "../src/db.ts";
import { createVoiceOverFailure } from "../src/sessionStateMachine.ts";
import { canLaunchVoiceOver } from "../src/voiceLaunchGuard.ts";

// lock-script-and-narration (JOS-137), group 5 — PRD §4.2, §10.3: a completed
// narration is never regenerated, but a voice attempt that failed before
// producing valid audio may be retried. The decision is read from the
// voice-over RECORD, not from the derived session state: a session can be
// `failed` in a later phase while its narration exists.

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "Guard test", "A short script.", "en");
  return runId;
}

function storeVoiceOver(runId: string): void {
  const voiceOver: VoiceOverInput = {
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: null,
    durationSeconds: 12.5,
    sizeBytes: 200_000,
    nativeTimestampsAvailable: false,
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
  };
  insertVoiceOver(voiceOver);
}

function failVoiceAttempt(runId: string, outcome: "transient" | "not-retryable"): void {
  const attempt = recordStageAttempt({
    runId,
    stage: "voice-over",
    providerId: "elevenlabs",
    queuedAt: "2026-09-28T10:00:00.000Z",
    sentAt: "2026-09-28T10:00:01.000Z",
  });
  completeStageAttempt(attempt.id, { outcome, finishedAt: "2026-09-28T10:00:02.000Z", errorMessage: "provider error" });
  setRunFailure(
    runId,
    createVoiceOverFailure({
      cause: "The voice provider could not narrate the script.",
      retryable: outcome === "transient",
      occurredAt: new Date("2026-09-28T10:00:02.000Z"),
    }),
  );
}

describe("Voice generation may launch when no narration exists (AC3)", () => {
  it("allows a submitted session that has made no voice attempt", () => {
    expect(canLaunchVoiceOver(newRunId())).toEqual({ allowed: true });
  });

  it("allows a session whose voice attempt failed for a not-retryable reason", () => {
    const runId = newRunId();
    failVoiceAttempt(runId, "not-retryable");
    expect(canLaunchVoiceOver(runId)).toEqual({ allowed: true });
  });

  it("allows a session whose voice attempt failed transiently", () => {
    const runId = newRunId();
    failVoiceAttempt(runId, "transient");
    expect(canLaunchVoiceOver(runId)).toEqual({ allowed: true });
  });

  it("allows a session whose provider returned undecodable audio, since no voice-over was stored", () => {
    const runId = newRunId();
    // JOS-136 Decision 7: the attempt is recorded as failed and nothing is stored.
    failVoiceAttempt(runId, "transient");
    expect(canLaunchVoiceOver(runId)).toEqual({ allowed: true });
  });

  it("allows a session whose earlier attempt is still in flight and has no narration yet", () => {
    const runId = newRunId();
    recordStageAttempt({
      runId,
      stage: "voice-over",
      providerId: "elevenlabs",
      queuedAt: "2026-09-28T10:00:00.000Z",
      sentAt: "2026-09-28T10:00:01.000Z",
    });
    expect(canLaunchVoiceOver(runId)).toEqual({ allowed: true });
  });
});

describe("Voice generation does not launch for a completed narration (AC2)", () => {
  it("refuses a session that has a voice-over, as a completed narration", () => {
    const runId = newRunId();
    storeVoiceOver(runId);

    expect(canLaunchVoiceOver(runId)).toEqual({ allowed: false, reason: "narration-complete" });
  });

  it("refuses a session whose narration completed and which later failed in another phase", () => {
    const runId = newRunId();
    storeVoiceOver(runId);
    const sceneId = randomUUID();
    createScene(sceneId, runId, 1, "success", 100);
    markSceneFailed(sceneId, "the image provider failed");

    expect(canLaunchVoiceOver(runId)).toEqual({ allowed: false, reason: "narration-complete" });
  });

  it("refuses a session whose narration completed even if an earlier attempt had failed", () => {
    const runId = newRunId();
    failVoiceAttempt(runId, "transient");
    storeVoiceOver(runId);

    expect(canLaunchVoiceOver(runId)).toEqual({ allowed: false, reason: "narration-complete" });
  });

  it("decides each session from its own record only", () => {
    const completed = newRunId();
    const untouched = newRunId();
    storeVoiceOver(completed);

    expect(canLaunchVoiceOver(completed)).toEqual({ allowed: false, reason: "narration-complete" });
    expect(canLaunchVoiceOver(untouched)).toEqual({ allowed: true });
  });

  it("changes nothing when it decides", () => {
    const runId = newRunId();
    storeVoiceOver(runId);
    canLaunchVoiceOver(runId);
    canLaunchVoiceOver(runId);
    expect(canLaunchVoiceOver(runId)).toEqual({ allowed: false, reason: "narration-complete" });
  });
});
