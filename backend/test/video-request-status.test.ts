import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import * as concurrency from "../src/concurrency.ts";
import { SETTINGS, VIDEO_PROVIDER } from "../src/config/providers.ts";
import {
  bindSceneVideoProvider,
  commitSceneResult,
  createRun,
  createScene,
  db,
  getRun,
  getScene,
  getScenesForRun,
  insertProviderRequest,
  markChunkComplete,
  markImageComplete,
  markSceneFailed,
  markVideoGenerating,
  recordVideoRequestSent,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import { launchVideoStageForRun, resetAssemblyTool, resetVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { seedProviderProfiles } from "../src/providerProfiles.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import { ulid } from "../src/util/ulid.ts";
import { videoEstimate } from "../src/videoRequestStatus.ts";
import { resetVideoDownloadFetch, resetVideoProviderRegistry, setVideoProviderRegistry, type VideoProvider } from "../src/videoProvider.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// show-video-request-status (JOS-200), tasks 1.1 to 1.5 — the status of a clip request while it generates.

let app: FastifyInstance;

beforeEach(async () => {
  resetVideoStageStartDelayMs();
  resetAll();
  seedProviderProfiles(SETTINGS);
  resetVideoProviderRegistry();
  resetVideoDownloadFetch();
  concurrency.resetAll();
  resetAssemblyTool();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  resetVideoProviderRegistry();
  await app.close();
});

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

/** Scenes registered with one narrated interval length (in seconds) each, so each gets its own requested duration. */
async function registeredScenes(intervalLengths: number[]): Promise<{ runId: string; sceneIds: string[] }> {
  const runId = ulid();
  const texts = intervalLengths.map((_, i) => `Fragment ${i + 1}.`);
  createRun(runId, "Request status test", texts.join(" "), "en"); // the fragments, joined by a space, must reproduce the script
  let start = 0;
  const fragments: SegmentedFragment[] = intervalLengths.map((length, i) => {
    const fragment = { text: texts[i]!, narrationInterval: { startSeconds: start, endSeconds: start + length } };
    start += length;
    return fragment;
  });
  const registered = await registerDecomposition(runId, fragments, generator, start);
  if (!registered.ok) throw new Error(`fixture registration failed: ${JSON.stringify(registered)}`);
  return { runId, sceneIds: getScenesForRun(runId).map((scene) => scene.id) };
}

async function withImage(runId: string, sceneId: string): Promise<void> {
  const run = getRun(runId)!;
  const scene = getScenesForRun(runId).find((item) => item.id === sceneId)!;
  const path = writeArtefactOnce(run.projectFolder, `scene-${scene.index}.png`, pngBytes());
  commitSceneResult(sceneId, path);
  markImageComplete(sceneId, path);
}

const BODY = { prompt: "video 1", duration: 8, resolution: "2K", firstFrame: "scene 1 image" };
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

async function readScene(runId: string): Promise<Record<string, any>> {
  const res = await app.inject({ method: "GET", url: `/sessions/${runId}` });
  expect(res.statusCode).toBe(200);
  return res.json<{ scenes: Array<Record<string, any>> }>().scenes[0]!;
}

/** A scene whose clip request is in flight: bound, marked generating, and its request recorded as sent. */
function generatingScene(runId: string, attempt = 1, sentAt = "2026-10-27T12:04:10.000Z"): string {
  const sceneId = randomUUID();
  createScene(sceneId, runId, 1, "success", 0);
  bindSceneVideoProvider(sceneId, VIDEO_PROVIDER.endpoint);
  markVideoGenerating(sceneId, randomUUID(), attempt);
  recordVideoRequestSent(sceneId, sentAt, BODY);
  return sceneId;
}

describe("the stored request (1.1, 1.2)", () => {
  it("adds nullable scene columns, empty for a new scene", () => {
    const columns = (db.prepare("PRAGMA table_info(scenes)").all() as Array<{ name: string }>).map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining(["video_request_sent_at", "video_request"]));
    const runId = ulid();
    createRun(runId, "Columns", "script", "en");
    const scene = createScene(randomUUID(), runId, 1, "success", 0);
    expect(getScene(scene.id)).toMatchObject({ videoRequestSentAt: null, videoRequestBody: null });
  });

  it("is stored with the send time and only the allow-listed body when the adapter submits", async () => {
    const { runId, sceneIds } = await registeredScenes([8]);
    await withImage(runId, sceneIds[0]!);
    const adapter: VideoProvider = {
      async submit() {
        return {
          kind: "submitted",
          requestId: "task-1",
          sentBody: { prompt: "video 1", duration: 8, resolution: "2K", firstFrameUrl: "https://provider.example/upload/abc.png", extraField: "must-not-be-kept" },
        };
      },
      async poll() {
        return { kind: "pending" };
      },
    };
    setVideoProviderRegistry({ defaultIdentifier: "RunningHub", adapters: { RunningHub: adapter } });

    launchVideoStageForRun(runId);
    await settle();

    const scene = getScene(sceneIds[0]!)!;
    expect(scene.status).toBe("video-generating");
    expect(scene.videoRequestBody).toEqual({ prompt: "video 1", duration: 8, resolution: "2K", firstFrame: `scene ${scene.index} image` });
    expect(Number.isNaN(Date.parse(scene.videoRequestSentAt!))).toBe(false);
    expect(JSON.stringify(scene)).not.toContain("provider.example");
    expect(JSON.stringify(scene)).not.toContain("must-not-be-kept");
  });

  it("is cleared when the next attempt starts and overwritten when that attempt submits", () => {
    const runId = ulid();
    createRun(runId, "Retry", "script", "en");
    const sceneId = generatingScene(runId, 1, "2026-10-27T12:04:10.000Z");
    expect(getScene(sceneId)!.videoRequestSentAt).toBe("2026-10-27T12:04:10.000Z");

    markVideoGenerating(sceneId, randomUUID(), 2);
    expect(getScene(sceneId)).toMatchObject({ videoRequestSentAt: null, videoRequestBody: null });

    recordVideoRequestSent(sceneId, "2026-10-27T12:30:00.000Z", { ...BODY, prompt: "edited" });
    expect(getScene(sceneId)).toMatchObject({ videoRequestSentAt: "2026-10-27T12:30:00.000Z", videoRequestBody: { prompt: "edited" } });
  });
});

describe("the scene representation (1.3)", () => {
  it("carries the request while the clip generates", async () => {
    const runId = ulid();
    createRun(runId, "Representation", "script", "en");
    generatingScene(runId, 2, "2026-10-27T12:30:00.000Z");

    const scene = await readScene(runId);

    expect(scene.videoRequest).toEqual({
      provider: { name: "RunningHub", model: "minimax/hailuo-h3" },
      attempt: 2,
      sentAt: "2026-10-27T12:30:00.000Z",
      estimate: null,
      body: BODY,
      // show-clip-task-liveness (JOS-233): the task id (the column's value once the request is sent), no check yet, and the wait's end (send + 2400 s).
      taskId: expect.any(String),
      lastCheckedAt: null,
      waitEndsAt: "2026-10-27T13:10:00.000Z",
    });
  });

  it("is absent before the request is sent, when the clip is complete and when the scene failed", async () => {
    const runId = ulid();
    createRun(runId, "Absent", "script", "en");
    const sceneId = randomUUID();
    createScene(sceneId, runId, 1, "success", 0);
    bindSceneVideoProvider(sceneId, VIDEO_PROVIDER.endpoint);
    markVideoGenerating(sceneId, randomUUID(), 1); // marked, request not yet submitted
    expect((await readScene(runId)).videoRequest).toBeUndefined();

    recordVideoRequestSent(sceneId, "2026-10-27T12:04:10.000Z", BODY);
    markChunkComplete(sceneId, "scene-1.mp4");
    expect((await readScene(runId)).videoRequest).toBeUndefined();

    markVideoGenerating(sceneId, randomUUID(), 2);
    recordVideoRequestSent(sceneId, "2026-10-27T12:40:00.000Z", BODY);
    markSceneFailed(sceneId, "provider said no");
    expect((await readScene(runId)).videoRequest).toBeUndefined();
  });

  it("is the same after a restart, because it is read from the store", async () => {
    const runId = ulid();
    createRun(runId, "Restart", "script", "en");
    generatingScene(runId);
    const before = (await readScene(runId)).videoRequest;
    await app.close();
    app = await buildApp();
    await app.ready();
    expect((await readScene(runId)).videoRequest).toEqual(before);
  });
});

describe("the estimate (1.4)", () => {
  /** Finished clip requests of the bound provider: one scene per interval length, one successful request each. */
  async function finishedClips(lengths: number[], latenciesMs: number[], mode: "success" | "transient_failure" = "success", provider: string = VIDEO_PROVIDER.endpoint): Promise<void> {
    const { sceneIds } = await registeredScenes(lengths);
    sceneIds.forEach((sceneId, i) => {
      bindSceneVideoProvider(sceneId, provider);
      insertProviderRequest(randomUUID(), sceneId, latenciesMs[i]!, mode, 1, "video");
    });
  }

  it("is the median of at least 3 successes of the same provider and requested duration", async () => {
    await finishedClips([8, 8, 8], [400_000, 500_000, 600_000]);
    expect(videoEstimate(VIDEO_PROVIDER.endpoint, 8)).toEqual({ seconds: 500, basedOn: 3 });
  });

  it("falls back to the provider's successes of any duration when fewer than 3 match", async () => {
    await finishedClips([8, 6], [300_000, 700_000]);
    expect(videoEstimate(VIDEO_PROVIDER.endpoint, 8)).toEqual({ seconds: 300, basedOn: 2 });
  });

  it("is null when the provider has no success, and ignores failures and other providers", async () => {
    expect(videoEstimate(VIDEO_PROVIDER.endpoint, 8)).toBeNull();
    await finishedClips([8], [900_000], "transient_failure");
    await finishedClips([8], [100_000], "success", "some-other-provider");
    expect(videoEstimate(VIDEO_PROVIDER.endpoint, 8)).toBeNull();
  });

  it("appears on the scene representation while the clip generates", async () => {
    await finishedClips([8, 8, 8], [400_000, 500_000, 600_000]);
    const second = await registeredScenes([8]);
    const sceneId = second.sceneIds[0]!;
    bindSceneVideoProvider(sceneId, VIDEO_PROVIDER.endpoint);
    markVideoGenerating(sceneId, randomUUID(), 1);
    recordVideoRequestSent(sceneId, "2026-10-27T12:00:00.000Z", BODY);

    expect((await readScene(second.runId)).videoRequest.estimate).toEqual({ seconds: 500, basedOn: 3 });
  });
});

describe("the clip diagnostic counts the request in flight (1.5)", () => {
  it("shows 1 attempt while the first request is in flight, and 2 while a retry is, without writing request rows", async () => {
    const runId = ulid();
    createRun(runId, "In flight", "script", "en");
    const sceneId = generatingScene(runId);
    const rows = () => (db.prepare("SELECT COUNT(*) c FROM provider_requests").get() as { c: number }).c;
    const before = rows();

    expect((await readScene(runId)).stages.video).toMatchObject({ stage: "video", attempts: 1 });

    insertProviderRequest(randomUUID(), sceneId, 1000, "transient_failure", 1, "video"); // attempt 1 ended
    markVideoGenerating(sceneId, randomUUID(), 2);
    recordVideoRequestSent(sceneId, "2026-10-27T12:30:00.000Z", BODY);

    expect((await readScene(runId)).stages.video).toMatchObject({ attempts: 2 });
    expect(rows()).toBe(before + 1); // only the row the test inserted; reading wrote none
  });
});
