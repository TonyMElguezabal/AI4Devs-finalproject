import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { checkClip } from "../src/clipOutputCheck.ts";
import {
  commitSceneResult,
  createRun,
  getLatestProviderRequestForScene,
  getRun,
  getScene,
  getScenesForRun,
  markImageComplete,
  resetAll,
  resolveArtefactPath,
  writeArtefactOnce,
} from "../src/db.ts";
import { launchVideoStageForRun, resetAssemblyTool, resetVideoStageStartDelayMs, setClipCheck, toSnapshot } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { createStubVideoProvider, resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";
import { makeClip } from "./clipFixtures.ts";

// check-generated-clip (JOS-265), design Decision 3 — the video stage runs the real clip check before it stores a clip.
// test/setup.ts installs an accepting check; these tests install the real one.

const PROVIDER_ID = "test-video-adapter";
const REQUESTED_SECONDS = 8; // the scene below narrates 8 s, which the admitted durations (5-15 s) request as 8 s

function png(): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(1920, 16);
  buf.writeUInt32BE(1088, 20);
  return buf;
}

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

async function bringToImageComplete(runId: string): Promise<string> {
  const fragments: SegmentedFragment[] = [{ text: "script", narrationInterval: { startSeconds: 0, endSeconds: REQUESTED_SECONDS } }];
  const registered = await registerDecomposition(runId, fragments, generator, REQUESTED_SECONDS);
  if (!registered.ok) throw new Error(`registration failed: ${registered.reason}`);
  const run = getRun(runId)!;
  const scene = getScenesForRun(runId)[0]!;
  const relativePath = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, png());
  commitSceneResult(scene.id, relativePath);
  markImageComplete(scene.id, relativePath);
  launchVideoStageForRun(runId);
  return scene.id;
}

async function waitFor(done: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the video stage");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function useClip(bytes: Buffer): { calls: string[] } {
  const provider = createStubVideoProvider("success-bytes", { bytes });
  setVideoProviderRegistry({ defaultIdentifier: PROVIDER_ID, adapters: { [PROVIDER_ID]: provider } });
  return provider;
}

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyTool();
  setClipCheck(checkClip);
});

describe("The video stage runs the clip check", () => {
  it("a good clip completes the chunk and is stored", async () => {
    const runId = randomUUID();
    createRun(runId, "good clip", "script", "en");
    useClip(makeClip(1920, 1080, REQUESTED_SECONDS));

    const sceneId = await bringToImageComplete(runId);
    await waitFor(() => getScene(sceneId)?.status === "chunk-complete");

    const scene = getScene(sceneId)!;
    expect(scene.videoResult).not.toBeNull();
    expect(existsSync(resolveArtefactPath(getRun(runId)!.projectFolder, scene.videoResult!))).toBe(true);
  });

  it("a 4 s clip for 8 s is a transient video failure with its reason, stores no file, and is retried", async () => {
    const runId = randomUUID();
    createRun(runId, "short clip", "script", "en");
    const provider = useClip(makeClip(1920, 1080, 4));

    const sceneId = await bringToImageComplete(runId);
    // Wait for the whole retry budget, so no attempt is still running when the next test resets the store.
    await waitFor(() => getScene(sceneId)?.status === "failed");

    expect(provider.calls.length).toBeGreaterThan(1); // retried
    const scene = getScene(sceneId)!;
    expect(scene.videoResult).toBeNull();
    expect(scene.lastError).toContain("the generated clip lasts 4.0 s, but 8 s was requested");
    expect(getLatestProviderRequestForScene(sceneId)).toMatchObject({ mode: "transient_failure" });
  });

  it("a clip that fails on every attempt fails the scene at video with the last reason", async () => {
    const runId = randomUUID();
    createRun(runId, "always short", "script", "en");
    const provider = useClip(makeClip(1280, 720, REQUESTED_SECONDS));

    const sceneId = await bringToImageComplete(runId);
    await waitFor(() => getScene(sceneId)?.status === "failed");

    expect(provider.calls).toHaveLength(4); // 1 attempt + 3 automatic retries
    const scene = getScene(sceneId)!;
    expect(scene.lastError).toContain("the generated clip is 1280x720; a clip must be horizontal and at least 1920x1080");
    expect(scene.videoResult).toBeNull();
    expect(scene.result).not.toBeNull(); // the image is unchanged
    expect(toSnapshot(runId)?.scenes[0]?.affectedStage).toBe("video");
  });

  it("bytes that are not an MP4 are refused by the same check", async () => {
    const runId = randomUUID();
    createRun(runId, "not an mp4", "script", "en");
    useClip(Buffer.from("this is not a video"));

    const sceneId = await bringToImageComplete(runId);
    await waitFor(() => getScene(sceneId)?.status === "failed");

    expect(getScene(sceneId)!.lastError).toContain("the generated clip is not an MP4 file that can be read");
  });

  it("an ffprobe that cannot run is a not-retryable failure that says the clip could not be checked", async () => {
    const runId = randomUUID();
    createRun(runId, "no ffprobe", "script", "en");
    const provider = useClip(makeClip(1920, 1080, REQUESTED_SECONDS));
    setClipCheck((bytes, seconds) => checkClip(bytes, seconds, "/nonexistent/ffprobe"));

    const sceneId = await bringToImageComplete(runId);
    await waitFor(() => getScene(sceneId)?.status === "failed");

    expect(provider.calls).toHaveLength(1); // not retried: a retry cannot succeed
    expect(getScene(sceneId)!.lastError).toContain("could not be checked");
    expect(getLatestProviderRequestForScene(sceneId)).toMatchObject({ mode: "not_retryable_failure" });
  });
});
