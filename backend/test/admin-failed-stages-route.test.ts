import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { getRun, getScene, resetAll } from "../src/db.ts";
import { buildApp } from "../src/server.ts";
import { failImage, failVideo, failVoice, installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";

// move-failed-stage-to-active-provider (JOS-172), group 6 — design Decision 6; JOS-172 AC1 and AC5 on the API side.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  installTwoProvidersPerStage();
  setAdminPasswordReader(() => PASSWORD);
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  resetAdminPasswordReader();
  removeTwoProvidersPerStage();
  resetAll();
});

const list = (headers: Record<string, string> = admin) => app.inject({ method: "GET", url: "/admin/failed-stages", headers });
const move = (payload: unknown, headers: Record<string, string> = admin) => app.inject({ method: "POST", url: "/admin/failed-stages/move", headers, payload: payload as object });

describe("GET /admin/failed-stages", () => {
  it("lists the failed stages on a provider other than the active one, with both providers and the cause (AC1)", async () => {
    const voiceRun = newRun("Voice session");
    failVoice(voiceRun);
    const { runId, sceneIds: [first, second] } = await registerScenes([7, 8], "Scene session");
    failImage(first!);
    failVideo(runId, second!);

    const response = await list();

    expect(response.statusCode).toBe(200);
    const { failedStages } = response.json();
    expect(failedStages).toHaveLength(3);
    expect(failedStages.find((row: { stage: string }) => row.stage === "voice")).toEqual({
      sessionId: voiceRun,
      sessionTitle: "Voice session",
      stage: "voice",
      sceneId: null,
      sceneNumber: null,
      boundProviderId: "stub-a",
      boundProviderLabel: "stub-a",
      activeProviderId: "stub-b",
      activeProviderLabel: "stub-b",
      cause: "the voice provider answered HTTP 503",
    });
    expect(failedStages.filter((row: { sceneNumber: number | null }) => row.sceneNumber !== null).map((row: { stage: string; sceneNumber: number }) => [row.stage, row.sceneNumber]).sort()).toEqual([["image", 1], ["video", 2]]);
  });

  it("is empty when every failed stage is on the active provider", async () => {
    failVoice(newRun(), "stub-b");
    expect((await list()).json()).toEqual({ failedStages: [] });
  });
});

describe("POST /admin/failed-stages/move", () => {
  it("moves a failed voice stage and answers the new provider", async () => {
    const runId = newRun();
    failVoice(runId);
    const response = await move({ sessionId: runId, stage: "voice" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ moved: { sessionId: runId, stage: "voice", sceneId: null, providerId: "stub-b", providerLabel: "stub-b", requestedDurationSeconds: null } });
    expect(getRun(runId)!.voiceProviderId).toBe("stub-b");
  });

  it("moves a failed clip and answers its requested duration", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([8]);
    failVideo(runId, scene!);
    const response = await move({ sessionId: runId, stage: "video", sceneId: scene });
    expect(response.statusCode).toBe(200);
    expect(response.json().moved).toMatchObject({ sceneId: scene, providerId: "stub-b", requestedDurationSeconds: expect.any(Number) });
    expect(getScene(scene!)!.videoProvider).toBe("stub-b");
  });

  it("answers 404 for an unknown session or scene", async () => {
    expect((await move({ sessionId: "nope", stage: "voice" })).statusCode).toBe(404);
    const { runId } = await registerScenes([7]);
    const response = await move({ sessionId: runId, stage: "image", sceneId: "nope" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false, reason: "not-found" });
  });

  it.each([
    ["not-failed", async () => ({ sessionId: newRun(), stage: "voice" })],
    ["already-on-active", async () => { const runId = newRun(); failVoice(runId, "stub-b"); return { sessionId: runId, stage: "voice" }; }],
    ["not-retryable", async () => { const runId = newRun(); failVoice(runId, "stub-a", false); return { sessionId: runId, stage: "voice" }; }],
  ] as const)("answers 409 %s and changes nothing", async (reason, build) => {
    const payload = await build();
    const response = await move(payload);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ ok: false, reason });
  });

  it("answers 400 for an unknown stage, a missing sceneId for image or video, and a sceneId for a session stage", async () => {
    const runId = newRun();
    expect((await move({ sessionId: runId, stage: "captions" })).statusCode).toBe(400);
    expect((await move({ sessionId: runId, stage: "image" })).statusCode).toBe(400);
    expect((await move({ sessionId: runId, stage: "video" })).statusCode).toBe(400);
    expect((await move({ sessionId: runId, stage: "voice", sceneId: "x" })).statusCode).toBe(400);
  });
});

describe("Administrator access (AC5)", () => {
  it("answers 401 without the password and moves nothing", async () => {
    const runId = newRun();
    failVoice(runId);
    const noHeader = await move({ sessionId: runId, stage: "voice" }, {});
    expect(noHeader.statusCode).toBe(401);
    expect(noHeader.json()).toEqual({ ok: false, reason: "password-required" });
    expect((await list({})).statusCode).toBe(401);
    expect((await move({ sessionId: runId, stage: "voice" }, { authorization: "Bearer nope" })).statusCode).toBe(401);
    expect(getRun(runId)!.voiceProviderId).toBe("stub-a");
  });
});

describe("OpenAPI document", () => {
  it("lists both routes", async () => {
    const document = (await app.inject({ method: "GET", url: "/docs/json" })).json();
    expect(document.paths["/admin/failed-stages"]).toHaveProperty("get");
    expect(document.paths["/admin/failed-stages/move"]).toHaveProperty("post");
  });
});
