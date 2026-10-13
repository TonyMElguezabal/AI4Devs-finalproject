import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countScenesForRun, createRun, getStageAttempts, resetAll, setRunFailure } from "../src/db.ts";
import { decompositionLauncher, runDecompositionPhase } from "../src/decompositionPhase.ts";
import { getDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { pauseSession, resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { createDecompositionFailure } from "../src/sessionStateMachine.ts";
import { createGatedVoiceProvider, useProvider } from "./voiceTimeoutFixtures.ts";
import { installStubDecompositionDependencies, removeStubDecompositionDependencies, type StubDecompositionCalls } from "./decompositionStubs.ts";
import { narratedSession, NARRATED_SCRIPT } from "./narratedSession.ts";
import { simulateRestart } from "./restartHelpers.ts";

// run-session-end-to-end (JOS-195), design Decision 4 — at boot a narrated session that never started its
// decomposition starts it, and nothing else about boot changes. A restart is simulated with `restartHelpers`.

let stubs: StubDecompositionCalls;

beforeEach(() => {
  resetAll();
  resetVideoStageStartDelayMs();
  setVideoStageStartDelayMs(9_999_999);
  resetImageProviderRegistry();
  setImageProviderRegistry({
    defaultIdentifier: "held-image-adapter",
    adapters: { "held-image-adapter": { generate: () => new Promise(() => {}) } },
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
const decompositionAttempts = (runId: string) => [...getStageAttempts(runId, "timestamps"), ...getStageAttempts(runId, "decomposition")];

describe("a restart pins what boot does today", () => {
  it("does not relaunch the voice-over of a submitted session that has no narration", async () => {
    const provider = createGatedVoiceProvider();
    useProvider(provider);
    const runId = randomUUID();
    createRun(runId, "No narration", NARRATED_SCRIPT, "en");

    simulateRestart();
    await settle();

    expect(provider.calls).toBe(0);
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(0);
    expect(decompositionAttempts(runId)).toHaveLength(0);
  });
});

describe("a restart starts a decomposition that never started", () => {
  it("starts it for a narrated session that is not paused", async () => {
    const runId = narratedSession();

    simulateRestart();

    await waitFor(() => countScenesForRun(runId) > 0);
    expect(stubs.alignCalls).toBe(1);
  });

  it("leaves a paused narrated session waiting for continue", async () => {
    const runId = narratedSession();
    expect(pauseSession(runId).ok).toBe(true);

    simulateRestart();
    await settle();

    expect(decompositionAttempts(runId)).toHaveLength(0);
    expect(decompositionLauncher.heldWork(runId).count).toBe(1);
  });

  it("does not restart a decomposition that failed", async () => {
    const runId = narratedSession();
    setRunFailure(
      runId,
      createDecompositionFailure({ cause: "The system could not divide the script into scenes: stub", retryable: true, occurredAt: new Date(), cycle: 1, attemptsInCycle: 1 }),
    );

    simulateRestart();
    await settle();

    expect(decompositionAttempts(runId)).toHaveLength(0);
    expect(stubs.alignCalls).toBe(0);
  });

  it("keeps the boot rules of a session that already has scenes", async () => {
    const runId = narratedSession();
    expect((await runDecompositionPhase(runId, getDecompositionDependencies())).ok).toBe(true);
    const scenes = countScenesForRun(runId);
    const attempts = decompositionAttempts(runId).length;
    expect(scenes).toBeGreaterThan(0);

    simulateRestart();
    await settle();

    expect(countScenesForRun(runId)).toBe(scenes);
    expect(decompositionAttempts(runId)).toHaveLength(attempts);
  });

  it("starts it once even when boot runs twice", async () => {
    const runId = narratedSession();

    simulateRestart();
    await waitFor(() => decompositionAttempts(runId).length > 0);
    simulateRestart();
    await settle();

    expect(getStageAttempts(runId, "timestamps")).toHaveLength(1);
  });
});
