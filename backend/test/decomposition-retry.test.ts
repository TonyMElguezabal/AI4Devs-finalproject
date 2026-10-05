import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import { createRun, getRun, getScenesForRun, getStageAttempts, insertVoiceOver, resetAll, setRunFailure, writeArtefactOnce } from "../src/db.ts";
import { retryDecomposition } from "../src/decompositionRetry.ts";
import { resetDecompositionDependencies, setDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { decompositionLauncher, segmentStoredTimestamps } from "../src/decompositionPhase.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { continueSession, pauseSession, resetVideoStageStartDelayMs, setVideoStageStartDelayMs, toSnapshot } from "../src/orchestrator.ts";
import { NOT_YET_LAUNCHABLE } from "../src/launchGate.ts";
import { createVoiceOverFailure } from "../src/sessionStateMachine.ts";
import type { StageAttempt } from "../src/types.ts";
import type { VisualInstructionGenerator, VisualInstructionResult } from "../src/visualInstructions.ts";

// retry-decomposition (JOS-156), group 3 — design Decisions 2 and 7: the order
// of the refusals, that a refusal calls no provider, that two back-to-back
// calls open one cycle, and the step the retry schedules.

const STEP = 0.25;
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);
const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";

const providerCalls = { align: 0, generate: 0 };

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetImageProviderRegistry();
  resetDecompositionDependencies();
  setVideoStageStartDelayMs(9_999_999);
  setImageProviderRegistry({
    defaultIdentifier: "held-image-adapter",
    adapters: { "held-image-adapter": { generate: () => new Promise(() => {}) } },
  });
  providerCalls.align = 0;
  providerCalls.generate = 0;
});

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function newNarratedSession(withNative = false): string {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, "Retry test", SCRIPT, "en");
  writeArtefactOnce(projectFolder, "voice-over.mp3", MP3);
  if (withNative) {
    const characters = [...SCRIPT];
    writeArtefactOnce(
      projectFolder,
      "voice-over.timestamps.json",
      JSON.stringify({
        audio_base64: "ignored",
        alignment: {
          characters,
          character_start_times_seconds: characters.map((_, i) => i * STEP),
          character_end_times_seconds: characters.map((_, i) => (i + 1) * STEP),
        },
      }),
    );
  }
  insertVoiceOver({
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: withNative ? "voice-over.timestamps.json" : null,
    durationSeconds: SCRIPT.length * STEP,
    sizeBytes: MP3.length,
    nativeTimestampsAvailable: withNative,
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
  });
  return runId;
}

function alignmentAnswering(answer?: (script: string) => AlignmentResult): AlignmentProvider {
  return {
    async align(_audio, script) {
      providerCalls.align += 1;
      return answer
        ? answer(script)
        : { kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP })) };
    },
  };
}

function generatorAnswering(answer?: (texts: readonly string[]) => VisualInstructionResult): VisualInstructionGenerator {
  return {
    async generate(texts) {
      providerCalls.generate += 1;
      return answer ? answer(texts) : { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    },
  };
}

const transientAlignment = (): AlignmentResult => ({ kind: "failed_transient", reason: "alignment answered HTTP 503" });
const refusedAlignment = (): AlignmentResult => ({ kind: "failed_not_retryable", reason: "alignment answered HTTP 401" });
const transientInstructions = (): VisualInstructionResult => ({ kind: "failed_transient", reason: "the reasoning provider answered HTTP 503" });

/** Installs the providers the retry will use, and resets the call counters so a refusal can assert nothing was called. */
function useRetryProviders(
  alignment: AlignmentProvider = alignmentAnswering(),
  generator: VisualInstructionGenerator = generatorAnswering(),
): void {
  setDecompositionDependencies({ alignmentProvider: alignment, instructionGenerator: generator });
  providerCalls.align = 0;
  providerCalls.generate = 0;
}

/** A session that failed in its timestamps step. */
async function failTimestamps(answer: () => AlignmentResult = transientAlignment): Promise<string> {
  const runId = newNarratedSession();
  await obtainNarrationTimestamps(runId, alignmentAnswering(answer));
  expect(failedPhaseOf(runId)).toBe("decomposition");
  return runId;
}

/** A session that failed in its division step, with its timestamps stored. */
async function failDivision(answer: () => VisualInstructionResult = transientInstructions): Promise<string> {
  const runId = newNarratedSession();
  expect((await obtainNarrationTimestamps(runId, alignmentAnswering())).ok).toBe(true);
  await segmentStoredTimestamps(runId, generatorAnswering(answer));
  expect(failedPhaseOf(runId)).toBe("decomposition");
  return runId;
}

function failedPhaseOf(runId: string): string | undefined {
  const session = toSnapshot(runId)?.session;
  return session?.state === "failed" ? session.failedPhase : undefined;
}

function scheduledAttempts(runId: string): StageAttempt[] {
  return [...getStageAttempts(runId, "timestamps"), ...getStageAttempts(runId, "decomposition")].filter((attempt) => attempt.outcome === "scheduled");
}

function attemptCount(runId: string): number {
  return getStageAttempts(runId, "timestamps").length + getStageAttempts(runId, "decomposition").length;
}

describe("Refusals call no provider (3.1)", () => {
  it("refuses an unknown session as not found", () => {
    expect(retryDecomposition(randomUUID())).toEqual({ ok: false, reason: "session-not-found" });
  });

  it("refuses a session that has not failed, with not-failed-in-decomposition", async () => {
    const runId = newNarratedSession();
    useRetryProviders();

    expect(retryDecomposition(runId)).toEqual({ ok: false, reason: "not-failed-in-decomposition" });

    expect(providerCalls).toEqual({ align: 0, generate: 0 });
    expect(attemptCount(runId)).toBe(0);
  });

  it("refuses a session that failed in voice-over, with not-failed-in-decomposition", () => {
    const runId = randomUUID();
    createRun(runId, "Voice failure", SCRIPT, "en");
    setRunFailure(runId, createVoiceOverFailure({ cause: "the voice provider failed", retryable: true, occurredAt: new Date() }));
    useRetryProviders();

    expect(retryDecomposition(runId)).toEqual({ ok: false, reason: "not-failed-in-decomposition" });
    expect(providerCalls).toEqual({ align: 0, generate: 0 });
  });

  it("refuses a session that already has chunks, with already-registered", async () => {
    const runId = newNarratedSession(true);
    expect((await obtainNarrationTimestamps(runId, alignmentAnswering())).ok).toBe(true);
    expect((await segmentStoredTimestamps(runId, generatorAnswering())).ok).toBe(true);
    useRetryProviders();
    const attemptsBefore = attemptCount(runId);

    expect(retryDecomposition(runId)).toEqual({ ok: false, reason: "already-registered" });

    expect(providerCalls).toEqual({ align: 0, generate: 0 });
    expect(attemptCount(runId)).toBe(attemptsBefore);
    expect(getScenesForRun(runId)).toHaveLength(2);
  });

  it("refuses a not-retryable failure, with not-retryable, and opens no cycle", async () => {
    const runId = await failTimestamps(refusedAlignment);
    useRetryProviders();
    const attemptsBefore = attemptCount(runId);

    expect(retryDecomposition(runId)).toEqual({ ok: false, reason: "not-retryable" });

    expect(providerCalls).toEqual({ align: 0, generate: 0 });
    expect(attemptCount(runId)).toBe(attemptsBefore);
    expect(failedPhaseOf(runId)).toBe("decomposition");
  });

  it("refuses a second retry with retry-already-pending, and calls no provider for it", async () => {
    const runId = await failDivision();
    useRetryProviders();
    pauseSession(runId);

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: true });
    expect(retryDecomposition(runId)).toEqual({ ok: false, reason: "retry-already-pending" });

    expect(providerCalls).toEqual({ align: 0, generate: 0 });
    expect(scheduledAttempts(runId)).toHaveLength(1);
  });

  it("opens exactly one cycle for two calls made back to back", async () => {
    const runId = await failDivision();
    useRetryProviders();

    const results = [retryDecomposition(runId), retryDecomposition(runId)];

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "retry-already-pending" }]);
    expect(Math.max(...getStageAttempts(runId, "decomposition").map((attempt) => attempt.cycle))).toBe(2);
  });
});

describe("Acceptance (3.1)", () => {
  it("accepts a retry after a retryable division failure, divides the same script and clears the failure", async () => {
    const runId = await failDivision();
    useRetryProviders();

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: false });

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(getRun(runId)?.failure).toBeNull();
    expect(getRun(runId)?.script).toBe(SCRIPT);
    expect(providerCalls).toEqual({ align: 0, generate: 1 });
  });

  it("accepts a retry after a retryable timestamps failure, obtains the timestamps and divides", async () => {
    const runId = await failTimestamps();
    useRetryProviders();

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: false });

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(getRun(runId)?.failure).toBeNull();
    expect(providerCalls).toEqual({ align: 1, generate: 1 });
  });
});

describe("The step the retry schedules (3.2)", () => {
  it("schedules a timestamps attempt in cycle 2 when no timestamps are stored", async () => {
    const runId = await failTimestamps();
    useRetryProviders();
    pauseSession(runId);

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: true });

    expect(scheduledAttempts(runId).map((attempt) => ({ stage: attempt.stage, cycle: attempt.cycle, trigger: attempt.trigger }))).toEqual([
      { stage: "timestamps", cycle: 2, trigger: "manual" },
    ]);
  });

  it("schedules a decomposition attempt in cycle 2 when the timestamps are stored", async () => {
    const runId = await failDivision();
    useRetryProviders();
    pauseSession(runId);

    expect(retryDecomposition(runId)).toEqual({ ok: true, held: true });

    expect(scheduledAttempts(runId).map((attempt) => ({ stage: attempt.stage, cycle: attempt.cycle, trigger: attempt.trigger }))).toEqual([
      { stage: "decomposition", cycle: 2, trigger: "manual" },
    ]);
  });
});

describe("The launcher and the pause (5.1)", () => {
  it("registers a decomposition launcher, so the stage is no longer not-yet-launchable", () => {
    expect(decompositionLauncher.stage).toBe("decomposition");
    expect(NOT_YET_LAUNCHABLE.has("decomposition")).toBe(false);
  });

  it("counts a paused retry as one held decomposition unit, and none for a session with nothing scheduled", async () => {
    const failed = await failDivision();
    useRetryProviders();
    pauseSession(failed);
    expect(decompositionLauncher.heldWork(failed).count).toBe(0);

    retryDecomposition(failed);

    expect(decompositionLauncher.heldWork(failed).count).toBe(1);
    expect(toSnapshot(failed)?.session.held).toEqual([{ stage: "decomposition", count: 1 }]);
    expect(toSnapshot(failed)?.session.phases.find((phase) => phase.phase === "decomposition")?.heldCount).toBe(1);
  });

  it("counts no held work once chunks exist", async () => {
    const runId = newNarratedSession(true);
    await obtainNarrationTimestamps(runId, alignmentAnswering());
    await segmentStoredTimestamps(runId, generatorAnswering());
    pauseSession(runId);

    expect(decompositionLauncher.heldWork(runId).count).toBe(0);
  });

  it("holds the retry's providers while paused, and continue launches it exactly once", async () => {
    const runId = await failDivision();
    useRetryProviders();
    pauseSession(runId);
    retryDecomposition(runId);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(providerCalls).toEqual({ align: 0, generate: 0 });

    continueSession(runId);
    continueSession(runId);

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(providerCalls).toEqual({ align: 0, generate: 1 });
    expect(decompositionLauncher.heldWork(runId).count).toBe(0);
  });
});

describe("The derived state around a retry (5.2, design Decision 6)", () => {
  it("derives chunk-decomposing while a timestamps retry is held, and then while it is in flight", async () => {
    const runId = await failTimestamps();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    useRetryProviders({ align: async () => (await gate, { kind: "failed_transient", reason: "late" }) });
    pauseSession(runId);

    retryDecomposition(runId);
    expect(toSnapshot(runId)?.session.state).toBe("chunk-decomposing");

    continueSession(runId);
    await waitFor(() => getStageAttempts(runId, "timestamps").some((attempt) => attempt.outcome === "in-flight"));
    expect(toSnapshot(runId)?.session.state).toBe("chunk-decomposing");
    release();
  });

  it("derives chunk-decomposing while a division retry is held, and then while it is in flight", async () => {
    const runId = await failDivision();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    useRetryProviders(alignmentAnswering(), { generate: async () => (await gate, transientInstructions()) });
    pauseSession(runId);

    retryDecomposition(runId);
    expect(toSnapshot(runId)?.session.state).toBe("chunk-decomposing");

    continueSession(runId);
    await waitFor(() => getStageAttempts(runId, "decomposition").some((attempt) => attempt.outcome === "in-flight"));
    expect(toSnapshot(runId)?.session.state).toBe("chunk-decomposing");
    release();
  });

  it("derives failed with the new cause when the retry's cycle fails", async () => {
    const runId = await failDivision();
    const before = getRun(runId)!.failure!;
    useRetryProviders(alignmentAnswering(), generatorAnswering(() => ({ kind: "failed_transient", reason: "the reasoning provider answered HTTP 502" })));

    retryDecomposition(runId);

    await waitFor(() => toSnapshot(runId)?.session.state === "failed");
    const failure = getRun(runId)!.failure!;
    expect(failure.cause).toContain("502");
    expect(failure.cause).not.toBe(before.cause);
    expect(failure).toMatchObject({ phase: "decomposition", cycle: 2 });
  });
});
