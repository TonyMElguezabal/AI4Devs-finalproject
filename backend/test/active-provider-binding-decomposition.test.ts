import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { setActiveProvider } from "../src/activeProvider.ts";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import { createRun, getRun, getScenesForRun, getStageAttempts, insertVoiceOver, resetAll, writeArtefactOnce } from "../src/db.ts";
import {
  resetDecompositionDependencies,
  setAlignmentProviderRegistry,
  setDecompositionDependencies,
  setReasoningProviderRegistry,
} from "../src/decompositionDependencies.ts";
import { runDecompositionPhase } from "../src/decompositionPhase.ts";
import { setImageProviderRegistry } from "../src/imageProvider.ts";
import { resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { startNewCycle } from "../src/retry/stageAttemptRecorder.ts";
import type { VisualInstructionGenerator, VisualInstructionResult } from "../src/visualInstructions.ts";
import { heldImageProvider } from "./imageProviderFixtures.ts";

// change-active-provider-from-admin (JOS-171), group 4 — the reasoning and alignment bind points (AC1, AC3, AC5).
// Both bind per session, on the first attempt that calls the provider.

const STEP = 0.25;
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);
const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetDecompositionDependencies();
  setVideoStageStartDelayMs(9_999_999);
  setImageProviderRegistry({ defaultIdentifier: "held", adapters: { held: heldImageProvider() } });
});

/** A narrated session with no native timestamps, so the timestamps step needs the alignment provider. */
function newNarratedSession(): string {
  const runId = randomUUID();
  const { projectFolder } = createRun(runId, "Binding test", SCRIPT, "en");
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

function alignment(answer?: () => AlignmentResult) {
  const calls: string[] = [];
  const provider: AlignmentProvider = {
    async align(_audio, script) {
      calls.push(script);
      return answer ? answer() : { kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP })) };
    },
  };
  return { provider, calls };
}

function generator(answer?: () => VisualInstructionResult) {
  const calls: Array<readonly string[]> = [];
  const instance: VisualInstructionGenerator = {
    async generate(texts) {
      calls.push(texts);
      return answer ? answer() : { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
    },
  };
  return { generator: instance, calls };
}

/** `a` is the stage's default, so it is the instance injected through the dependencies; `b` is the other choice. */
function installRegistries(a: { provider: AlignmentProvider; generator: VisualInstructionGenerator }, b: { provider: AlignmentProvider; generator: VisualInstructionGenerator }): void {
  setDecompositionDependencies({ alignmentProvider: a.provider, instructionGenerator: a.generator });
  setAlignmentProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": a.provider, "stub-b": b.provider } });
  setReasoningProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": a.generator, "stub-b": b.generator } });
}

function scheduleAndRelease(runId: string, stage: "timestamps" | "decomposition"): void {
  const started = startNewCycle({ sessionId: runId, stage });
  if (!started.started) throw new Error(`no cycle was started: ${started.reason}`);
  expect(releaseAttempt(started.attempt.id)).toBe("sent");
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("reasoning and alignment binding to the active provider", () => {
  it("AC1: both bind to the providers active at the first attempt and are sent there", async () => {
    const alignA = alignment();
    const alignB = alignment();
    const genA = generator();
    const genB = generator();
    installRegistries({ provider: alignA.provider, generator: genA.generator }, { provider: alignB.provider, generator: genB.generator });
    setActiveProvider("alignment", "stub-b");
    setActiveProvider("reasoning", "stub-b");

    const runId = newNarratedSession();
    const result = await runDecompositionPhase(runId, { alignmentProvider: alignA.provider, instructionGenerator: genA.generator });

    expect(result.ok).toBe(true);
    expect(getRun(runId)).toMatchObject({ alignmentProviderId: "stub-b", decompositionProviderId: "stub-b" });
    expect(alignB.calls).toHaveLength(1);
    expect(genB.calls).toHaveLength(1);
    expect(alignA.calls).toHaveLength(0);
    expect(genA.calls).toHaveLength(0);
    expect(getStageAttempts(runId, "timestamps").map((attempt) => attempt.providerId)).toEqual(["stub-b"]);
    expect(getStageAttempts(runId, "decomposition").map((attempt) => attempt.providerId)).toEqual(["stub-b"]);
  });

  it("without a choice both bind to the settings default", async () => {
    const alignA = alignment();
    const genA = generator();
    installRegistries({ provider: alignA.provider, generator: genA.generator }, { provider: alignment().provider, generator: generator().generator });

    const runId = newNarratedSession();
    await runDecompositionPhase(runId, { alignmentProvider: alignA.provider, instructionGenerator: genA.generator });

    expect(getRun(runId)).toMatchObject({ alignmentProviderId: "stub-a", decompositionProviderId: "stub-a" });
    expect(getScenesForRun(runId).length).toBeGreaterThan(0);
  });

  it("AC3 and AC5: a bound session keeps its alignment provider for a retry after the change, and nothing goes to the new one", async () => {
    const alignA = alignment(() => ({ kind: "failed_transient", reason: "alignment answered HTTP 503" }));
    const alignB = alignment();
    const genA = generator();
    installRegistries({ provider: alignA.provider, generator: genA.generator }, { provider: alignB.provider, generator: generator().generator });
    const runId = newNarratedSession();
    await runDecompositionPhase(runId, { alignmentProvider: alignA.provider, instructionGenerator: genA.generator });
    expect(getRun(runId)!.alignmentProviderId).toBe("stub-a");

    setActiveProvider("alignment", "stub-b");
    scheduleAndRelease(runId, "timestamps");
    await waitFor(() => alignA.calls.length === 2);

    expect(alignB.calls).toHaveLength(0);
  });

  it("AC3: a bound session keeps its reasoning provider for a retry after the change, and nothing goes to the new one", async () => {
    const alignA = alignment();
    const genA = generator(() => ({ kind: "failed_transient", reason: "the reasoning provider answered HTTP 503" }));
    const genB = generator();
    installRegistries({ provider: alignA.provider, generator: genA.generator }, { provider: alignment().provider, generator: genB.generator });
    const runId = newNarratedSession();
    await runDecompositionPhase(runId, { alignmentProvider: alignA.provider, instructionGenerator: genA.generator });
    expect(getRun(runId)!.decompositionProviderId).toBe("stub-a");

    setActiveProvider("reasoning", "stub-b");
    scheduleAndRelease(runId, "decomposition");
    await waitFor(() => genA.calls.length === 2);

    expect(genB.calls).toHaveLength(0);
  });
});
