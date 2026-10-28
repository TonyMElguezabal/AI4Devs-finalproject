import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import * as concurrency from "../src/concurrency.ts";
import { commitSceneResult, commitSceneVideoResult, db, getRun, getScene, recordStageAttempt, requestFinalVideoRebuild, resetAll, setFinalVideoPath } from "../src/db.ts";
import { resetAssemblyTool, resetVideoStageStartDelayMs, setAssemblyTool } from "../src/orchestrator.ts";
import { createStubAssemblyTool } from "../src/stubAssemblyTool.ts";
import { resetDownloadFetch, resetImageProviderRegistry, setImageProviderRegistry, type ImageProvider } from "../src/imageProvider.ts";
import { createStubVideoProvider, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { buildApp } from "../src/server.ts";

// rebuild-scene (JOS-235), spec scene-rebuild — the command behind `POST /sessions/{id}/scenes/{id}/rebuild`.

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
const MP4_BYTES = Buffer.concat([Buffer.from([0, 0, 0, 12]), Buffer.from("ftypmp42")]);

const BOUND_IMAGE_PROVIDER = "image-provider-a";
const OTHER_IMAGE_PROVIDER = "image-provider-b";
const VIDEO_PROVIDER = "video-provider-a";

let app: FastifyInstance;
let imageCalls: Array<{ provider: string; instruction: string }>;

function recordingImageProvider(name: string): ImageProvider {
  return {
    async generate(instruction) {
      imageCalls.push({ provider: name, instruction });
      return { kind: "success", image: { source: "bytes", bytes: ACCEPTED_PNG, contentType: "image/png" } };
    },
  };
}

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 5);
    };
    tick();
  });
}

beforeEach(async () => {
  resetAll();
  concurrency.resetAll();
  resetVideoStageStartDelayMs();
  imageCalls = [];
  resetDownloadFetch();
  setImageProviderRegistry({
    defaultIdentifier: OTHER_IMAGE_PROVIDER, // the active provider has changed since the scene was generated
    adapters: { [BOUND_IMAGE_PROVIDER]: recordingImageProvider(BOUND_IMAGE_PROVIDER), [OTHER_IMAGE_PROVIDER]: recordingImageProvider(OTHER_IMAGE_PROVIDER) },
  });
  setVideoProviderRegistry({ defaultIdentifier: VIDEO_PROVIDER, adapters: { [VIDEO_PROVIDER]: createStubVideoProvider("success-bytes", { bytes: MP4_BYTES }) } });
  setAssemblyTool(createStubAssemblyTool());
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
  resetAssemblyTool();
  resetImageProviderRegistry();
  resetVideoProviderRegistry();
});

async function newSession(): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Rebuild command", script: "A harbor at dusk.", language: "en" } });
  const sessionId = res.json().session.sessionId as string;
  await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` }); // nothing launches until the test continues it
  return sessionId;
}

/** A generated scene inserted directly, bound to `BOUND_IMAGE_PROVIDER`, so a test controls its state. */
function insertScene(sessionId: string, status: string, index = 1): string {
  const sceneId = randomUUID();
  db.prepare(
    `INSERT INTO scenes (id, run_id, idx, status, attempts, instruction, image_instruction, video_instruction, result, video_result, provider, video_provider,
       requested_duration_seconds, narration_start_seconds, narration_end_seconds, updated_at)
     VALUES (?, ?, ?, ?, 1, 'legacy', 'old image instruction', 'old video instruction', 'scene-${index}-attempt-1.png', ?, ?, ?, 8, 0, 8, ?)`,
  ).run(sceneId, sessionId, index, status, status === "chunk-complete" ? `scene-${index}.mp4` : null, BOUND_IMAGE_PROVIDER, VIDEO_PROVIDER, new Date().toISOString());
  commitSceneResult(sceneId, `scene-${index}-attempt-1.png`);
  if (status === "chunk-complete") commitSceneVideoResult(sceneId, `scene-${index}.mp4`);
  return sceneId;
}

const rebuild = (sessionId: string, sceneId: string, payload: object = {}) =>
  app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${sceneId}/rebuild`, payload });

describe("accepting a rebuild", () => {
  it("answers 202 and regenerates the image and then the clip on the bound providers, with the edited instruction", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");
    await app.inject({ method: "POST", url: `/sessions/${sessionId}/continue` });

    const res = await rebuild(sessionId, sceneId, { imageInstruction: "fixed image" });

    expect(res.statusCode).toBe(202);
    await waitFor(() => getScene(sceneId)?.status === "chunk-complete" && getScene(sceneId)?.rebuildCount === 1);
    expect(imageCalls).toEqual([{ provider: BOUND_IMAGE_PROVIDER, instruction: "fixed image" }]);
    expect(getScene(sceneId)).toMatchObject({ result: "scene-1-r1-attempt-1.png", videoResult: "scene-1-r1.mp4", videoProvider: VIDEO_PROVIDER });
  });

  it("is accepted for a scene that has an image and has not sent its clip request", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "image-complete");

    expect((await rebuild(sessionId, sceneId)).statusCode).toBe(202);
    expect(getScene(sceneId)).toMatchObject({ status: "submitted", result: null });
  });

  it("is held while the session is paused and says so", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");

    const res = await rebuild(sessionId, sceneId, { videoInstruction: "slower camera" });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true, held: true });
    expect(getScene(sceneId)).toMatchObject({ status: "submitted", videoInstruction: "slower camera" });
    expect(imageCalls).toEqual([]);
  });

  it("changes no other scene", async () => {
    const sessionId = await newSession();
    const target = insertScene(sessionId, "chunk-complete", 1);
    const other = insertScene(sessionId, "chunk-complete", 2);
    const otherBefore = getScene(other);

    await rebuild(sessionId, target);

    expect(getScene(other)).toEqual(otherBefore);
  });
});

describe("refusing a rebuild", () => {
  it.each(["submitted", "image-generating", "video-generating", "failed"])("answers 409 scene-not-ready for a scene in %s and changes nothing", async (status) => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, status);
    const before = getScene(sceneId);

    const res = await rebuild(sessionId, sceneId, { imageInstruction: "new" });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ ok: false, reason: "scene-not-ready" });
    expect(getScene(sceneId)).toEqual(before);
  });

  it("answers 409 assembly-in-progress while an assembly attempt is in flight", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");
    const now = new Date().toISOString();
    recordStageAttempt({ runId: sessionId, stage: "assembly", providerId: null, queuedAt: now, sentAt: now });

    const res = await rebuild(sessionId, sceneId);

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ ok: false, reason: "assembly-in-progress" });
    expect(getScene(sceneId)!.status).toBe("chunk-complete");
  });

  it("answers 409 assembly-in-progress while a final-video rebuild is requested", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");
    setFinalVideoPath(sessionId, "final-video.mp4");
    requestFinalVideoRebuild(sessionId);

    expect((await rebuild(sessionId, sceneId)).json()).toEqual({ ok: false, reason: "assembly-in-progress" });
    expect(getRun(sessionId)!.finalVideoStale).toBe(false);
  });

  it("answers 404 unknown-scene for an unknown scene, an unknown session and a scene of another session", async () => {
    const sessionId = await newSession();
    const otherSession = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");

    const unknownScene = await rebuild(sessionId, randomUUID());
    const unknownSession = await rebuild("01ARZ3NDEKTSV4RRFFQ69G5FAV", sceneId);
    const crossSession = await rebuild(otherSession, sceneId);

    for (const res of [unknownScene, unknownSession, crossSession]) {
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ ok: false, reason: "unknown-scene" });
    }
    expect(getScene(sceneId)!.status).toBe("chunk-complete");
  });

  it("answers 400 for an instruction that is empty after trimming, and changes nothing", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");

    expect((await rebuild(sessionId, sceneId, { imageInstruction: "   " })).statusCode).toBe(400);
    expect((await rebuild(sessionId, sceneId, { videoInstruction: "" })).statusCode).toBe(400);
    expect(getScene(sceneId)).toMatchObject({ status: "chunk-complete", rebuildCount: 0 });
  });

  it("accepts the first of two back-to-back rebuilds and refuses the second", async () => {
    const sessionId = await newSession();
    const sceneId = insertScene(sessionId, "chunk-complete");

    const first = await rebuild(sessionId, sceneId);
    const second = await rebuild(sessionId, sceneId);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ ok: false, reason: "scene-not-ready" });
    expect(getScene(sceneId)!.rebuildCount).toBe(1);
  });
});
