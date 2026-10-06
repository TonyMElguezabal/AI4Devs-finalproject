import { randomUUID } from "node:crypto";
import * as concurrency from "../src/concurrency.ts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  commitSceneResult,
  countSceneVideoResults,
  createRun,
  getRun,
  getScene,
  getStageAttempts,
  insertRegisteredScenes,
  insertVoiceOver,
  markChunkComplete,
  markImageComplete,
  markVideoGenerating,
  recordStageAttempt,
  resetAll,
  sceneCurrentRequestId,
  setFinalVideoPath,
  writeArtefactOnce,
} from "../src/db.ts";
import { assemblyStageLauncher, resetAssemblyTool, setAssemblyTool } from "../src/orchestrator.ts";
import { createCapturingAssemblyTool, type CapturedAssemblyInput } from "../src/stubAssemblyTool.ts";
import {
  deliverClipSuccessForTests,
  deliverImageSuccessForTests,
  nextAssemblyLaunchCount,
  resetAssemblyLaunchCount,
  resetVideoStageStartDelayMs,
  setVideoStageStartDelayMs,
  VIDEO_STAGE,
} from "../src/orchestrator.ts";
import { createStubVideoProvider, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";

// ignore-repeated-success-confirmations (JOS-161), spec persistence-foundation — "Repeated confirmations rejected by
// the store". A confirmation the store refuses changes nothing else: no state, no result reference, no launch.

beforeEach(() => {
  resetAll();
  resetAssemblyLaunchCount();
  resetAssemblyTool();
  resetVideoProviderRegistry();
  setVideoProviderRegistry({
    defaultIdentifier: "pending-clip-adapter",
    adapters: { "pending-clip-adapter": createStubVideoProvider("pending", { bytes: Buffer.alloc(12) }) },
  });
  setVideoStageStartDelayMs(9_999_999); // a launched clip stays unsent for the whole test
});

afterEach(() => resetVideoStageStartDelayMs());

/** A session with one scene of the given requested duration, its image committed and marked complete. */
/** Clips waiting for or holding a slot in the video stage: a launched clip is one of them. */
function clipQueueLength(): number {
  const stats = concurrency.stats(VIDEO_STAGE);
  return stats.inFlight + stats.queued;
}

function registeredScene(runId: string, sceneId: string): void {
  insertRegisteredScenes(runId, [
    {
      id: sceneId,
      index: 1,
      prompt: "a harbor at dawn",
      imageInstruction: "a harbor at dawn",
      videoInstruction: "waves roll in",
      narrationInterval: { startSeconds: 0, endSeconds: 8 },
      requestedDurationSeconds: 8,
      durationWarning: null,
      speedFactor: 1,
      speedFactorWarning: null,
    },
  ]);
}

function sceneWithImage(): { runId: string; sceneId: string } {
  const runId = randomUUID();
  createRun(runId, "Repeated confirmations", "A script.", "en");
  const sceneId = randomUUID();
  registeredScene(runId, sceneId);
  commitSceneResult(sceneId, "scene-1.png");
  markImageComplete(sceneId, "scene-1.png");
  return { runId, sceneId };
}

describe("A repeated image confirmation changes nothing (AC1, AC2)", () => {
  it("leaves a scene whose clip is generating in video-generating, with its request and image unchanged, and launches no clip", () => {
    const { sceneId } = sceneWithImage();
    markVideoGenerating(sceneId, "clip-request-1", 1);

    deliverImageSuccessForTests(sceneId, "scene-1-attempt-2.png");

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("video-generating");
    expect(scene.result).toBe("scene-1.png");
    expect(sceneCurrentRequestId(sceneId)).toBe("clip-request-1");
    expect(clipQueueLength()).toBe(0);
  });

  it("leaves a completed chunk as chunk-complete, with its clip reference unchanged", () => {
    const { sceneId } = sceneWithImage();
    markVideoGenerating(sceneId, "clip-request-1", 1);
    markChunkComplete(sceneId, "scene-1.mp4");

    deliverImageSuccessForTests(sceneId, "scene-1-attempt-2.png");

    const scene = getScene(sceneId)!;
    expect(scene.status).toBe("chunk-complete");
    expect(scene.videoResult).toBe("scene-1.mp4");
    expect(scene.result).toBe("scene-1.png");
    expect(clipQueueLength()).toBe(0);
  });

  it("the first image confirmation still completes the image stage and launches the clip once", () => {
    const runId = randomUUID();
    createRun(runId, "First confirmation", "A script.", "en");
    const sceneId = randomUUID();
    registeredScene(runId, sceneId);

    deliverImageSuccessForTests(sceneId, "scene-1.png");

    expect(getScene(sceneId)!.status).toBe("image-complete");
    expect(getScene(sceneId)!.result).toBe("scene-1.png");
    expect(clipQueueLength()).toBe(1);
  });
});

describe("A repeated clip confirmation changes nothing (AC1, AC2, AC3)", () => {
  it("stores one clip, keeps its reference, and does not trigger assembly again", () => {
    const { runId, sceneId } = sceneWithImage();
    markVideoGenerating(sceneId, "clip-request-1", 1);

    deliverClipSuccessForTests(sceneId, "scene-1.mp4");
    expect(nextAssemblyLaunchCount(runId)).toBe(1);

    deliverClipSuccessForTests(sceneId, "scene-1-second.mp4");

    expect(countSceneVideoResults(sceneId)).toBe(1);
    expect(getScene(sceneId)!.videoResult).toBe("scene-1.mp4");
    expect(getScene(sceneId)!.status).toBe("chunk-complete");
    expect(nextAssemblyLaunchCount(runId)).toBe(1);
    expect(getRun(runId)!.finalVideoPath).toBeNull();
  });
});

/** A session whose only scene is complete and whose voice-over is stored, so an assembly can run for it. */
function completeSessionWithVoiceOver(): { runId: string; sceneId: string } {
  const { runId, sceneId } = sceneWithImage();
  markVideoGenerating(sceneId, "clip-request-1", 1);
  const folder = getRun(runId)!.projectFolder;
  insertVoiceOver({
    runId,
    audioPath: writeArtefactOnce(folder, "voice-over.mp3", Buffer.from("fake-mp3")),
    timestampsPath: null,
    durationSeconds: 8,
    sizeBytes: 8,
    nativeTimestampsAvailable: false,
    providerRequestId: "voice-request-1",
    completedAt: new Date().toISOString(),
  });
  return { runId, sceneId };
}

/** A session with its voice-over stored and its only clip complete, so the assembly gate is open. No tool is set, so
 * the completing clip starts no assembly attempt. */
function openGateSession(): { runId: string } {
  const { runId, sceneId } = completeSessionWithVoiceOver();
  deliverClipSuccessForTests(sceneId, "scene-1.mp4");
  return { runId };
}

async function waitUntil(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("The final video is recorded once (AC1, AC2)", () => {
  it("records the first final video and refuses a second one, keeping the first", () => {
    const runId = randomUUID();
    createRun(runId, "Final video once", "A script.", "en");

    expect(setFinalVideoPath(runId, "final-video.mp4")).toBe(true);
    expect(setFinalVideoPath(runId, "replacement.mp4")).toBe(false);

    expect(getRun(runId)!.finalVideoPath).toBe("final-video.mp4");
  });

  it("a late assembly whose final video is refused ends superseded and leaves the recorded video in place", async () => {
    const { runId, sceneId } = completeSessionWithVoiceOver();
    setAssemblyTool({
      async assemble(input) {
        setFinalVideoPath(runId, "winner.mp4"); // another assembly records its video first
        return { kind: "success", outputPath: input.outputPath };
      },
    });

    deliverClipSuccessForTests(sceneId, "scene-1.mp4");
    await waitUntil(() => getStageAttempts(runId, "assembly").length === 1 && getStageAttempts(runId, "assembly")[0]!.outcome !== "in-flight");

    expect(getStageAttempts(runId, "assembly").map((attempt) => attempt.outcome)).toEqual(["superseded"]);
    expect(getRun(runId)!.finalVideoPath).toBe("winner.mp4");
  });
});

describe("Assembly is not started twice (AC2)", () => {
  it("a launch for a session that already has a final video records no attempt and runs no tool", () => {
    const { runId } = openGateSession();
    setFinalVideoPath(runId, "final-video.mp4");
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));

    assemblyStageLauncher.launch(runId);

    expect(getStageAttempts(runId, "assembly")).toHaveLength(0);
    expect(captured).toHaveLength(0);
  });

  it("a launch while an assembly attempt is in flight records no second attempt and runs no tool", () => {
    const { runId } = openGateSession();
    recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: new Date().toISOString(), sentAt: new Date().toISOString() });
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));

    assemblyStageLauncher.launch(runId);

    expect(getStageAttempts(runId, "assembly")).toHaveLength(1);
    expect(captured).toHaveLength(0);
  });

  it("the held work reports nothing while an assembly attempt is in flight, so continue does not start another", () => {
    const { runId } = openGateSession();
    expect(assemblyStageLauncher.heldWork(runId).count).toBe(1);

    recordStageAttempt({ runId, stage: "assembly", providerId: null, queuedAt: new Date().toISOString(), sentAt: new Date().toISOString() });

    expect(assemblyStageLauncher.heldWork(runId).count).toBe(0);
  });
});

describe("A scene enters the assembly once (AC3)", () => {
  it("a clip confirmed twice contributes exactly one clip to the assembly input", async () => {
    const { runId, sceneId } = completeSessionWithVoiceOver();
    const captured: CapturedAssemblyInput[] = [];
    setAssemblyTool(createCapturingAssemblyTool(captured));

    deliverClipSuccessForTests(sceneId, "scene-1.mp4");
    await waitUntil(() => captured.length === 1);
    deliverClipSuccessForTests(sceneId, "scene-1-second.mp4");
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(captured).toHaveLength(1);
    expect(captured[0]!.clips).toHaveLength(1);
    expect(runId).toBeTruthy();
  });
});
