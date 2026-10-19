import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { limitSeconds } from "./phaseLimit.ts";
import {
  commitSceneResult,
  createRun,
  db,
  getRun,
  getScene,
  getScenesForRun,
  markImageComplete,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import {
  launchVideoStageForRun,
  resetVideoPollIntervalMs,
  resetVideoStageStartDelayMs,
  setVideoPollIntervalMs,
} from "../src/orchestrator.ts";
import { registerDecomposition } from "../src/sceneRegistration.ts";
import {
  createStubVideoProvider,
  resetVideoDownloadFetch,
  resetVideoProviderRegistry,
  setVideoProviderRegistry,
  STUB_VIDEO_PROVIDER_NAME,
} from "../src/videoProvider.ts";

// raise-video-time-limit (JOS-197), spec video-stage-time-limit — a clip request is given the configured maximum
// before it counts as timed out; one still generating inside it is neither failed nor retried.

const PNG_1920_1088 = (() => {
  const buf = Buffer.alloc(29);
  buf.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(1920, 16);
  buf.writeUInt32BE(1088, 20);
  return buf;
})();

const POLL_INTERVAL_MS = 5_000;

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  resetVideoStageStartDelayMs();
  setVideoPollIntervalMs(POLL_INTERVAL_MS);
  resetVideoDownloadFetch();
  // "pending" never resolves: the provider keeps answering that the task is still being generated.
  setVideoProviderRegistry({
    defaultIdentifier: STUB_VIDEO_PROVIDER_NAME,
    adapters: { [STUB_VIDEO_PROVIDER_NAME]: createStubVideoProvider("pending") },
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetVideoPollIntervalMs();
  resetVideoProviderRegistry();
});

async function sceneWithPendingClip(): Promise<string> {
  const runId = "00000000-0000-4000-8000-000000000197";
  createRun(runId, "Limit test", "A quiet harbor at dusk.", "en");
  const registered = await registerDecomposition(
    runId,
    [{ text: "A quiet harbor at dusk.", narrationInterval: { startSeconds: 0, endSeconds: 8 } }],
    { generate: async (texts) => ({ kind: "success", pairs: texts.map((_, i) => ({ image: `i${i}`, video: `v${i}` })) }) },
    8,
  );
  if (!registered.ok) throw new Error(`registration failed: ${registered.reason}`);
  const run = getRun(runId)!;
  const scene = getScenesForRun(runId)[0]!;
  const path = writeArtefactOnce(run.projectFolder, "scene-0.png", PNG_1920_1088);
  commitSceneResult(scene.id, path);
  markImageComplete(scene.id, path);
  launchVideoStageForRun(runId);
  await vi.advanceTimersByTimeAsync(0); // let the submit run; the first poll is armed
  return scene.id;
}

describe("the video stage's time limit", () => {
  it("is 1200 s", () => {
    expect(limitSeconds("video")).toBe(1200);
  });

  const failedRequests = (sceneId: string) =>
    db
      .prepare("SELECT latency_ms AS latencyMs FROM provider_requests WHERE scene_id = ? AND stage = 'video' AND mode = 'transient_failure'")
      .all(sceneId) as Array<{ latencyMs: number }>;

  it("leaves a 14 s clip that is still generating after 640 s pending, with no failure and no new request", async () => {
    const sceneId = await sceneWithPendingClip();

    await vi.advanceTimersByTimeAsync(640_000);

    expect(getScene(sceneId)!.status).toBe("video-generating");
    expect(getScene(sceneId)!.attempts).toBe(1);
    expect(failedRequests(sceneId)).toHaveLength(0);
  });

  it("fails a clip that is still generating past the limit and starts the next attempt", async () => {
    const sceneId = await sceneWithPendingClip();

    await vi.advanceTimersByTimeAsync((limitSeconds("video") + 1) * 1000 + POLL_INTERVAL_MS);

    const failed = failedRequests(sceneId);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.latencyMs).toBeGreaterThan(limitSeconds("video") * 1000);
    expect(getScene(sceneId)!.attempts).toBe(2);
  });
});
