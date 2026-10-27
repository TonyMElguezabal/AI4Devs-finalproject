import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAdminPasswordReader, setAdminPasswordReader } from "../src/adminAccess.ts";
import { db, resetAll } from "../src/db.ts";
import { setVideoProviderRegistry } from "../src/videoProvider.ts";
import { setVoiceProviderRegistry } from "../src/voiceProvider.ts";
import { buildApp } from "../src/server.ts";
import { failImage, failVideo, failVoice, installTwoProvidersPerStage, newRun, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";

// record-provider-changes (JOS-229), group 3 — design Decisions 2 and 3; JOS-229 AC1 and AC2.

const PASSWORD = "correct-horse-battery-staple";
const admin = { authorization: `Bearer ${PASSWORD}` };
const adapters = { "stub-a": {}, "stub-b": {} } as never;

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  installTwoProvidersPerStage();
  // The fixture's own setActiveProvider calls are not under test; start from an empty log with stub-b active.
  db.exec("DELETE FROM provider_changes");
  setAdminPasswordReader(() => PASSWORD);
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
  resetAdminPasswordReader();
  removeTwoProvidersPerStage();
  resetAll();
});

const choose = (stage: string, providerId: string) => app.inject({ method: "PUT", url: `/admin/providers/${stage}`, headers: admin, payload: { providerId } });
const move = (payload: object) => app.inject({ method: "POST", url: "/admin/failed-stages/to-active-provider", headers: admin, payload });
const log = () => db.prepare("SELECT * FROM provider_changes ORDER BY id").all() as Array<Record<string, unknown>>;

describe("changing the active provider", () => {
  it("logs one entry with the previous and the new provider and their labels (AC1)", async () => {
    setVideoProviderRegistry({ defaultIdentifier: "stub-a", adapters, labels: { "stub-a": "Stub A", "stub-b": "Stub B" }, aliases: [] });

    expect((await choose("video", "stub-a")).statusCode).toBe(200);

    expect(log()).toEqual([
      {
        id: expect.any(Number),
        changed_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
        kind: "active-provider",
        stage: "video",
        run_id: null,
        scene_id: null,
        previous_provider_id: "stub-b",
        previous_provider_label: "Stub B",
        new_provider_id: "stub-a",
        new_provider_label: "Stub A",
      },
    ]);
  });

  it("logs a second entry when it is changed back, in order", async () => {
    await choose("voice", "stub-a");
    await choose("voice", "stub-b");
    expect(log().map((row) => [row.previous_provider_id, row.new_provider_id])).toEqual([
      ["stub-b", "stub-a"],
      ["stub-a", "stub-b"],
    ]);
  });

  it("names the settings default as the previous provider on the first choice", async () => {
    db.exec("DELETE FROM active_providers");
    await choose("image", "stub-b");
    expect(log()).toMatchObject([{ stage: "image", previous_provider_id: "stub-a", new_provider_id: "stub-b" }]);
  });

  it("logs nothing when the active provider is saved again", async () => {
    expect((await choose("voice", "stub-b")).statusCode).toBe(200);
    expect(log()).toEqual([]);
  });

  it("logs nothing when the request is refused", async () => {
    expect((await choose("voice", "not-a-provider")).statusCode).toBe(400);
    expect(log()).toEqual([]);
  });
});

describe("moving a failed stage", () => {
  it("logs a voice-over move with its session and no scene (AC2)", async () => {
    const runId = newRun();
    failVoice(runId);

    expect((await move({ sessionId: runId, stage: "voice" })).statusCode).toBe(200);

    expect(log()).toMatchObject([
      { kind: "failed-stage-move", stage: "voice", run_id: runId, scene_id: null, previous_provider_id: "stub-a", new_provider_id: "stub-b" },
    ]);
  });

  it("logs a clip move and an image move with their scene (AC2)", async () => {
    const { runId, sceneIds } = await registerScenes([7, 8]);
    failVideo(runId, sceneIds[0]!);
    failImage(sceneIds[1]!);

    expect((await move({ sessionId: runId, stage: "video", sceneId: sceneIds[0] })).statusCode).toBe(200);
    expect((await move({ sessionId: runId, stage: "image", sceneId: sceneIds[1] })).statusCode).toBe(200);

    expect(log()).toMatchObject([
      { kind: "failed-stage-move", stage: "video", run_id: runId, scene_id: sceneIds[0], previous_provider_id: "stub-a", new_provider_id: "stub-b" },
      { kind: "failed-stage-move", stage: "image", run_id: runId, scene_id: sceneIds[1], previous_provider_id: "stub-a", new_provider_id: "stub-b" },
    ]);
  });

  it("logs nothing when the move is refused", async () => {
    const runId = newRun();
    failVoice(runId, "stub-b");
    expect((await move({ sessionId: runId, stage: "voice" })).statusCode).toBe(409);
    expect(log()).toEqual([]);
  });

  it("keeps the label as it was when a provider is renamed later", async () => {
    setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters, labels: { "stub-a": "Old name", "stub-b": "Voice B" } });
    const runId = newRun();
    failVoice(runId);
    await move({ sessionId: runId, stage: "voice" });

    setVoiceProviderRegistry({ defaultIdentifier: "stub-a", adapters, labels: { "stub-a": "New name", "stub-b": "Voice B" } });

    expect(log()).toMatchObject([{ previous_provider_label: "Old name", new_provider_label: "Voice B" }]);
  });
});
