import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRun, countScenesForRun, getStageAttempts, recordStageAttempt, resetAll, setRunFailure } from "../src/db.ts";
import { decompositionLauncher, launchDecompositionFor } from "../src/decompositionPhase.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { continueSession, pauseSession, resetVideoStageStartDelayMs, setVideoStageStartDelayMs, toSnapshot } from "../src/orchestrator.ts";
import { createDecompositionFailure } from "../src/sessionStateMachine.ts";
import { narratedSession, NARRATED_SCRIPT } from "./narratedSession.ts";
import { installStubDecompositionDependencies, removeStubDecompositionDependencies, type StubDecompositionCalls } from "./decompositionStubs.ts";
import { heldImageProvider } from "./imageProviderFixtures.ts";

// run-session-end-to-end (JOS-195), design Decisions 1-2 — the decomposition launcher gains the "waiting after the
// narration" term, so the gate's pause, continue and held-work reporting cover the first start too.

let stubs: StubDecompositionCalls;

beforeEach(() => {
  resetAll();
  resetVideoStageStartDelayMs();
  // Decomposition ends by launching the image stage; hold it so these tests stop at the decomposition boundary.
  setVideoStageStartDelayMs(9_999_999);
  resetImageProviderRegistry();
  setImageProviderRegistry({
    defaultIdentifier: "held-image-adapter",
    adapters: { "held-image-adapter": heldImageProvider() },
  });
  stubs = installStubDecompositionDependencies();
});

afterEach(() => {
  removeStubDecompositionDependencies();
});

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function decompositionAttempts(runId: string) {
  return [...getStageAttempts(runId, "timestamps"), ...getStageAttempts(runId, "decomposition")];
}

describe("decompositionLauncher.heldWork: waiting after the narration", () => {
  it("counts one unit for a narrated session with no scenes, no failure and no decomposition attempt", () => {
    const runId = narratedSession();

    expect(decompositionLauncher.heldWork(runId).count).toBe(1);
  });

  it("counts nothing for a session without a stored narration", () => {
    const runId = randomUUID();
    createRun(runId, "No narration", NARRATED_SCRIPT, "en");

    expect(decompositionLauncher.heldWork(runId).count).toBe(0);
  });

  it("counts nothing once the session has a failure", () => {
    const runId = narratedSession();
    setRunFailure(
      runId,
      createDecompositionFailure({ cause: "The narration's timestamps could not be obtained: stub", retryable: true, occurredAt: new Date(), cycle: 1, attemptsInCycle: 1 }),
    );

    expect(decompositionLauncher.heldWork(runId).count).toBe(0);
  });

  it("counts nothing once a decomposition attempt exists, whatever its outcome", () => {
    const runId = narratedSession();
    const at = new Date().toISOString();
    recordStageAttempt({ runId, stage: "timestamps", providerId: "alignment", queuedAt: at, sentAt: at });

    expect(decompositionLauncher.heldWork(runId).count).toBe(0);
  });
});

describe("launchDecompositionFor", () => {
  it("runs the decomposition for a waiting session and registers its scenes", async () => {
    const runId = narratedSession();

    launchDecompositionFor(runId);

    await waitFor(() => countScenesForRun(runId) > 0);
    expect(stubs.alignCalls).toBe(1);
    expect(stubs.generateCalls).toBe(1);
    expect(decompositionAttempts(runId).length).toBeGreaterThan(0);
  });

  it("starts nothing for a paused session, which keeps its held decomposition unit", async () => {
    const runId = narratedSession();
    expect(pauseSession(runId).ok).toBe(true);

    launchDecompositionFor(runId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(stubs.alignCalls).toBe(0);
    expect(countScenesForRun(runId)).toBe(0);
    expect(decompositionLauncher.heldWork(runId).count).toBe(1);
  });

  it("is started by continue after a pause", async () => {
    const runId = narratedSession();
    pauseSession(runId);

    expect(continueSession(runId).ok).toBe(true);

    await waitFor(() => countScenesForRun(runId) > 0);
    expect(stubs.alignCalls).toBe(1);
  });

  it("starts nothing for a session that already failed", async () => {
    const runId = narratedSession();
    setRunFailure(
      runId,
      createDecompositionFailure({ cause: "The system could not divide the script into scenes: stub", retryable: true, occurredAt: new Date(), cycle: 1, attemptsInCycle: 1 }),
    );

    launchDecompositionFor(runId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(stubs.alignCalls).toBe(0);
    expect(decompositionAttempts(runId)).toHaveLength(0);
  });

  it("adds no second run when triggered again", async () => {
    const runId = narratedSession();
    launchDecompositionFor(runId);
    await waitFor(() => countScenesForRun(runId) > 0);
    const attemptsAfterFirst = decompositionAttempts(runId).length;

    launchDecompositionFor(runId);
    launchDecompositionFor(runId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(stubs.alignCalls).toBe(1);
    expect(stubs.generateCalls).toBe(1);
    expect(decompositionAttempts(runId)).toHaveLength(attemptsAfterFirst);
  });

  it("publishes the decomposition to the session read without any request from the user", async () => {
    const runId = narratedSession();
    expect(toSnapshot(runId)?.session.state).toBe("voice-over-complete");

    launchDecompositionFor(runId);

    await waitFor(() => toSnapshot(runId)?.session.state !== "voice-over-complete");
    expect(["chunk-decomposing", "chunks-processing"]).toContain(toSnapshot(runId)?.session.state);
  });
});
