import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStageAttempts, getVoiceOver, resetAll } from "../src/db.ts";
import { decompositionLauncher } from "../src/decompositionPhase.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { continueSession, pauseSession, resetVideoStageStartDelayMs, setVideoStageStartDelayMs, toSnapshot } from "../src/orchestrator.ts";
import { sweepTimedOutAttempts } from "../src/retry/attemptTimeoutWatcher.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { createStubVoiceProvider } from "../src/voiceProvider.ts";
import { installStubDecompositionDependencies, removeStubDecompositionDependencies } from "./decompositionStubs.ts";
import {
  after,
  register,
  sendFirstAttempt,
  sendScheduledRetry,
  useProvider,
  VOICE_LIMIT_MS,
  waitFor,
} from "./voiceTimeoutFixtures.ts";

// run-session-end-to-end (JOS-195), design Decision 3 — every way a voice-over can be stored hands the session to
// decomposition once, and a failure or a pause does not.

beforeEach(() => {
  resetAll();
  resetVideoStageStartDelayMs();
  // Decomposition ends by launching the image stage; hold it so these tests stop at the decomposition boundary.
  setVideoStageStartDelayMs(9_999_999);
  resetImageProviderRegistry();
  setImageProviderRegistry({
    defaultIdentifier: "held-image-adapter",
    adapters: { "held-image-adapter": { generate: () => new Promise(() => {}) } },
  });
  installStubDecompositionDependencies();
});

afterEach(() => {
  removeStubDecompositionDependencies();
});

const decompositionAttempts = (runId: string) => [...getStageAttempts(runId, "timestamps"), ...getStageAttempts(runId, "decomposition")];
const stateOf = (runId: string) => toSnapshot(runId)?.session.state;
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

describe("the narration hand-off", () => {
  it("starts decomposition once when the first voice-over attempt succeeds", async () => {
    const runId = register();
    useProvider(createStubVoiceProvider("success"));

    await generateVoiceOver(runId);
    await waitFor(() => decompositionAttempts(runId).length > 0);
    await settle();

    expect(getVoiceOver(runId)).toBeTruthy();
    expect(getStageAttempts(runId, "timestamps")).toHaveLength(1);
    expect(stateOf(runId)).not.toBe("voice-over-complete");
  });

  it("starts decomposition once when a retried voice-over attempt succeeds", async () => {
    const runId = register();
    const { provider } = await sendFirstAttempt(runId);
    provider.answer(1, { kind: "failed_transient", reason: "stub: transient voice provider error (503)" });
    await waitFor(() => getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "scheduled"));
    expect(decompositionAttempts(runId)).toHaveLength(0);

    sendScheduledRetry(runId, after(3_600_000));
    await waitFor(() => provider.calls === 2);
    provider.answer(2);

    await waitFor(() => decompositionAttempts(runId).length > 0);
    await settle();
    expect(getStageAttempts(runId, "timestamps")).toHaveLength(1);
  });

  it("starts decomposition once when a late voice-over result is accepted", async () => {
    const runId = register();
    const { provider } = await sendFirstAttempt(runId);
    sweepTimedOutAttempts(after(VOICE_LIMIT_MS + 1));
    expect(getVoiceOver(runId)).toBeFalsy();
    expect(decompositionAttempts(runId)).toHaveLength(0);

    provider.answer(1);

    await waitFor(() => decompositionAttempts(runId).length > 0);
    await settle();
    expect(getVoiceOver(runId)).toBeTruthy();
    expect(getStageAttempts(runId, "timestamps")).toHaveLength(1);
  });

  it("starts nothing when the voice-over fails", async () => {
    const runId = register();
    useProvider(createStubVoiceProvider("not-retryable-failure"));

    await generateVoiceOver(runId);
    await settle();

    expect(getVoiceOver(runId)).toBeFalsy();
    expect(decompositionAttempts(runId)).toHaveLength(0);
    expect(decompositionLauncher.heldWork(runId).count).toBe(0);
  });

  it("waits for continue when the session is paused while the voice-over is in flight", async () => {
    const runId = register();
    const { provider } = await sendFirstAttempt(runId);
    expect(pauseSession(runId).ok).toBe(true);

    provider.answer(1);
    await waitFor(() => Boolean(getVoiceOver(runId)));
    await settle();

    expect(stateOf(runId)).toBe("voice-over-complete");
    expect(decompositionAttempts(runId)).toHaveLength(0);
    expect(decompositionLauncher.heldWork(runId).count).toBe(1);

    expect(continueSession(runId).ok).toBe(true);
    await waitFor(() => decompositionAttempts(runId).length > 0);
  });
});
