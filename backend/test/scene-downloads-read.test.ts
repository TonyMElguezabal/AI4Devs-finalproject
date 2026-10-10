import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createScene, db, resetAll } from "../src/db.ts";
import { broadcast, events } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import type { SessionSnapshot } from "../src/types.ts";

// download-scene-results (JOS-163), group 3, design Decision 3 — the session
// read (and the SSE scene event, built by the same `sceneToPayload`) carries
// `downloads.imageUrl`/`clipUrl` only for the files that actually exist, so
// the page never needs to derive availability from state.

let app: FastifyInstance;
const received: SessionSnapshot[] = [];
const onState = (snapshot: SessionSnapshot) => received.push(snapshot);

beforeEach(async () => {
  resetAll();
  received.length = 0;
  events.on("state", onState);
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  events.off("state", onState);
  await app.close();
});

async function startSession(): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Downloads read test", script: "A short script.", language: "en" } });
  return res.json().session.sessionId as string;
}

function forceScene(sessionId: string, index: number, opts: { result?: string | null; videoResult?: string | null }): string {
  const sceneId = randomUUID();
  createScene(sceneId, sessionId, index, "success", 100);
  db.prepare("UPDATE scenes SET result = ?, video_result = ? WHERE id = ?").run(opts.result ?? null, opts.videoResult ?? null, sceneId);
  return sceneId;
}

const read = async (sessionId: string) => (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json();

describe("Scene downloads in the session read", () => {
  it("has only imageUrl for a scene with an image and no clip", async () => {
    const sessionId = await startSession();
    forceScene(sessionId, 1, { result: "scene-1.png" });

    const body = await read(sessionId);

    expect(body.scenes[0].downloads).toEqual({ imageUrl: `/sessions/${sessionId}/scenes/${body.scenes[0].sceneId}/download/image` });
  });

  it("has both imageUrl and clipUrl for a complete scene", async () => {
    const sessionId = await startSession();
    forceScene(sessionId, 1, { result: "scene-1.png", videoResult: "scene-1.mp4" });

    const body = await read(sessionId);
    const sceneId = body.scenes[0].sceneId;

    expect(body.scenes[0].downloads).toEqual({
      imageUrl: `/sessions/${sessionId}/scenes/${sceneId}/download/image`,
      clipUrl: `/sessions/${sessionId}/scenes/${sceneId}/download/video`,
    });
  });

  it("has no downloads field for a scene with neither", async () => {
    const sessionId = await startSession();
    forceScene(sessionId, 1, {});

    const body = await read(sessionId);

    expect(body.scenes[0]).not.toHaveProperty("downloads");
  });

  it("carries the same downloads field on the SSE scene event", async () => {
    const sessionId = await startSession();
    forceScene(sessionId, 1, { result: "scene-1.png" });
    received.length = 0;

    broadcast(sessionId);

    const scenes = (received.at(-1) as unknown as { scenes: Array<{ downloads?: unknown }> }).scenes;
    expect(scenes[0]!.downloads).toEqual({ imageUrl: expect.stringContaining("/download/image") });
  });
});

describe("No download entry for the voice-over, timestamps or generated texts (AC4)", () => {
  it("exposes no field for them on the session or on any scene", async () => {
    const sessionId = await startSession();
    forceScene(sessionId, 1, { result: "scene-1.png", videoResult: "scene-1.mp4" });

    const body = await read(sessionId);
    const text = JSON.stringify(body);

    for (const forbidden of ["voice-over.mp3", "voiceOverUrl", "timestampsUrl", "generatedTextsUrl", "textsUrl"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
