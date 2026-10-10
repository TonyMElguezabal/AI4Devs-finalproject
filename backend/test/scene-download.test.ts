import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/server.ts";
import { createScene, db, getRun, resetAll, writeArtefactOnce } from "../src/db.ts";

// download-scene-results (JOS-163), group 2 — design Decisions 1, 2 and 4:
// availability is "the file exists" (`scenes.result` / `scenes.video_result`),
// not a scene state; one handler serves both kinds, reusing the final-video
// attachment pattern; `kind` stays `image | video`, so AC4 is held by
// construction.

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const MP4_BYTES = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
  await app.ready();
});

async function startSession(title = "Download test"): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/sessions", payload: { title, script: "A short script.", language: "en" } });
  return res.json().session.sessionId as string;
}

/** A scene forced to a given status, with real image/clip bytes on disk when given, so the download route reads real files. */
function createSceneWith(
  sessionId: string,
  index: number,
  opts: { status: string; image?: boolean; video?: boolean },
): string {
  const sceneId = randomUUID();
  createScene(sceneId, sessionId, index, "success", 100);
  const run = getRun(sessionId)!;
  const imagePath = opts.image ? writeArtefactOnce(run.projectFolder, `scene-${index}.png`, PNG_BYTES) : null;
  const videoPath = opts.video ? writeArtefactOnce(run.projectFolder, `scene-${index}.mp4`, MP4_BYTES) : null;
  db.prepare("UPDATE scenes SET status = ?, result = ?, video_result = ? WHERE id = ?").run(opts.status, imagePath, videoPath, sceneId);
  return sceneId;
}

function download(sessionId: string, sceneId: string, kind: string) {
  return app.inject({ method: "GET", url: `/sessions/${sessionId}/scenes/${sceneId}/download/${kind}` });
}

describe("A scene's image downloads as soon as it exists (AC1, AC3)", () => {
  it("downloads an image-complete scene's image with attachment headers, while another scene is submitted", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "image-complete", image: true });
    createSceneWith(sessionId, 2, { status: "submitted" });

    const res = await download(sessionId, sceneId, "image");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="scene-1-image.png"');
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["content-length"]).toBe(String(PNG_BYTES.length));
    expect(res.rawPayload.equals(PNG_BYTES)).toBe(true);
  });

  it("downloads the image of a video-generating scene", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "video-generating", image: true });

    const res = await download(sessionId, sceneId, "image");
    expect(res.statusCode).toBe(200);
  });

  it("downloads the image of a scene whose clip failed", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "failed", image: true });

    const res = await download(sessionId, sceneId, "image");
    expect(res.statusCode).toBe(200);
  });

  it("downloads a successful scene's image while another scene is failed", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "chunk-complete", image: true, video: true });
    createSceneWith(sessionId, 2, { status: "failed" });

    const res = await download(sessionId, sceneId, "image");
    expect(res.statusCode).toBe(200);
  });
});

describe("A scene's clip downloads as soon as it exists (AC2, AC3)", () => {
  it("downloads a chunk-complete scene's clip with attachment headers", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "chunk-complete", image: true, video: true });

    const res = await download(sessionId, sceneId, "video");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="scene-1-clip.mp4"');
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["content-length"]).toBe(String(MP4_BYTES.length));
    expect(res.rawPayload.equals(MP4_BYTES)).toBe(true);
  });

  it("downloads a successful scene's clip while another scene is failed", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "chunk-complete", image: true, video: true });
    createSceneWith(sessionId, 2, { status: "failed" });

    const res = await download(sessionId, sceneId, "video");
    expect(res.statusCode).toBe(200);
  });
});

describe("Not yet available and not found (design Decision 2)", () => {
  it("answers 409 for an image that does not exist yet", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "submitted" });
    const res = await download(sessionId, sceneId, "image");
    expect(res.statusCode).toBe(409);
  });

  it("answers 409 for a clip that does not exist yet", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "video-generating", image: true });
    const res = await download(sessionId, sceneId, "video");
    expect(res.statusCode).toBe(409);
  });

  it("answers 404 for an unknown scene", async () => {
    const sessionId = await startSession();
    const res = await download(sessionId, randomUUID(), "image");
    expect(res.statusCode).toBe(404);
  });

  it("answers 404 for a scene requested through a different session", async () => {
    const sessionA = await startSession("Session A");
    const sessionB = await startSession("Session B");
    const sceneOfA = createSceneWith(sessionA, 1, { status: "chunk-complete", image: true });

    const res = await download(sessionB, sceneOfA, "image");
    expect(res.statusCode).toBe(404);
  });

  it("answers 404 when the stored reference has no file on disk", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "chunk-complete" });
    // A stored reference with no real file (simulates a missing/removed artefact).
    db.prepare("UPDATE scenes SET result = ? WHERE id = ?").run("scene-1.png", sceneId);

    const res = await download(sessionId, sceneId, "image");
    expect(res.statusCode).toBe(404);
  });

  it("answers 404 for a stored reference that resolves outside the project folder", async () => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "chunk-complete" });
    db.prepare("UPDATE scenes SET result = ? WHERE id = ?").run("../escaped.png", sceneId);

    const res = await download(sessionId, sceneId, "image");
    expect(res.statusCode).toBe(404);
  });
});

describe("Only image and video are accepted kinds (AC4, design Decision 4)", () => {
  it.each(["voice-over", "timestamps", "texts"])("answers 400 for kind '%s'", async (kind) => {
    const sessionId = await startSession();
    const sceneId = createSceneWith(sessionId, 1, { status: "chunk-complete", image: true, video: true });
    const res = await download(sessionId, sceneId, kind);
    expect(res.statusCode).toBe(400);
  });
});
