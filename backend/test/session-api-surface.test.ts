import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { events } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import type { SessionSnapshot } from "../src/types.ts";
import { completeStageAttempt, createScene, getRun, markSceneFailed, recordStageAttempt, resetAll, setRunFailure, setRunPaused } from "../src/db.ts";
import { createDecompositionFailure } from "../src/sessionStateMachine.ts";

// lock-script-and-narration (JOS-137), group 6 — PRD §4.2, D10: the API offers
// no way to modify a session's script, title or language, or to regenerate,
// replace or delete its narration. There is no route to add here: these tests
// prove the absence, and prove that the one operation that takes a body
// ignores locked fields.

let app: FastifyInstance;

const ORIGINAL = { title: "Locked title", script: "The locked script, exactly as submitted.", language: "en" };

beforeEach(async () => {
  resetAll();
  app = await buildApp();
  await app.ready();
});

async function startSession(): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/sessions", payload: ORIGINAL });
  expect(res.statusCode).toBe(201);
  return res.json().session.sessionId as string;
}

function offeredRoutes(): string {
  return app.printRoutes({ commonPrefix: false });
}

describe("The API offers no operation that modifies the locked content (AC1)", () => {
  it("sees the real routes (positive control), so an empty listing cannot pass the checks below", () => {
    const routes = offeredRoutes();
    expect(routes).toContain("sessions");
    expect(routes).toMatch(/\(POST\)/);
    expect(routes).toMatch(/\(GET, HEAD\)/);
  });

  it("offers no PUT, PATCH or DELETE route at all", () => {
    const routes = offeredRoutes();
    expect(routes).not.toMatch(/\bPUT\b/);
    expect(routes).not.toMatch(/\bPATCH\b/);
    expect(routes).not.toMatch(/\bDELETE\b/);
  });

  it("offers no route that names the voice-over or narration", () => {
    expect(offeredRoutes()).not.toMatch(/voice|narration|audio|mp3/i);
  });

  it.each(["PUT", "PATCH", "DELETE"] as const)("answers %s on a session with not found, and changes nothing", async (method) => {
    const sessionId = await startSession();

    const res = await app.inject({ method, url: `/sessions/${sessionId}`, payload: { script: "A rewritten script." } });

    expect(res.statusCode).toBe(404);
    expect(getRun(sessionId)).toMatchObject(ORIGINAL);
  });

  it.each([
    ["PUT", "voice-over"],
    ["POST", "voice-over"],
    ["DELETE", "voice-over"],
    ["POST", "voice-over/regenerate"],
    ["POST", "narration"],
    ["GET", "voice-over/download"],
  ] as const)("has no %s /sessions/:id/%s", async (method, suffix) => {
    const sessionId = await startSession();
    const res = await app.inject({ method, url: `/sessions/${sessionId}/${suffix}`, payload: {} });
    expect(res.statusCode).toBe(404);
  });
});

describe("An operation that accepts a body ignores locked fields (AC1)", () => {
  async function failedSceneOf(sessionId: string): Promise<string> {
    const sceneId = randomUUID();
    createScene(sceneId, sessionId, 1, "success", 100, "the original instruction");
    markSceneFailed(sceneId, "the provider failed");
    // Hold the retry: a paused session launches nothing, so no provider timer outlives the test.
    setRunPaused(sessionId, true);
    return sceneId;
  }

  it("leaves the script, title and language unchanged when the correction body names them", async () => {
    const sessionId = await startSession();
    const sceneId = await failedSceneOf(sessionId);

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${sceneId}/correct`,
      payload: { instruction: "a corrected instruction", script: "hacked script", title: "hacked title", language: "es" },
    });

    expect(res.statusCode).toBe(200);
    expect(getRun(sessionId)).toMatchObject(ORIGINAL);
  });

  it("leaves the script unchanged when the body carries only locked fields", async () => {
    const sessionId = await startSession();
    const sceneId = await failedSceneOf(sessionId);

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${sceneId}/correct`,
      payload: { script: "hacked script" },
    });

    expect(res.statusCode).toBe(400);
    expect(getRun(sessionId)).toMatchObject(ORIGINAL);
  });

  it("leaves the script unchanged when the scene is not failed and the correction is refused", async () => {
    const sessionId = await startSession();
    const sceneId = randomUUID();
    createScene(sceneId, sessionId, 1, "success", 100, "the original instruction");
    setRunPaused(sessionId, true);

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${sceneId}/correct`,
      payload: { instruction: "too early", script: "hacked script" },
    });

    expect(res.statusCode).toBe(409);
    expect(getRun(sessionId)).toMatchObject(ORIGINAL);
  });

  it("returns the original script from the session read after all of the above", async () => {
    const sessionId = await startSession();
    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(res.json().session).toMatchObject({ title: ORIGINAL.title, script: ORIGINAL.script, language: ORIGINAL.language });
  });
});

// JOS-152 task 7.3 — pause and continue endpoint behavior
describe("pause and continue endpoints (JOS-152, task 7.3)", () => {
  it("pause twice answers 200 { ok: true } both times", async () => {
    const sessionId = await startSession();
    const r1 = await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
    const r2 = await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toEqual({ ok: true });
    expect(r2.statusCode).toBe(200);
    expect(r2.json()).toEqual({ ok: true });
  });

  it("continue twice answers 200 { ok: true } both times", async () => {
    const sessionId = await startSession();
    await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
    const r1 = await app.inject({ method: "POST", url: `/sessions/${sessionId}/continue` });
    const r2 = await app.inject({ method: "POST", url: `/sessions/${sessionId}/continue` });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toEqual({ ok: true });
    expect(r2.statusCode).toBe(200);
    expect(r2.json()).toEqual({ ok: true });
  });

  it("pause on unknown session answers 404", async () => {
    const res = await app.inject({ method: "POST", url: `/sessions/01AAAAAAAAAAAAAAAAAAAAAAAA/pause` });
    expect(res.statusCode).toBe(404);
    expect(res.json().ok).toBe(false);
  });

  it("continue on unknown session answers 404", async () => {
    const res = await app.inject({ method: "POST", url: `/sessions/01AAAAAAAAAAAAAAAAAAAAAAAA/continue` });
    expect(res.statusCode).toBe(404);
    expect(res.json().ok).toBe(false);
  });
});

// view-progress-by-phase (JOS-168), task 4.1 — the session representation lists
// the four phases, in the read and in every live snapshot.
describe("The session representation carries the phases (JOS-168)", () => {
  it("lists the four phases in pipeline order on a newly registered session", async () => {
    const sessionId = await startSession();

    const session = (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json().session;

    expect(session.phases).toEqual([
      { phase: "voice-over", status: "pending", heldCount: 0 },
      { phase: "decomposition", status: "pending", heldCount: 0 },
      { phase: "scenes", status: "pending", heldCount: 0 },
      { phase: "assembly", status: "pending", heldCount: 0 },
    ]);
  });

  it("carries the same phases in a live snapshot as in the read", async () => {
    const sessionId = await startSession();
    const received: SessionSnapshot[] = [];
    const onState = (snapshot: SessionSnapshot) => received.push(snapshot);
    events.on("state", onState);
    try {
      await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
    } finally {
      events.off("state", onState);
    }

    const read = (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json().session;
    const live = received.filter((snapshot) => snapshot.session.sessionId === sessionId).at(-1);

    expect(live?.session.phases).toEqual(read.phases);
  });

  it("documents phases and its four statuses in the generated OpenAPI", async () => {
    const document = JSON.stringify((await app.inject({ method: "GET", url: "/docs/json" })).json());

    expect(document).toContain('"phases"');
    for (const status of ["pending", "in-progress", "complete", "failed"]) expect(document).toContain(`"${status}"`);
  });
});

// retry-decomposition (JOS-156), group 6 — design Decision 1: the retry route.
describe("POST /sessions/:sessionId/decomposition/retry (JOS-156)", () => {
  const retryUrl = (sessionId: string) => `/sessions/${sessionId}/decomposition/retry`;

  /** A paused session that failed in decomposition, so an accepted retry is held and no provider is reached. */
  async function failedPausedSession(retryable = true): Promise<string> {
    const sessionId = await startSession();
    const now = new Date().toISOString();
    const attempt = recordStageAttempt({ runId: sessionId, stage: "timestamps", providerId: "elevenlabs-forced-alignment", queuedAt: now, sentAt: now });
    completeStageAttempt(attempt.id, { outcome: retryable ? "transient" : "not-retryable", finishedAt: now, errorMessage: "alignment answered HTTP 503" });
    setRunFailure(sessionId, createDecompositionFailure({ cause: "the narration's timestamps could not be obtained", retryable, occurredAt: new Date(), cycle: attempt.cycle, attemptsInCycle: attempt.sequenceInCycle }));
    setRunPaused(sessionId, true);
    return sessionId;
  }

  it("answers 200 { ok: true, held: true } for an accepted retry on a paused session", async () => {
    const sessionId = await failedPausedSession();

    const res = await app.inject({ method: "POST", url: retryUrl(sessionId) });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, held: true });
  });

  it.each(["01AAAAAAAAAAAAAAAAAAAAAAAA", "not-a-session-id"])("answers 404 for the session id %s", async (sessionId) => {
    const res = await app.inject({ method: "POST", url: retryUrl(sessionId) });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ ok: false });
  });

  it("answers 409 not-failed-in-decomposition for a session that has not failed", async () => {
    const sessionId = await startSession();

    const res = await app.inject({ method: "POST", url: retryUrl(sessionId) });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ ok: false, reason: "not-failed-in-decomposition" });
  });

  it("answers 409 not-retryable for a failure that is not retryable", async () => {
    const sessionId = await failedPausedSession(false);

    const res = await app.inject({ method: "POST", url: retryUrl(sessionId) });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ ok: false, reason: "not-retryable" });
  });

  it("answers 409 already-registered for a session that has chunks", async () => {
    const sessionId = await failedPausedSession();
    createScene(randomUUID(), sessionId, 1, "success", 100, "an instruction");

    const res = await app.inject({ method: "POST", url: retryUrl(sessionId) });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ ok: false, reason: "already-registered" });
  });

  it("answers 409 retry-already-pending for a second retry", async () => {
    const sessionId = await failedPausedSession();
    await app.inject({ method: "POST", url: retryUrl(sessionId) });

    const res = await app.inject({ method: "POST", url: retryUrl(sessionId) });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ ok: false, reason: "retry-already-pending" });
  });

  it.each([{ script: "hacked script" }, { anything: true }])("answers 400 for a body that names %j, and changes nothing", async (payload) => {
    const sessionId = await failedPausedSession();

    const res = await app.inject({ method: "POST", url: retryUrl(sessionId), payload });

    expect(res.statusCode).toBe(400);
    expect(getRun(sessionId)).toMatchObject(ORIGINAL);
    expect(getRun(sessionId)?.failure).not.toBeNull();
  });

  it("is documented in the generated OpenAPI", async () => {
    const document = (await app.inject({ method: "GET", url: "/docs/json" })).json();

    expect(Object.keys(document.paths)).toContain("/sessions/{sessionId}/decomposition/retry");
  });
});
