import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { setActiveProvider } from "../src/activeProvider.ts";
import * as concurrency from "../src/concurrency.ts";
import { commitSceneResult, createRun, getRun, getScene, getScenesForRun, markImageComplete, resetAll, writeArtefactOnce } from "../src/db.ts";
import { launchVideoStageForRun, manualRetry, resetAssemblyTool, resetVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { createStubVideoProvider, resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// change-active-provider-from-admin (JOS-171), group 4 — the video bind point (AC1, AC3, AC5).

function buildPng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}
const ACCEPTED_PNG = buildPng(1920, 1088);
const MP4_BYTES = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]); // a minimal `ftyp` box

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

/** One registered scene brought to `image-complete`; the video stage then launches by itself. */
async function sceneReadyForVideo(): Promise<{ runId: string; sceneId: string }> {
  const runId = randomUUID();
  createRun(runId, "Video binding test", "script", "en");
  const fragments: SegmentedFragment[] = [{ text: "script", narrationInterval: { startSeconds: 0, endSeconds: 8 } }];
  const registered = await registerDecomposition(runId, fragments, generator, 8);
  if (!registered.ok) throw new Error("fixture registration failed");
  const run = getRun(runId)!;
  const scene = getScenesForRun(runId)[0]!;
  const path = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, ACCEPTED_PNG);
  commitSceneResult(scene.id, path);
  markImageComplete(scene.id, path);
  return { runId, sceneId: scene.id };
}

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyTool();
});

describe("video binding to the active provider", () => {
  it("AC1: a scene's first attempt binds to the provider active at that moment and is sent there", async () => {
    const stubA = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    const stubB = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": stubA, "stub-b": stubB } });
    setActiveProvider("video", "stub-b");

    const { runId, sceneId } = await sceneReadyForVideo();
    launchVideoStageForRun(runId);
    await settle();

    expect(getScene(sceneId)!.videoProvider).toBe("stub-b");
    expect(stubB.calls).toHaveLength(1);
    expect(stubA.calls).toHaveLength(0);
  });

  it("AC3 and AC5: a bound scene keeps its provider for a manual retry after the change, and nothing goes to the new one", async () => {
    const stubB = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": createStubVideoProvider("not-retryable-failure"), "stub-b": stubB } });
    const { runId, sceneId } = await sceneReadyForVideo();
    launchVideoStageForRun(runId);
    await settle();
    expect(getScene(sceneId)).toMatchObject({ status: "failed", videoProvider: "stub-a" });

    const stubA = createStubVideoProvider("success-bytes", { bytes: MP4_BYTES });
    setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters: { "stub-a": stubA, "stub-b": stubB } });
    setActiveProvider("video", "stub-b");
    expect(manualRetry(runId, sceneId)).toEqual({ ok: true });
    await settle();

    expect(getScene(sceneId)).toMatchObject({ status: "chunk-complete", videoProvider: "stub-a" });
    expect(stubA.calls).toHaveLength(1);
    expect(stubB.calls).toHaveLength(0);
  });
});
