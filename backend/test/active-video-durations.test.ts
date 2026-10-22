import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setActiveProvider } from "../src/activeProvider.ts";
import { closestAdmittedDuration, requestedClipDuration } from "../src/admittedDurations.ts";
import { classifyMustSplit } from "../src/clauseSplitting.ts";
import * as concurrency from "../src/concurrency.ts";
import { SETTINGS } from "../src/config/providers.ts";
import { commitSceneResult, createRun, getRun, getScene, getScenesForRun, markImageComplete, resetAll, writeArtefactOnce } from "../src/db.ts";
import { launchVideoStageForRun, manualRetry, resetAssemblyTool, resetVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { insertProfile, seedProviderProfiles } from "../src/providerProfiles.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { activeVideoDurations } from "../src/videoDurations.ts";
import { createStubVideoProvider, resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// manage-providers-from-admin (JOS-218), group 5 — design Decision 4: the admitted durations are the active video
// provider's, read when segmentation and the clip request run.

const LATER = "2099-01-01T00:00:00.000Z";
const video = (min: number, max: number) => ({ endpoint: "/openapi/v2/other/model", admittedDurationSeconds: { min, max } });

beforeEach(() => {
  resetVideoStageStartDelayMs();
  resetAll();
  seedProviderProfiles(SETTINGS);
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyTool();
});

afterEach(() => resetVideoProviderRegistry());

describe("activeVideoDurations", () => {
  it("is the active video profile's range, from the shipped settings by default", () => {
    const { min, max } = SETTINGS.video.admittedDurationSeconds;
    expect(activeVideoDurations()).toMatchObject({ min, max });
    expect(activeVideoDurations().durations).toEqual(Array.from({ length: max - min + 1 }, (_, i) => min + i));
  });

  it("follows a change of the active video provider on the next call", () => {
    insertProfile({ id: "01VID", stage: "video", adapterType: "runninghub-video", label: "Short clips", parameters: video(6, 10) }, LATER);
    setActiveProvider("video", "01VID");
    expect(activeVideoDurations()).toMatchObject({ min: 6, max: 10, durations: [6, 7, 8, 9, 10], label: "Short clips" });
    setActiveProvider("video", "RunningHub");
    expect(activeVideoDurations().min).toBe(SETTINGS.video.admittedDurationSeconds.min);
  });

  it("is used by the closest-duration rule, the clip request and the must-split classification", () => {
    insertProfile({ id: "01VID", stage: "video", adapterType: "runninghub-video", label: "Short clips", parameters: video(6, 10) }, LATER);
    setActiveProvider("video", "01VID");
    expect(closestAdmittedDuration(30).admitted).toBe(10);
    expect(requestedClipDuration({ startSeconds: 0, endSeconds: 30 })).toMatchObject({ seconds: 10, warning: "exceeds-maximum" });
    expect(classifyMustSplit([12])[0]!.free).toBe(true);
    setActiveProvider("video", "RunningHub");
    expect(classifyMustSplit([12])[0]!.free).toBe(false);
  });
});

const MP4 = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};
function pngBytes(): Buffer {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(1920, 16);
  buf.writeUInt32BE(1088, 20);
  return buf;
}

/** One scene registered with an 8 s narrated interval (requested 8 s under the shipped range) and brought to `image-complete`. */
async function sceneReadyForVideo(): Promise<{ runId: string; sceneId: string }> {
  const runId = randomUUID();
  createRun(runId, "Durations test", "script", "en");
  const fragments: SegmentedFragment[] = [{ text: "script", narrationInterval: { startSeconds: 0, endSeconds: 8 } }];
  const registered = await registerDecomposition(runId, fragments, generator, 8);
  if (!registered.ok) throw new Error("fixture registration failed");
  const run = getRun(runId)!;
  const scene = getScenesForRun(runId)[0]!;
  const path = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, pngBytes());
  commitSceneResult(scene.id, path);
  markImageComplete(scene.id, path);
  return { runId, sceneId: scene.id };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("a requested duration the active video provider does not admit", () => {
  it("fails not retryable before any binding, sends nothing, and can be retried after switching back", async () => {
    const { runId, sceneId } = await sceneReadyForVideo(); // registered while the shipped range (5 to 15 s) is active
    expect(getScene(sceneId)!.requestedDurationSeconds).toBe(8);
    insertProfile({ id: "01VID", stage: "video", adapterType: "runninghub-video", label: "Long clips", parameters: video(10, 12) }, LATER);
    setActiveProvider("video", "01VID");

    const refused = createStubVideoProvider("success-bytes", { bytes: MP4 });
    setVideoProviderRegistry({ defaultIdentifier: "01VID", adapters: { "01VID": refused } });
    launchVideoStageForRun(runId);
    await settle();

    expect(refused.calls).toHaveLength(0);
    expect(getScene(sceneId)).toMatchObject({ status: "failed", videoProvider: null });
    expect(getScene(sceneId)!.lastError).toMatch(/8 s.*Long clips.*10.*12/);

    const accepted = createStubVideoProvider("success-bytes", { bytes: MP4 });
    setVideoProviderRegistry({ defaultIdentifier: "RunningHub", adapters: { RunningHub: accepted, "01VID": refused } });
    setActiveProvider("video", "RunningHub");
    expect(manualRetry(runId, sceneId)).toEqual({ ok: true });
    await settle();

    expect(accepted.calls).toHaveLength(1);
    expect(getScene(sceneId)).toMatchObject({ status: "chunk-complete", videoProvider: "RunningHub" });
  });
});
