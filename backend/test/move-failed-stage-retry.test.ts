import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setActiveProvider } from "../src/activeProvider.ts";
import type { AlignmentProvider } from "../src/alignmentProvider.ts";
import * as concurrency from "../src/concurrency.ts";
import { createRun, getRun, getScene, getScenesForRun, getStageAttempts, insertVoiceOver, markImageComplete, resetAll, writeArtefactOnce, commitSceneResult } from "../src/db.ts";
import { resetAlignmentProviderRegistry, resetDecompositionDependencies, resetReasoningProviderRegistry, setAlignmentProviderRegistry, setDecompositionDependencies, setReasoningProviderRegistry } from "../src/decompositionDependencies.ts";
import { segmentStoredTimestamps } from "../src/decompositionPhase.ts";
import { moveFailedStage } from "../src/failedStages.ts";
import { createStubImageProvider, resetDownloadFetch, resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { launchImageStage, launchVideoStageForRun, manualRetry, resetAssemblyTool, resetVideoStageStartDelayMs, setVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { retryVoiceOver } from "../src/voiceOverRetry.ts";
import { createStubVideoProvider, resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { createStubVoiceProvider, resetVoiceProviderRegistry, setVoiceProviderRegistry } from "../src/voiceProvider.ts";
import type { VisualInstructionGenerator, VisualInstructionResult } from "../src/visualInstructions.ts";
import { STAGE } from "../src/types.ts";
import { newRun, registerScenes } from "./failedStageFixtures.ts";

// move-failed-stage-to-active-provider (JOS-172), group 5 — AC2: the retry after a move goes to the provider the stage was
// moved to, through the real retry paths; the attempts before the move keep the provider they ran on.

function png(): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(1920, 16);
  buf.writeUInt32BE(1088, 20);
  return buf;
}
const MP4 = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, 10);
  resetVideoStageStartDelayMs();
  setVideoStageStartDelayMs(9_999_999);
  resetDownloadFetch();
  resetVideoDownloadFetch();
  resetAssemblyTool();
});

afterEach(() => {
  resetVoiceProviderRegistry();
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
  resetAlignmentProviderRegistry();
  resetReasoningProviderRegistry();
  resetDecompositionDependencies();
});

describe("voice", () => {
  it("a manual retry after a move is sent to the new provider, and the earlier attempts keep the old one", async () => {
    const stubB = createStubVoiceProvider("success");
    setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": createStubVoiceProvider("transient-failure"), "stub-b": stubB } });
    const runId = newRun("Voice move", "The lighthouse stands alone against the storm.");
    await generateVoiceOver(runId);
    for (let attempt = 2; attempt <= 4; attempt++) {
      const scheduled = getStageAttempts(runId, "voice-over").find((candidate) => candidate.outcome === "scheduled")!;
      expect(releaseAttempt(scheduled.id, () => new Date(Date.now() + 3_600_000))).toBe("sent");
      while (getStageAttempts(runId, "voice-over").some((candidate) => candidate.outcome === "in-flight")) await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(getRun(runId)!.failure).not.toBeNull();
    setActiveProvider("voice", "stub-b");

    expect(moveFailedStage({ sessionId: runId, stage: "voice" })).toMatchObject({ ok: true });
    expect(stubB.calls).toHaveLength(0); // the move sends nothing
    expect(retryVoiceOver(runId)).toMatchObject({ ok: true });
    await settle();

    expect(stubB.calls).toHaveLength(1);
    const providers = getStageAttempts(runId, "voice-over").map((attempt) => attempt.providerId);
    expect(providers).toEqual(["stub-a", "stub-a", "stub-a", "stub-a", "stub-b"]);
  });
});

describe("image", () => {
  it("a manual retry after a move is sent to the new provider and nothing goes to the old one", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([7]);
    const stubA = createStubImageProvider("not-retryable-failure");
    const stubB = createStubImageProvider("success-bytes", { bytes: png() });
    setImageProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": stubA, "stub-b": stubB } });
    launchImageStage(scene!);
    await settle();
    expect(getScene(scene!)).toMatchObject({ status: "failed", provider: "stub-a" });
    setActiveProvider("image", "stub-b");

    expect(moveFailedStage({ sessionId: runId, stage: "image", sceneId: scene! })).toMatchObject({ ok: true });
    expect(stubB.calls).toHaveLength(0);
    const callsOnA = stubA.calls.length;
    expect(manualRetry(runId, scene!)).toEqual({ ok: true });
    await settle();

    expect(stubB.calls).toHaveLength(1);
    expect(stubA.calls).toHaveLength(callsOnA);
    expect(getScene(scene!)).toMatchObject({ provider: "stub-b", status: "image-complete" });
  });
});

describe("video", () => {
  it("a manual retry after a move is sent to the new provider with the duration chosen for it", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([8]);
    const run = getRun(runId)!;
    const path = writeArtefactOnce(run.projectFolder, "scene-1.png", png());
    commitSceneResult(scene!, path);
    markImageComplete(scene!, path);
    const stubB = createStubVideoProvider("success-bytes", { bytes: MP4 });
    setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": createStubVideoProvider("not-retryable-failure"), "stub-b": stubB } });
    resetVideoStageStartDelayMs(); // the clip starts at once in this test
    launchVideoStageForRun(runId);
    await settle();
    expect(getScene(scene!)).toMatchObject({ status: "failed", videoProvider: "stub-a" });
    setActiveProvider("video", "stub-b");

    expect(moveFailedStage({ sessionId: runId, stage: "video", sceneId: scene! })).toMatchObject({ ok: true });
    expect(stubB.calls).toHaveLength(0);
    expect(manualRetry(runId, scene!)).toEqual({ ok: true });
    await settle();

    expect(stubB.calls).toHaveLength(1);
    expect(getScene(scene!)).toMatchObject({ status: "chunk-complete", videoProvider: "stub-b" });
    expect(getScenesForRun(runId)).toHaveLength(1);
  });
});

describe("alignment and reasoning", () => {
  const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";
  const STEP = 0.25;
  const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03]);

  function narrated(): string {
    const runId = randomUUID();
    const { projectFolder } = createRun(runId, "Decomposition move", SCRIPT, "en");
    writeArtefactOnce(projectFolder, "voice-over.mp3", MP3);
    insertVoiceOver({ runId, audioPath: "voice-over.mp3", timestampsPath: null, durationSeconds: SCRIPT.length * STEP, sizeBytes: MP3.length, nativeTimestampsAvailable: false, providerRequestId: "r", completedAt: "2026-10-22T10:00:00.000Z" });
    return runId;
  }
  const aligner = (kind: "fail" | "ok") => {
    const calls: string[] = [];
    const provider: AlignmentProvider = {
      async align(_audio, script) {
        calls.push(script);
        return kind === "fail" ? { kind: "failed_transient", reason: "alignment answered HTTP 503" } : { kind: "success", characters: [...script].map((text, i) => ({ text, start: 0.1 + i * STEP, end: 0.1 + (i + 1) * STEP })) };
      },
    };
    return { provider, calls };
  };
  const generator = (kind: "fail" | "ok") => {
    const calls: Array<readonly string[]> = [];
    const instance: VisualInstructionGenerator = {
      async generate(texts) {
        calls.push(texts);
        const result: VisualInstructionResult = kind === "fail" ? { kind: "failed_transient", reason: "reasoning answered HTTP 503" } : { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
        return result;
      },
    };
    return { generator: instance, calls };
  };

  it("a moved alignment step calls the new alignment provider on its retry", async () => {
    const alignA = aligner("fail");
    const alignB = aligner("ok");
    setDecompositionDependencies({ alignmentProvider: alignA.provider, instructionGenerator: generator("ok").generator });
    setAlignmentProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": alignA.provider, "stub-b": alignB.provider } });
    const runId = narrated();
    await obtainNarrationTimestamps(runId, alignA.provider);
    expect(getRun(runId)!.alignmentProviderId).toBe("stub-a");
    setActiveProvider("alignment", "stub-b");
    // The cycle is over: a failure the User may retry.
    const { setRunFailure } = await import("../src/db.ts");
    const { createDecompositionFailure } = await import("../src/sessionStateMachine.ts");
    setRunFailure(runId, createDecompositionFailure({ cause: "alignment answered HTTP 503", retryable: true, occurredAt: new Date() }));
    for (const attempt of getStageAttempts(runId, "timestamps").filter((candidate) => candidate.outcome === "scheduled")) {
      const { completeStageAttempt } = await import("../src/db.ts");
      completeStageAttempt(attempt.id, { outcome: "transient", finishedAt: new Date().toISOString(), errorMessage: "stub" });
    }

    expect(moveFailedStage({ sessionId: runId, stage: "alignment" })).toMatchObject({ ok: true });
    expect(alignB.calls).toHaveLength(0);
    await obtainNarrationTimestamps(runId, alignA.provider);

    expect(alignB.calls).toHaveLength(1);
    expect(alignA.calls).toHaveLength(1);
  });

  it("a moved reasoning step calls the new reasoning provider on its retry", async () => {
    const alignOk = aligner("ok");
    const genA = generator("fail");
    const genB = generator("ok");
    setDecompositionDependencies({ alignmentProvider: alignOk.provider, instructionGenerator: genA.generator });
    setReasoningProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": genA.generator, "stub-b": genB.generator } });
    const runId = narrated();
    await obtainNarrationTimestamps(runId, alignOk.provider);
    await segmentStoredTimestamps(runId, genA.generator);
    expect(getRun(runId)!.decompositionProviderId).toBe("stub-a");
    setActiveProvider("reasoning", "stub-b");
    const { setRunFailure, completeStageAttempt } = await import("../src/db.ts");
    const { createDecompositionFailure } = await import("../src/sessionStateMachine.ts");
    setRunFailure(runId, createDecompositionFailure({ cause: "reasoning answered HTTP 503", retryable: true, occurredAt: new Date() }));
    for (const attempt of getStageAttempts(runId, "decomposition").filter((candidate) => candidate.outcome === "scheduled")) {
      completeStageAttempt(attempt.id, { outcome: "transient", finishedAt: new Date().toISOString(), errorMessage: "stub" });
    }

    expect(moveFailedStage({ sessionId: runId, stage: "reasoning" })).toMatchObject({ ok: true });
    expect(genB.calls).toHaveLength(0);
    await segmentStoredTimestamps(runId, genA.generator);

    expect(genB.calls).toHaveLength(1);
    expect(genA.calls).toHaveLength(1);
  });
});
