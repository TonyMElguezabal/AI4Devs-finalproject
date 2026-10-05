import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import { createRun, getRun, getScenesForRun, getStageAttempts, insertVoiceOver, resetAll, setRunFailure, writeArtefactOnce } from "../src/db.ts";
import { retryDecomposition } from "../src/decompositionRetry.ts";
import { resetDecompositionDependencies, setDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { segmentStoredTimestamps } from "../src/decompositionPhase.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { pauseSession, resetVideoStageStartDelayMs, setVideoStageStartDelayMs, toSnapshot } from "../src/orchestrator.ts";
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
