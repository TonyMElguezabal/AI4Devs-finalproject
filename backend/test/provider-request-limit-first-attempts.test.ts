import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AlignmentProvider } from "../src/alignmentProvider.ts";
import * as concurrency from "../src/concurrency.ts";
import { createRun, getRun, getScenesForRun, getStageAttempts, insertVoiceOver, resetAll, writeArtefactOnce } from "../src/db.ts";
import { resetDecompositionDependencies } from "../src/decompositionDependencies.ts";
import { runDecompositionPhase } from "../src/decompositionPhase.ts";
import { resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { resetVideoStageStartDelayMs, setVideoStageStartDelayMs, toSnapshot } from "../src/orchestrator.ts";
import { resetScheduler } from "../src/retry/retryScheduler.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { createSilentMp3, setVoiceProviderRegistry, type VoiceProvider, type VoiceSynthesisResult } from "../src/voiceProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// limit-provider-requests-per-stage (JOS-167), group 4 — a first attempt that
// cannot get a slot is recorded `scheduled`, sends nothing and sets no failure;
// it is sent, with `sentAt` stamped then, once a slot is free.

const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";
const STEP = 0.25;

/** A provider call the test finishes by hand. */
function heldCall<T>() {
  let finish!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (finish = resolve));
  return { promise, finish };
}

beforeEach(() => {
  resetAll();
  resetScheduler();
  concurrency.resetAll();
  resetDecompositionDependencies();
  resetImageProviderRegistry();
  resetVideoStageStartDelayMs();
  setVideoStageStartDelayMs(9_999_999);
  setImageProviderRegistry({ defaultIdentifier: "held", adapters: { held: { generate: () => new Promise(() => {}) } } });
});

const registerSession = () => {
  const runId = randomUUID();
  createRun(runId, "Limit test", SCRIPT, "en");
  return runId;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("The voice-over first attempt (4.1)", () => {
  it("waits as a scheduled attempt while the voice stage is full, then is sent with sentAt after queuedAt", async () => {
    concurrency.setLimit("voice", 1);
    const calls: Array<ReturnType<typeof heldCall<VoiceSynthesisResult>>> = [];
    const provider: VoiceProvider = {
      synthesize: () => {
        const call = heldCall<VoiceSynthesisResult>();
        calls.push(call);
        return call.promise;
      },
    };
    setVoiceProviderRegistry({ defaultIdentifier: "slow-voice", adapters: { "slow-voice": provider } });
    const first = registerSession();
    const second = registerSession();

    const firstRun = generateVoiceOver(first);
    await flush();
    const secondRun = generateVoiceOver(second);
    await flush();

    expect(calls).toHaveLength(1);
    expect(getStageAttempts(second, "voice-over")).toEqual([expect.objectContaining({ outcome: "scheduled", trigger: "initial", sentAt: null })]);
    expect(getRun(second)?.failure).toBeNull();
    expect(toSnapshot(second)?.session.state).not.toBe("failed");

    calls[0]!.finish({ kind: "success", audio: createSilentMp3(1) });
    await firstRun;
    await flush();
    expect(calls).toHaveLength(2);
    calls[1]!.finish({ kind: "success", audio: createSilentMp3(1) });
    await secondRun;

    const attempt = getStageAttempts(second, "voice-over")[0]!;
    expect(attempt.outcome).toBe("success");
    expect(attempt.sentAt).not.toBeNull();
    expect(Date.parse(attempt.sentAt!)).toBeGreaterThan(Date.parse(attempt.queuedAt));
    expect(getStageAttempts(second, "voice-over")).toHaveLength(1);
  });
});

describe("Timestamps and decomposition first attempts (4.2)", () => {
  function narratedSession(): string {
    const runId = randomUUID();
    const { projectFolder } = createRun(runId, "Limit test", SCRIPT, "en");
    const mp3 = Buffer.from(createSilentMp3(1));
    writeArtefactOnce(projectFolder, "voice-over.mp3", mp3);
    insertVoiceOver({
      runId,
      audioPath: "voice-over.mp3",
      timestampsPath: null,
      durationSeconds: SCRIPT.length * STEP,
      sizeBytes: mp3.length,
      nativeTimestampsAvailable: false,
      providerRequestId: "req-1",
      completedAt: "2026-10-14T10:00:00.000Z",
    });
    return runId;
  }
  const characters = (script: string) => [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP }));

  it("waits for an alignment slot, and frees it before the decomposition attempt waits for its own", async () => {
    concurrency.setLimit("alignment", 1);
    concurrency.setLimit("decomposition", 1);
    const aligns: Array<ReturnType<typeof heldCall<Awaited<ReturnType<AlignmentProvider["align"]>>>>> = [];
    const alignmentProvider: AlignmentProvider = {
      align: (_audio, script) => {
        const call = heldCall<Awaited<ReturnType<AlignmentProvider["align"]>>>();
        aligns.push(call);
        return call.promise.then((answer) => (answer.kind === "success" ? { kind: "success", characters: characters(script) } : answer));
      },
    };
    const divisions: Array<ReturnType<typeof heldCall<void>>> = [];
    const instructionGenerator: VisualInstructionGenerator = {
      generate: async (texts) => {
        const call = heldCall<void>();
        divisions.push(call);
        await call.promise;
        return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
      },
    };
    const first = narratedSession();
    const second = narratedSession();

    const firstRun = runDecompositionPhase(first, { alignmentProvider, instructionGenerator });
    await flush();
    const secondRun = runDecompositionPhase(second, { alignmentProvider, instructionGenerator });
    await flush();
    expect(aligns).toHaveLength(1);
    expect(getStageAttempts(second, "timestamps")).toEqual([expect.objectContaining({ outcome: "scheduled", trigger: "initial", sentAt: null })]);
    expect(getRun(second)?.failure).toBeNull();

    aligns[0]!.finish({ kind: "success", characters: [] });
    await flush();
    // The first session's alignment slot is free, so the second session's alignment is sent while the first divides.
    expect(concurrency.stats("alignment").inFlight).toBe(1);
    expect(aligns).toHaveLength(2);
    expect(divisions).toHaveLength(1);

    aligns[1]!.finish({ kind: "success", characters: [] });
    await flush();
    // The decomposition stage holds one slot; the second session's decomposition attempt waits for it, scheduled.
    expect(getStageAttempts(second, "decomposition")).toEqual([expect.objectContaining({ outcome: "scheduled", sentAt: null })]);

    divisions[0]!.finish();
    await firstRun;
    await flush();
    divisions[1]!.finish();
    await secondRun;
    expect(getScenesForRun(first)).toHaveLength(2);
    expect(getScenesForRun(second)).toHaveLength(2);
    expect(getStageAttempts(second, "decomposition")).toHaveLength(1);
    expect(getStageAttempts(second, "decomposition")[0]).toMatchObject({ outcome: "success" });
  });
});
