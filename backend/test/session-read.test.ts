import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server.ts";
import { createRun, createScene, db, resetAll, commitSceneResult } from "../src/db.ts";
import { pauseSession, continueSession } from "../src/orchestrator.ts";
import type { FastifyInstance } from "fastify";

// consult-session (JOS-135) — the session read, GET /sessions/{sessionId}.
// This is Decision 1's "one read serves consultation and resync" endpoint,
// already implemented by define-backend-stack's skeleton for the live-update
// resync case; this file proves it also satisfies every consultation
// guarantee this story adds.

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
});

async function startSession(overrides: Partial<{ title: string; script: string; language: string }> = {}) {
  const res = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { title: "A Trip", script: "A wide shot of a harbor.", language: "en", ...overrides },
  });
  return res.json().session.sessionId as string;
}

describe("A session can be consulted by its identifier (3.1)", () => {
  it("returns title, script, language, state, paused marker, creation time and scenes", async () => {
    const sessionId = await startSession({ title: "My Trip", script: "Script text." });
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session).toMatchObject({
      sessionId,
      title: "My Trip",
      script: "Script text.",
      language: "en",
      state: "submitted",
      paused: false,
    });
    expect(body.session.createdAt).toBeTruthy();
    expect(body.scenes).toEqual([]);
  });
});

describe("The script is shown as submitted (3.2)", () => {
  it("returns the script identical to what was stored", async () => {
    const script = "  Leading and trailing space, and a comma, preserved.  ";
    const sessionId = await startSession({ script });
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(res.json().session.script).toBe(script);
  });
});

describe("A session with no scenes is not an error (3.3)", () => {
  it("returns an empty scene list with 200, not an error", async () => {
    const sessionId = await startSession();
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().scenes).toEqual([]);
  });
});

describe("Scenes are presented in identifier order (3.4, Decision 3)", () => {
  it("returns scenes in ascending order regardless of completion order", async () => {
    const sessionId = await startSession();
    const scene3 = randomUUID();
    const scene1 = randomUUID();
    const scene2 = randomUUID();
    // Created out of index order, and scene 3 "completes" (is updated) before 1/2.
    createScene(scene3, sessionId, 3, "success", 100);
    createScene(scene1, sessionId, 1, "success", 100);
    createScene(scene2, sessionId, 2, "success", 100);
    db.prepare("UPDATE scenes SET status = 'chunk-complete', updated_at = ? WHERE id = ?").run(
      new Date(Date.now() + 1000).toISOString(),
      scene3,
    );

    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    const indices = res.json().scenes.map((s: { index: number }) => s.index);
    expect(indices).toEqual([1, 2, 3]);
  });
});

describe("An unknown or malformed identifier is reported as not found (3.5, Decision 4)", () => {
  it("reports not found for an identifier that matches no session", async () => {
    const res = await app.inject({ method: "GET", url: "/sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV" }); // valid ULID shape, no such session
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeTruthy();
  });

  it("reports not found (not a validation error) for a malformed identifier", async () => {
    const res = await app.inject({ method: "GET", url: "/sessions/not-a-valid-identifier-at-all" });
    expect(res.statusCode).toBe(404); // NOT 400 — Decision 4: malformed looks the same as unknown
    expect(res.json().error).toBeTruthy();
  });

  it("reveals nothing about other sessions when the identifier is unknown", async () => {
    await startSession({ title: "Real Session" });
    const res = await app.inject({ method: "GET", url: "/sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV" });
    expect(JSON.stringify(res.json())).not.toContain("Real Session");
  });
});

describe("No account or authentication is requested (3.7)", () => {
  it("succeeds with no Authorization header of any kind", async () => {
    const sessionId = await startSession();
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` }); // no auth header sent at all
    expect(res.statusCode).toBe(200);
  });
});

describe("Sessions remain consultable indefinitely (3.8, §12.2)", () => {
  it("returns a session created long ago normally", async () => {
    const sessionId = await startSession();
    db.prepare("UPDATE runs SET created_at = ? WHERE id = ?").run("2001-01-01T00:00:00.000Z", sessionId);
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.createdAt).toBe("2001-01-01T00:00:00.000Z");
  });
});

describe("Locally-only artefacts are not exposed (3.6, Decision 7)", () => {
  it("exposes no MP3, timestamp or generated-text field on the session", async () => {
    const sessionId = await startSession();
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    const sessionKeys = Object.keys(res.json().session);
    for (const forbidden of ["voiceOver", "mp3", "timestamps", "generatedTexts", "script_mp3", "narrationPath"]) {
      expect(sessionKeys).not.toContain(forbidden);
    }
  });
});

describe("A consulted session shows only its own data — file access (spec scenario)", () => {
  it("refuses a scene download requested through a different session", async () => {
    const sessionA = await startSession({ title: "Session A" });
    const sessionB = await startSession({ title: "Session B" });
    const sceneOfA = randomUUID();
    createScene(sceneOfA, sessionA, 1, "success", 100);
    // The download route gates on `chunk-complete` specifically (§12.3, out
    // of scope for JOS-145/JOS-146 until assembly exists); this test is
    // about session isolation, not the image stage, so it sets that status
    // directly rather than through either stage's own completion helper.
    db.prepare("UPDATE scenes SET status = 'chunk-complete', result = ? WHERE id = ?").run("scene-1.png", sceneOfA);
    commitSceneResult(sceneOfA, "scene-1.png");

    // Session A's own scene downloads fine...
    const ownRes = await app.inject({ method: "GET", url: `/sessions/${sessionA}/scenes/${sceneOfA}/download/image` });
    expect(ownRes.statusCode).toBe(200);

    // ...but the same scene requested through session B's address does not.
    const crossRes = await app.inject({ method: "GET", url: `/sessions/${sessionB}/scenes/${sceneOfA}/download/image` });
    expect(crossRes.statusCode).toBe(404);
  });
});

describe("One read serves consultation and resynchronisation (3.9, Decision 1)", () => {
  it("returns the same session/scene field shapes the live-update wire contract defines", async () => {
    const sessionId = await startSession();
    createScene(randomUUID(), sessionId, 1, "success", 100, "an instruction");
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    const body = res.json();
    expect(body.session.type).toBe("session");
    expect(Object.keys(body.session).sort()).toEqual(
      ["type", "sessionId", "title", "script", "language", "state", "paused", "held", "createdAt", "updatedAt"].sort(),
    );
    expect(body.scenes[0].type).toBe("scene");
    expect(body.scenes[0]).toHaveProperty("sceneId");
    expect(body.scenes[0]).toHaveProperty("state");
  });
});

// JOS-152 task 7.1 — held fields on session and scene payloads
describe("held field on session and scene payloads (JOS-152, task 7.1)", () => {
  it("a non-paused session reports an empty held array and no held scene", async () => {
    const sessionId = await startSession({ title: "Open session", script: "Not paused." });
    createScene(randomUUID(), sessionId, 1, "success", 100, "instruction");
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    const body = res.json();
    expect(body.session.held).toEqual([]);
    expect(body.scenes.every((s: { held?: boolean }) => !s.held)).toBe(true);
  });

  it("a paused session with a submitted scene reports held and scene held flag", async () => {
    const sessionId = await startSession({ title: "Held session", script: "Paused." });
    createScene(randomUUID(), sessionId, 1, "success", 100, "instruction");
    pauseSession(sessionId);
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    const body = res.json();
    expect(body.session.paused).toBe(true);
    expect(body.session.held).toEqual([{ stage: "image", count: 1 }]);
    expect(body.scenes[0].held).toBe(true);
  });

  it("a paused session with no submitted scenes reports empty held", async () => {
    const sessionId = await startSession({ title: "Paused but empty", script: "Empty." });
    pauseSession(sessionId);
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    const body = res.json();
    expect(body.session.paused).toBe(true);
    expect(body.session.held).toEqual([]);
  });

  it("after continue the held array is empty and scene held flag is gone", async () => {
    const sessionId = await startSession({ title: "Continue session", script: "Resume." });
    createScene(randomUUID(), sessionId, 1, "success", 100, "instruction");
    pauseSession(sessionId);
    continueSession(sessionId);
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    const body = res.json();
    expect(body.session.paused).toBe(false);
    expect(body.session.held).toEqual([]);
    expect(body.scenes.every((s: { held?: boolean }) => !s.held)).toBe(true);
  });
});
