import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import * as concurrency from "../src/concurrency.ts";
import {
  commitSceneResult,
  createRun,
  createScene,
  db,
  getRun,
  getScene,
  markImageComplete,
  PROJECTS_ROOT,
  resetAll,
  resolveArtefactPath,
  sceneFileStem,
  writeArtefactOnce,
} from "../src/db.ts";
import { launchImageStage, launchVideoStage, resetVideoStageStartDelayMs, setVideoStageStartDelayMs, toSnapshot } from "../src/orchestrator.ts";
import { createStubImageProvider, resetDownloadFetch, resetImageProviderRegistry, setImageProviderRegistry } from "../src/imageProvider.ts";
import { createStubVideoProvider, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// rebuild-scene (JOS-235), design Decisions 3 and 4 — a rebuilt scene writes new, versioned files and is shown under
// a new URL; a scene's first generation keeps today's names.

const IMAGE_PROVIDER_ID = "test-image-adapter";
const VIDEO_PROVIDER_ID = "test-video-adapter";

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

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

async function registeredScene(): Promise<{ runId: string; sceneId: string; projectFolder: string }> {
  const runId = randomUUID();
  const run = createRun(runId, "Rebuild files", "The lighthouse stands alone.", "en");
  const fragments: SegmentedFragment[] = [{ text: "The lighthouse stands alone.", narrationInterval: { startSeconds: 0, endSeconds: 8 } }];
  const result = await registerDecomposition(runId, fragments, generator, 8);
  if (!result.ok) throw new Error("fixture registration failed");
  return { runId, sceneId: result.sceneIds[0]!, projectFolder: run.projectFolder };
}

const setRebuildCount = (sceneId: string, count: number) => db.prepare("UPDATE scenes SET rebuild_count = ? WHERE id = ?").run(count, sceneId);

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

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  setVideoStageStartDelayMs(9_999_999); // the image tests must not start the clip stage
  resetImageProviderRegistry();
  resetDownloadFetch();
  resetVideoProviderRegistry();
});

afterEach(() => {
  resetVideoStageStartDelayMs();
});

describe("the file stem", () => {
  it("is the scene's number for a first generation and carries the rebuild number after a rebuild", () => {
    expect(sceneFileStem({ index: 4, rebuildCount: 0 })).toBe("scene-4");
    expect(sceneFileStem({ index: 4, rebuildCount: 1 })).toBe("scene-4-r1");
    expect(sceneFileStem({ index: 4, rebuildCount: 12 })).toBe("scene-4-r12");
  });
});

describe("the image file", () => {
  async function generateImage(rebuildCount: number): Promise<{ result: string; projectFolder: string }> {
    const { sceneId, projectFolder } = await registeredScene();
    setImageProviderRegistry({
      defaultIdentifier: IMAGE_PROVIDER_ID,
      adapters: { [IMAGE_PROVIDER_ID]: createStubImageProvider("success-bytes", { bytes: ACCEPTED_PNG, contentType: "image/png" }) },
    });
    setRebuildCount(sceneId, rebuildCount);
    launchImageStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "image-complete");
    return { result: getScene(sceneId)!.result!, projectFolder };
  }

  it("keeps today's name for a first generation", async () => {
    expect((await generateImage(0)).result).toBe("scene-1-attempt-1.png");
  });

  it("is a new file named with the rebuild number after a rebuild, and the earlier file is untouched", async () => {
    const { result, projectFolder } = await generateImage(1);

    expect(result).toBe("scene-1-r1-attempt-1.png");
    expect(existsSync(resolveArtefactPath(projectFolder, result))).toBe(true);
  });
});

describe("the clip file", () => {
  async function generateClip(rebuildCount: number): Promise<string> {
    const { runId, sceneId, projectFolder } = await registeredScene();
    const imagePath = writeArtefactOnce(projectFolder, "scene-1-attempt-1.png", ACCEPTED_PNG);
    commitSceneResult(sceneId, imagePath);
    markImageComplete(sceneId, imagePath);
    setRebuildCount(sceneId, rebuildCount);
    setVideoProviderRegistry({
      defaultIdentifier: VIDEO_PROVIDER_ID,
      adapters: { [VIDEO_PROVIDER_ID]: createStubVideoProvider("success-bytes", { bytes: MP4_BYTES }) },
    });
    resetVideoStageStartDelayMs();
    launchVideoStage(sceneId);
    await waitFor(() => getScene(sceneId)?.status === "chunk-complete");
    expect(getRun(runId)).toBeDefined();
    return getScene(sceneId)!.videoResult!;
  }

  it("keeps today's name for a first generation", async () => {
    expect(await generateClip(0)).toBe("scene-1.mp4");
  });

  it("is named with the rebuild number after a rebuild", async () => {
    expect(await generateClip(1)).toBe("scene-1-r1.mp4");
  });
});

describe("the URLs the page shows", () => {
  async function snapshotScene(rebuildCount: number) {
    const { runId, sceneId } = await registeredScene();
    markImageComplete(sceneId, "scene-1-attempt-1.png");
    db.prepare("UPDATE scenes SET status = 'chunk-complete', video_result = 'scene-1.mp4', rebuild_count = ? WHERE id = ?").run(rebuildCount, sceneId);
    return toSnapshot(runId)!.scenes.find((scene) => scene.sceneId === sceneId)!;
  }

  it("are unchanged for a first generation", async () => {
    const scene = await snapshotScene(0);

    expect(scene.result?.imageUrl).toMatch(/\/image$/);
    expect(scene.downloads?.clipUrl).toMatch(/\/download\/video$/);
  });

  it("carry the rebuild number after a rebuild, so the page loads the new result", async () => {
    const scene = await snapshotScene(2);

    expect(scene.result?.imageUrl).toMatch(/\/image\?r=2$/);
    expect(scene.downloads?.imageUrl).toMatch(/\/download\/image\?r=2$/);
    expect(scene.downloads?.clipUrl).toMatch(/\/download\/video\?r=2$/);
  });
});

describe("the routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serve the image and the clip when the URL carries the rebuild number", async () => {
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Rebuild routes", script: "A harbor at dusk.", language: "en" } });
    const sessionId = created.json().session.sessionId as string;
    await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
    const projectFolder = getRun(sessionId)!.projectFolder;
    for (const [name, bytes] of [["scene-1-r1-attempt-1.png", ACCEPTED_PNG], ["scene-1-r1.mp4", MP4_BYTES]] as const) {
      const full = join(PROJECTS_ROOT, projectFolder, name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, bytes);
    }
    const sceneId = randomUUID();
    createScene(sceneId, sessionId, 1, "success", 100);
    markImageComplete(sceneId, "scene-1-r1-attempt-1.png");
    db.prepare("UPDATE scenes SET status = 'chunk-complete', video_result = 'scene-1-r1.mp4', rebuild_count = 1 WHERE id = ?").run(sceneId);

    const image = await app.inject({ method: "GET", url: `/sessions/${sessionId}/scenes/${sceneId}/image?r=1` });
    const clip = await app.inject({ method: "GET", url: `/sessions/${sessionId}/scenes/${sceneId}/download/video?r=1` });

    expect(image.statusCode).toBe(200);
    expect(clip.statusCode).toBe(200);
  });
});
