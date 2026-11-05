import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { getRun, getScenePauseEdits, setScenePauseEdit } from "../src/db.ts";
import { events } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import { finishedSession, resetRebuildEnvironment, waitFor } from "./rebuildFixtures.ts";

// adjust-scene-pause (JOS-190), group 7 — design Decision 9. The fixture's two scenes each have a 4.3 s pause, a 5 s
// clip and 0.7 s of speech, so each scene's range is 1.8-4.3 s (the 2.0x limit raises the floor from 0.2 s).

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(resetRebuildEnvironment);

const pausePath = (sessionId: string, sceneId: string) => `/sessions/${sessionId}/scenes/${sceneId}/pause`;

async function setPause(sessionId: string, sceneId: string, seconds: unknown) {
  return app.inject({ method: "POST", url: pausePath(sessionId, sceneId), payload: { seconds } });
}

describe("POST /sessions/:sessionId/scenes/:sceneId/pause (design Decision 9)", () => {
  it("stores a valid value and answers with the updated scene", async () => {
    const { runId, sceneIds } = await finishedSession();

    const response = await setPause(runId, sceneIds[0]!, 3.3);

    expect(response.statusCode).toBe(200);
    const scene = response.json();
    expect(scene.sceneId).toBe(sceneIds[0]);
    expect(scene.pause).toEqual({ originalSeconds: 4.3, seconds: 3.3, minSeconds: 1.8, maxSeconds: 4.3, limitedBySpeedFactor: true });
    expect(getScenePauseEdits(runId).get(sceneIds[0]!)).toBe(3.3);
  });

  it("removes the edit when the value is set back to the original", async () => {
    const { runId, sceneIds } = await finishedSession();
    await setPause(runId, sceneIds[0]!, 3.3);

    const response = await setPause(runId, sceneIds[0]!, 4.3);

    expect(response.statusCode).toBe(200);
    expect(response.json().pause.seconds).toBe(4.3);
    expect(getScenePauseEdits(runId).size).toBe(0);
  });

  it("refuses an off-grid value with 422 and a sentence naming the range", async () => {
    const { runId, sceneIds } = await finishedSession();

    const response = await setPause(runId, sceneIds[0]!, 3.35);

    expect(response.statusCode).toBe(422);
    expect(response.json().reason).toMatch(/0\.1 s/);
    expect(response.json().reason).toMatch(/1\.8 s to 4\.3 s/);
    expect(getScenePauseEdits(runId).size).toBe(0);
  });

  it("refuses a value below the minimum and says the speed factor is why", async () => {
    const { runId, sceneIds } = await finishedSession();

    const response = await setPause(runId, sceneIds[0]!, 1.0);

    expect(response.statusCode).toBe(422);
    expect(response.json().reason).toMatch(/1\.8 s/);
    expect(response.json().reason).toMatch(/2\.0×/);
  });

  it("refuses a body that is not a non-negative number", async () => {
    const { runId, sceneIds } = await finishedSession();

    expect((await setPause(runId, sceneIds[0]!, "soon")).statusCode).toBe(400);
    expect((await setPause(runId, sceneIds[0]!, -1)).statusCode).toBe(400);
  });

  it("answers 409 before there is a final video", async () => {
    const { runId, sceneIds } = await finishedSession({ finish: false });

    const response = await setPause(runId, sceneIds[0]!, 3.3);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ ok: false, reason: "no-final-video" });
  });

  it("answers 409 while an assembly is running, and while a rebuild is held", async () => {
    const { runId, sceneIds, setMode } = await finishedSession();
    await setPause(runId, sceneIds[0]!, 3.3);
    setMode({ slowMs: 500 });
    await app.inject({ method: "POST", url: `/sessions/${runId}/final-video/rebuild` });

    const response = await setPause(runId, sceneIds[1]!, 3.3);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ ok: false, reason: "assembly-in-progress" });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
  });

  it("answers 409 for a scene whose pause cannot be derived", async () => {
    const { runId, sceneIds } = await finishedSession({ timestamps: false });

    const response = await setPause(runId, sceneIds[0]!, 3.3);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ ok: false, reason: "no-pause" });
  });

  it("answers 404 for an unknown session, a malformed id and an unknown scene", async () => {
    const { runId } = await finishedSession();

    expect((await setPause("01ARZ3NDEKTSV4RRFFQ69G5FAV", "00000000-0000-4000-8000-000000000000", 3.3)).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/sessions/not-a-ulid/scenes/00000000-0000-4000-8000-000000000000/pause", payload: { seconds: 3 } })).statusCode).toBe(404);
    expect((await setPause(runId, "00000000-0000-4000-8000-000000000000", 3.3)).statusCode).toBe(404);
  });

  it("broadcasts the new value to a live page", async () => {
    const { runId, sceneIds } = await finishedSession();
    const seen: number[] = [];
    const listener = (snapshot: { session: { sessionId: string }; scenes: Array<{ sceneId: string; pause?: { seconds: number } }> }) => {
      if (snapshot.session.sessionId !== runId) return;
      const seconds = snapshot.scenes.find((scene) => scene.sceneId === sceneIds[0])?.pause?.seconds;
      if (seconds !== undefined) seen.push(seconds);
    };
    events.on("state", listener);
    try {
      await setPause(runId, sceneIds[0]!, 2.6);
    } finally {
      events.off("state", listener);
    }

    expect(seen).toContain(2.6);
  });
});

describe("POST /sessions/:sessionId/final-video/rebuild", () => {
  it("accepts a rebuild with pending edits (202) and reaches version 2", async () => {
    const { runId, sceneIds } = await finishedSession();
    await setPause(runId, sceneIds[0]!, 3.3);

    const response = await app.inject({ method: "POST", url: `/sessions/${runId}/final-video/rebuild` });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");
  });

  it("answers 409 with the reasons from the spec, and 404 for an unknown session", async () => {
    const { runId } = await finishedSession();
    const unfinished = await finishedSession({ finish: false });

    const nothing = await app.inject({ method: "POST", url: `/sessions/${runId}/final-video/rebuild` });
    const noVideo = await app.inject({ method: "POST", url: `/sessions/${unfinished.runId}/final-video/rebuild` });
    const unknown = await app.inject({ method: "POST", url: "/sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV/final-video/rebuild" });

    expect(nothing.statusCode).toBe(409);
    expect(nothing.json()).toEqual({ ok: false, reason: "nothing-to-rebuild" });
    expect(noVideo.statusCode).toBe(409);
    expect(noVideo.json()).toEqual({ ok: false, reason: "no-final-video" });
    expect(unknown.statusCode).toBe(404);
  });
});

describe("the session read (design Decision 9)", () => {
  async function read(sessionId: string) {
    return (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json<{
      session: { finalVideo?: { version: number; pendingPauseEdits: boolean; staleScenes: boolean; rebuildFailure?: { cause: string } } };
      scenes: Array<{ pause?: { originalSeconds: number; seconds: number; minSeconds: number; maxSeconds: number; limitedBySpeedFactor: boolean } }>;
    }>();
  }

  it("carries each scene's pause and the final video's version once a final video exists", async () => {
    const { runId } = await finishedSession();

    const body = await read(runId);

    expect(body.session.finalVideo).toEqual({ version: 1, pendingPauseEdits: false, staleScenes: false });
    expect(body.scenes.map((scene) => scene.pause)).toEqual([
      { originalSeconds: 4.3, seconds: 4.3, minSeconds: 1.8, maxSeconds: 4.3, limitedBySpeedFactor: true },
      { originalSeconds: 4.3, seconds: 4.3, minSeconds: 1.8, maxSeconds: 4.3, limitedBySpeedFactor: true },
    ]);
  });

  it("carries neither before the final video exists", async () => {
    const { runId } = await finishedSession({ finish: false });

    const body = await read(runId);

    expect(body.session.finalVideo).toBeUndefined();
    expect(body.scenes.every((scene) => scene.pause === undefined)).toBe(true);
  });

  it("carries no pause for a session whose timestamps are missing", async () => {
    const { runId } = await finishedSession({ timestamps: false });

    const body = await read(runId);

    expect(body.scenes.every((scene) => scene.pause === undefined)).toBe(true);
    expect(body.session.finalVideo).toEqual({ version: 1, pendingPauseEdits: false, staleScenes: false });
  });

  it("reports pending edits, then the new version and no pending edits after the rebuild", async () => {
    const { runId, sceneIds } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);

    expect((await read(runId)).session.finalVideo).toEqual({ version: 1, pendingPauseEdits: true, staleScenes: false });

    await app.inject({ method: "POST", url: `/sessions/${runId}/final-video/rebuild` });
    await waitFor(() => getRun(runId)?.finalVideoPath === "final-video-2.mp4");

    expect((await read(runId)).session.finalVideo).toEqual({ version: 2, pendingPauseEdits: false, staleScenes: false });
  });

  it("reports why the last rebuild failed, keeping the current version", async () => {
    const { runId, sceneIds, setMode } = await finishedSession();
    setScenePauseEdit(runId, sceneIds[0]!, 3.3);
    setMode("transient");

    await app.inject({ method: "POST", url: `/sessions/${runId}/final-video/rebuild` });
    await waitFor(() => getRun(runId)?.rebuildRequestedAt === null);

    const failure = (await read(runId)).session.finalVideo;
    expect(failure?.version).toBe(1);
    expect(failure?.pendingPauseEdits).toBe(true);
    expect(failure?.rebuildFailure?.cause).toMatch(/current final video/i);
    expect(failure?.rebuildFailure?.cause).not.toMatch(/\/\S+\.mp4/);
  });
});

describe("the generated OpenAPI document", () => {
  it("documents both routes and the new read fields", async () => {
    const document = (await app.inject({ method: "GET", url: "/docs/json" })).json<{ paths: Record<string, Record<string, unknown>> }>();
    const text = JSON.stringify(document);

    expect(document.paths["/sessions/{sessionId}/scenes/{sceneId}/pause"]?.post).toBeDefined();
    expect(document.paths["/sessions/{sessionId}/final-video/rebuild"]?.post).toBeDefined();
    for (const field of ["pendingPauseEdits", "rebuildFailure", "limitedBySpeedFactor", "originalSeconds"]) {
      expect(text).toContain(field);
    }
  });
});
