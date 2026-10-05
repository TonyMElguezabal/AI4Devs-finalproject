import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import { createRun, getRun, getScenesForRun, getStageAttempts, insertVoiceOver, resetAll, writeArtefactOnce } from "../src/db.ts";
import {
  getDecompositionDependencies,
  resetDecompositionDependencies,
  setDecompositionDependencies,
} from "../src/decompositionDependencies.ts";
import { segmentStoredTimestamps } from "../src/decompositionPhase.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { startNewCycle } from "../src/retry/stageAttemptRecorder.ts";
import type { VisualInstructionGenerator, VisualInstructionResult } from "../src/visualInstructions.ts";

// retry-decomposition (JOS-156), group 2 — design Decision 4: the providers
// registry, and the attempt senders that run a scheduled `timestamps` or
// `decomposition` attempt on the configured providers.

const STEP = 0.25;
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);
const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";

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
});

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** A narrated session with no native timestamps, so the timestamps step needs the alignment provider. */
function newNarratedSession(): string {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, "Sender test", SCRIPT, "en");
  writeArtefactOnce(projectFolder, "voice-over.mp3", MP3);
  insertVoiceOver({
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: null,
    durationSeconds: SCRIPT.length * STEP,
    sizeBytes: MP3.length,
    nativeTimestampsAvailable: false,
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
  });
  return runId;
}

function alignment(answer?: (script: string) => AlignmentResult) {
  const calls: string[] = [];
  const provider: AlignmentProvider = {
    async align(_audio, script) {
      calls.push(script);
      return answer
        ? answer(script)
        : { kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP })) };
    },
  };
  return { provider, calls };
}

function generator(answer?: (texts: readonly string[]) => VisualInstructionResult) {
  const calls: Array<readonly string[]> = [];
  const instance: VisualInstructionGenerator = {
    async generate(texts) {
      calls.push(texts);
      return answer ? answer(texts) : { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    },
  };
  return { generator: instance, calls };
}

const transientAlignment = (): AlignmentResult => ({ kind: "failed_transient", reason: "alignment answered HTTP 503" });
const transientInstructions = (): VisualInstructionResult => ({ kind: "failed_transient", reason: "the reasoning provider answered HTTP 503" });

/** Schedules the manual retry's attempt and releases it, as the retry service will. */
function scheduleAndRelease(runId: string, stage: "timestamps" | "decomposition"): void {
  const started = startNewCycle({ sessionId: runId, stage });
  if (!started.started) throw new Error(`no cycle was started: ${started.reason}`);
  expect(releaseAttempt(started.attempt.id)).toBe("sent");
}

describe("The decomposition dependencies registry", () => {
  it("defaults to the real alignment provider and instruction generator", () => {
    const dependencies = getDecompositionDependencies();
    expect(typeof dependencies.alignmentProvider.align).toBe("function");
    expect(typeof dependencies.instructionGenerator.generate).toBe("function");
  });

  it("returns what a test installed, and the defaults again after a reset", () => {
    const stub = { alignmentProvider: alignment().provider, instructionGenerator: generator().generator };
    setDecompositionDependencies(stub);
    expect(getDecompositionDependencies()).toBe(stub);

    resetDecompositionDependencies();
    expect(getDecompositionDependencies()).not.toBe(stub);
  });
});

describe("The attempt senders (2.3)", () => {
  it("runs a scheduled decomposition attempt on the configured generator and completes that attempt", async () => {
    const runId = newNarratedSession();
    expect((await obtainNarrationTimestamps(runId, alignment().provider)).ok).toBe(true);
    await segmentStoredTimestamps(runId, generator(transientInstructions).generator);
    const configured = generator();
    setDecompositionDependencies({ alignmentProvider: alignment().provider, instructionGenerator: configured.generator });

    scheduleAndRelease(runId, "decomposition");

    await waitFor(() => getScenesForRun(runId).length === 2);
    const attempts = getStageAttempts(runId, "decomposition");
    expect(attempts.map((attempt) => ({ cycle: attempt.cycle, trigger: attempt.trigger, outcome: attempt.outcome }))).toEqual([
      { cycle: 1, trigger: "initial", outcome: "transient" },
      { cycle: 2, trigger: "manual", outcome: "success" },
    ]);
    expect(configured.calls).toHaveLength(1);
    expect(getRun(runId)?.failure).toBeNull();
  });

  it("runs a scheduled timestamps attempt on the configured alignment provider, then divides in the same cycle", async () => {
    const runId = newNarratedSession();
    await obtainNarrationTimestamps(runId, alignment(transientAlignment).provider);
    const aligner = alignment();
    const divider = generator();
    setDecompositionDependencies({ alignmentProvider: aligner.provider, instructionGenerator: divider.generator });

    scheduleAndRelease(runId, "timestamps");

    await waitFor(() => getScenesForRun(runId).length === 2);
    expect(aligner.calls).toEqual([SCRIPT]);
    expect(divider.calls).toHaveLength(1);
    expect(getStageAttempts(runId, "timestamps").map((attempt) => ({ cycle: attempt.cycle, outcome: attempt.outcome }))).toEqual([
      { cycle: 1, outcome: "transient" },
      { cycle: 2, outcome: "success" },
    ]);
    expect(getStageAttempts(runId, "decomposition").map((attempt) => ({ cycle: attempt.cycle, outcome: attempt.outcome }))).toEqual([
      { cycle: 2, outcome: "success" },
    ]);
  });

  it("stops after a failing timestamps retry and does not divide", async () => {
    const runId = newNarratedSession();
    await obtainNarrationTimestamps(runId, alignment(transientAlignment).provider);
    const divider = generator();
    setDecompositionDependencies({ alignmentProvider: alignment(transientAlignment).provider, instructionGenerator: divider.generator });

    scheduleAndRelease(runId, "timestamps");

    await waitFor(() => getStageAttempts(runId, "timestamps").every((attempt) => attempt.outcome !== "in-flight" && attempt.outcome !== "scheduled"));
    expect(divider.calls).toHaveLength(0);
    expect(getRun(runId)?.failure).toMatchObject({ phase: "decomposition", cycle: 2, attemptsInCycle: 1 });
  });
});
