import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createScene, getRun, markImageComplete, markSceneFailed, PROJECTS_ROOT, resetAll } from "../src/db.ts";
import { toSnapshot } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";

// show-scene-results-and-actions (JOS-151), group 2 — design Decisions 1 and 2:
// a read-only image route, scoped by (session, scene), confined to the
// session's project folder.

const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4, 5, 6, 7, 8]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5, 4, 3, 2]);

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

async function startPausedSession(): Promise<{ sessionId: string; projectFolder: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { title: "Image route", script: "A harbor at dusk.", language: "en" },
  });
  const sessionId = res.json().session.sessionId as string;
  await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
  return { sessionId, projectFolder: getRun(sessionId)!.projectFolder };
}

function storeFile(projectFolder: string, relativePath: string, bytes: Buffer): void {
  const fullPath = join(PROJECTS_ROOT, projectFolder, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, bytes);
}

function sceneWithResult(sessionId: string, index: number, result: string | null): string {
  const sceneId = randomUUID();
  createScene(sceneId, sessionId, index, "success", 100);
  if (result !== null) markImageComplete(sceneId, result);
  return sceneId;
}

function imageUrl(sessionId: string, sceneId: string): string {
  return `/sessions/${sessionId}/scenes/${sceneId}/image`;
}

describe("A scene's stored image is served read-only (JOS-151)", () => {
  it("answers 200, image/png and the file's exact bytes for a stored .png", async () => {
    const { sessionId, projectFolder } = await startPausedSession();
    storeFile(projectFolder, "scene-1-attempt-1.png", PNG_BYTES);
    const sceneId = sceneWithResult(sessionId, 1, "scene-1-attempt-1.png");

    const res = await app.inject({ method: "GET", url: imageUrl(sessionId, sceneId) });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.rawPayload.equals(PNG_BYTES)).toBe(true);
  });

  it("answers image/jpeg for a stored .jpg", async () => {
    const { sessionId, projectFolder } = await startPausedSession();
    storeFile(projectFolder, "scene-1-attempt-1.jpg", JPEG_BYTES);
    const sceneId = sceneWithResult(sessionId, 1, "scene-1-attempt-1.jpg");

    const res = await app.inject({ method: "GET", url: imageUrl(sessionId, sceneId) });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.rawPayload.equals(JPEG_BYTES)).toBe(true);
  });

  it("answers 404 for a scene asked for under another session's identifier", async () => {
    const owner = await startPausedSession();
    const other = await startPausedSession();
    storeFile(owner.projectFolder, "scene-1-attempt-1.png", PNG_BYTES);
    const sceneId = sceneWithResult(owner.sessionId, 1, "scene-1-attempt-1.png");

    const res = await app.inject({ method: "GET", url: imageUrl(other.sessionId, sceneId) });

    expect(res.statusCode).toBe(404);
    expect(res.rawPayload.equals(PNG_BYTES)).toBe(false);
  });

  it("answers 404 for a scene with no stored result", async () => {
    const { sessionId } = await startPausedSession();
    const sceneId = sceneWithResult(sessionId, 1, null);

    const res = await app.inject({ method: "GET", url: imageUrl(sessionId, sceneId) });

    expect(res.statusCode).toBe(404);
  });

  it("answers 404 when the stored file is missing", async () => {
    const { sessionId } = await startPausedSession();
    const sceneId = sceneWithResult(sessionId, 1, "scene-1-attempt-1.png");

    const res = await app.inject({ method: "GET", url: imageUrl(sessionId, sceneId) });

    expect(res.statusCode).toBe(404);
  });

  it("answers 404 for a stored file with an unrecognised extension, without serving it", async () => {
    const { sessionId, projectFolder } = await startPausedSession();
    storeFile(projectFolder, "scene-1.txt", Buffer.from("stub text"));
    const sceneId = sceneWithResult(sessionId, 1, "scene-1.txt");

    const res = await app.inject({ method: "GET", url: imageUrl(sessionId, sceneId) });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain("stub text");
  });

  it("answers 404 for a stored bare provider string that is not a file", async () => {
    const { sessionId } = await startPausedSession();
    const sceneId = sceneWithResult(sessionId, 1, "stub-image-provider");

    const res = await app.inject({ method: "GET", url: imageUrl(sessionId, sceneId) });

    expect(res.statusCode).toBe(404);
  });

  it("refuses a stored path that escapes the project folder and never reads the outside file", async () => {
    const victim = await startPausedSession();
    const attacker = await startPausedSession();
    storeFile(victim.projectFolder, "scene-1.png", PNG_BYTES);
    const escapingPath = `../${victim.projectFolder}/scene-1.png`;
    const sceneId = sceneWithResult(attacker.sessionId, 1, escapingPath);

    const res = await app.inject({ method: "GET", url: imageUrl(attacker.sessionId, sceneId) });

    expect(res.statusCode).toBe(404);
    expect(res.rawPayload.equals(PNG_BYTES)).toBe(false);
  });

  it("is documented in the generated OpenAPI with no request body", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const document = res.json() as { paths: Record<string, { get?: { requestBody?: unknown } }> };

    const operation = document.paths["/sessions/{sessionId}/scenes/{sceneId}/image"]?.get;
    expect(operation).toBeDefined();
    expect(operation?.requestBody).toBeUndefined();
  });

  it("changes nothing: other methods on the route are not offered", async () => {
    const { sessionId } = await startPausedSession();
    const sceneId = sceneWithResult(sessionId, 1, null);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const res = await app.inject({ method, url: imageUrl(sessionId, sceneId) });
      expect(res.statusCode).toBe(404);
    }
  });
});

// show-scene-results-and-actions (JOS-151), group 3 — design Decision 3: the
// payload carries the image route's path, never the stored file path.
describe("The session read points at a scene's viewable results (JOS-151)", () => {
  async function readScenes(sessionId: string): Promise<Array<Record<string, any>>> {
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    return res.json().scenes as Array<Record<string, any>>;
  }

  it("carries result.imageUrl equal to the image route path for a scene with a stored image", async () => {
    const { sessionId } = await startPausedSession();
    const sceneId = sceneWithResult(sessionId, 1, "scene-1-attempt-1.png");

    const scene = (await readScenes(sessionId))[0]!;

    expect(scene.result).toEqual({ imageUrl: imageUrl(sessionId, sceneId) });
  });

  it("carries the same URL in the live snapshot", async () => {
    const { sessionId } = await startPausedSession();
    const sceneId = sceneWithResult(sessionId, 1, "scene-1-attempt-1.png");

    const snapshot = toSnapshot(sessionId)!;

    expect(snapshot.scenes[0]?.result?.imageUrl).toBe(imageUrl(sessionId, sceneId));
  });

  it("never exposes the stored file path", async () => {
    const { sessionId } = await startPausedSession();
    sceneWithResult(sessionId, 1, "scene-1-attempt-1.png");

    const scene = (await readScenes(sessionId))[0]!;

    expect(JSON.stringify(scene)).not.toContain("scene-1-attempt-1.png");
  });

  it("still carries result.imageUrl for a scene that failed after storing its image", async () => {
    const { sessionId } = await startPausedSession();
    const sceneId = sceneWithResult(sessionId, 1, "scene-1-attempt-1.png");
    markSceneFailed(sceneId, "clip rejected");

    const scene = (await readScenes(sessionId))[0]!;

    expect(scene.state).toBe("failed");
    expect(scene.result).toEqual({ imageUrl: imageUrl(sessionId, sceneId) });
  });

  it("has no result for a scene with nothing stored", async () => {
    const { sessionId } = await startPausedSession();
    sceneWithResult(sessionId, 1, null);

    const scene = (await readScenes(sessionId))[0]!;

    expect(scene.result).toBeUndefined();
  });

  it("carries no videoUrl on any scene", async () => {
    const { sessionId } = await startPausedSession();
    sceneWithResult(sessionId, 1, "scene-1-attempt-1.png");
    sceneWithResult(sessionId, 2, null);

    const scenes = await readScenes(sessionId);

    for (const scene of scenes) expect(scene.result?.videoUrl).toBeUndefined();
  });
});
