import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bindSceneImageProvider,
  createRun,
  createScene,
  getRun,
  getScene,
  getStageAttempts,
  insertVoiceOver,
  markSceneInFlight,
  recordStageAttempt,
  resetAll,
  setRunFailure,
  writeArtefactOnce,
} from "../src/db.ts";
import { RETRY_BUDGET, toSnapshot } from "../src/orchestrator.ts";
import { createDecompositionFailure } from "../src/sessionStateMachine.ts";
import "../src/voiceOverPhase.ts"; // registers the voice-over timeout handler and launcher, as the running app does
import "../src/decompositionPhase.ts"; // registers the decomposition launcher
import type { AttemptStage } from "../src/types.ts";
import { simulateRestart } from "./restartHelpers.ts";

// preserve-progress-across-restarts (JOS-160), spec restart-recovery — "Interrupted requests are awaited or
// recorded as failed attempts": what a restart does with each attempt left in flight.

const RESTART_CAUSE = "interrupted by a restart";
const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";

beforeEach(() => {
  resetAll();
});

/** A session with its voice-over stored, as every decomposition step requires. */
function narratedSession(): string {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, "Settle test", SCRIPT, "en");
  writeArtefactOnce(projectFolder, "voice-over.mp3", Buffer.from([0x49, 0x44, 0x33, 0x04]));
  insertVoiceOver({
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: null,
    durationSeconds: 10,
    sizeBytes: 4,
    nativeTimestampsAvailable: false,
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
  });
  return runId;
}

function leaveInFlight(runId: string, stage: AttemptStage, secondsAgo = 1): void {
  const sentAt = new Date(Date.now() - secondsAgo * 1000).toISOString();
  recordStageAttempt({ runId, stage, providerId: stage === "assembly" ? null : "stub", queuedAt: sentAt, sentAt });
}

describe("Image requests lost at a restart (3.1)", () => {
  it("an exhausted attempt becomes failed instead of being retried", () => {
    const runId = randomUUID();
    createRun(runId, "Exhausted", SCRIPT, "en");
    const sceneId = randomUUID();
    createScene(sceneId, runId, 1, "success", 100, "scene 1");
    bindSceneImageProvider(sceneId, "bound-image-adapter");
    markSceneInFlight(sceneId, "req-1", 1 + RETRY_BUDGET);

    simulateRestart();

    expect(getScene(sceneId)!.status).toBe("failed");
    expect(getScene(sceneId)!.attempts).toBe(1 + RETRY_BUDGET);
  });
});

describe("Voice-over attempts lost at a restart (3.2, JOS-185)", () => {
  it("an in-flight voice-over attempt is timed out by the startup sweep and its retry is scheduled", () => {
    const runId = randomUUID();
    createRun(runId, "Voice", SCRIPT, "en");
    leaveInFlight(runId, "voice-over", 60);

    simulateRestart();

    const outcomes = getStageAttempts(runId, "voice-over").map((attempt) => attempt.outcome);
    expect(outcomes).toEqual(["timed-out", "scheduled"]);
  });
});

describe("Timestamps and instruction attempts lost at a restart (3.3)", () => {
  it.each(["timestamps", "decomposition"] as const)("an in-flight %s attempt is completed as transient and the session records a retryable decomposition failure", (stage) => {
    const runId = narratedSession();
    leaveInFlight(runId, stage);
    if (stage === "timestamps") expect(toSnapshot(runId)?.session.state).toBe("chunk-decomposing");

    simulateRestart();

    const [attempt] = getStageAttempts(runId, stage);
    expect(attempt!.outcome).toBe("transient");
    expect(attempt!.errorMessage).toContain(RESTART_CAUSE);
    const session = toSnapshot(runId)!.session;
    expect(session.state).toBe("failed");
    expect(session.state === "failed" && session.failedPhase).toBe("decomposition");
    expect(getRun(runId)!.failure).toMatchObject({ phase: "decomposition", retryable: true });
  });
});

describe("An interrupted decomposition attempt that no longer matters (3.3)", () => {
  it("keeps the failure the session already records, and still completes the attempt", () => {
    const runId = narratedSession();
    const existing = createDecompositionFailure({ cause: "The narration's timestamps could not be obtained: alignment answered HTTP 401.", retryable: false, occurredAt: new Date() });
    setRunFailure(runId, existing);
    leaveInFlight(runId, "timestamps");

    simulateRestart();

    expect(getStageAttempts(runId, "timestamps")[0]!.outcome).toBe("transient");
    expect(getRun(runId)!.failure).toEqual(existing);
  });

  it("records no failure for a session whose chunks are already registered", () => {
    const runId = narratedSession();
    createScene(randomUUID(), runId, 1, "success", 100, "scene 1");
    leaveInFlight(runId, "decomposition");

    simulateRestart();

    expect(getStageAttempts(runId, "decomposition")[0]!.outcome).toBe("transient");
    expect(getRun(runId)!.failure).toBeNull();
  });
});

describe("Assembly attempts lost at a restart (3.4)", () => {
  it("an in-flight assembly attempt is completed as transient with the restart cause", () => {
    const runId = randomUUID();
    createRun(runId, "Assembly", SCRIPT, "en");
    leaveInFlight(runId, "assembly");

    simulateRestart();

    const [attempt] = getStageAttempts(runId, "assembly");
    expect(attempt!.outcome).toBe("transient");
    expect(attempt!.errorMessage).toContain(RESTART_CAUSE);
  });
});
