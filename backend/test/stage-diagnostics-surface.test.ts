import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  bindSceneImageProvider,
  bindSceneVideoProvider,
  createRun,
  createScene,
  insertProviderRequest,
  recordStageAttempt,
  resetAll,
} from "../src/db.ts";
import { toSnapshot } from "../src/orchestrator.ts";
import { IMAGE_PROVIDER, VIDEO_PROVIDER, VOICE_PROVIDER } from "../src/config/providers.ts";
import { buildApp } from "../src/server.ts";
import { ulid } from "../src/util/ulid.ts";
import type { AttemptStage } from "../src/types.ts";

// see-provider-and-attempts (JOS-166), groups 4 and 5 — the session read carries, per scene and per phase,
// which provider each stage used and how many attempts it made, derived from the stored attempt records.

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

const NOW = "2026-10-05T12:00:00.000Z";

async function read(sessionId: string) {
  const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
  expect(res.statusCode).toBe(200);
  return res.json() as { session: { phases: Array<{ phase: string; stages: unknown[] }> }; scenes: Array<Record<string, any>> };
}

function newSession(): string {
  const runId = ulid();
  createRun(runId, "Diagnostics test", "A short script.", "en");
  return runId;
}

/** One scene with `imageAttempts` image requests and `clipAttempts` clip requests recorded, as the stages record them. */
function sceneWithAttempts(runId: string, input: { imageAttempts?: number; clipAttempts?: number; imageProvider?: string; clipProvider?: string }) {
  const sceneId = randomUUID();
  createScene(sceneId, runId, 1, "success", 0);
  if (input.imageProvider) bindSceneImageProvider(sceneId, input.imageProvider);
  if (input.clipProvider) bindSceneVideoProvider(sceneId, input.clipProvider);
  for (let n = 1; n <= (input.imageAttempts ?? 0); n++) insertProviderRequest(randomUUID(), sceneId, 0, "success", n, "image");
  for (let n = 1; n <= (input.clipAttempts ?? 0); n++) insertProviderRequest(randomUUID(), sceneId, 0, "success", n, "video");
  return sceneId;
}

function sessionAttempts(runId: string, stage: AttemptStage, providers: Array<string | null>) {
  for (const providerId of providers) recordStageAttempt({ runId, stage, providerId, queuedAt: NOW, sentAt: NOW });
}

describe("A scene reports provider and attempts per stage", () => {
  it("shows the image provider and its attempts once the image stage ran twice, and no clip stage", async () => {
    const runId = newSession();
    sceneWithAttempts(runId, { imageAttempts: 2, imageProvider: IMAGE_PROVIDER.model });

    const { scenes } = await read(runId);

    expect(scenes[0]!.stages).toEqual({ image: { stage: "image", provider: { name: "Fal.ai", model: "fal-ai/flux/dev" }, attempts: 2 } });
  });

  it("keeps the image attempts once the clip stage has started", async () => {
    const runId = newSession();
    sceneWithAttempts(runId, { imageAttempts: 2, clipAttempts: 1, imageProvider: IMAGE_PROVIDER.model, clipProvider: VIDEO_PROVIDER.endpoint });

    const { scenes } = await read(runId);

    expect(scenes[0]!.stages.image.attempts).toBe(2);
    expect(scenes[0]!.stages.video).toEqual({ stage: "video", provider: { name: "RunningHub", model: "minimax/hailuo-h3" }, attempts: 1 });
  });

  it("counts every attempt across a manual retry", async () => {
    const runId = newSession();
    sceneWithAttempts(runId, { imageAttempts: 5, imageProvider: IMAGE_PROVIDER.model }); // four, then one after a manual retry

    expect((await read(runId)).scenes[0]!.stages.image.attempts).toBe(5);
  });

  it("lists no stage for a scene that has not started, even though it holds the placeholder provider", async () => {
    const runId = newSession();
    sceneWithAttempts(runId, {});

    expect((await read(runId)).scenes[0]!.stages).toEqual({});
  });

  it("no longer carries a top-level provider or attempts", async () => {
    const runId = newSession();
    sceneWithAttempts(runId, { imageAttempts: 1, imageProvider: IMAGE_PROVIDER.model });

    const scene = (await read(runId)).scenes[0]!;

    expect(scene).not.toHaveProperty("provider");
    expect(scene).not.toHaveProperty("attempts");
  });
});

describe("A phase reports provider and attempts of its session-level stages", () => {
  it("lists no stage when none has run", async () => {
    const { session } = await read(newSession());

    expect(session.phases.map((phase) => phase.stages)).toEqual([[], [], [], []]);
  });

  it("shows the voice-over stage with its provider and two attempts", async () => {
    const runId = newSession();
    sessionAttempts(runId, "voice-over", [VOICE_PROVIDER.name, VOICE_PROVIDER.name]);

    const phase = (await read(runId)).session.phases.find((entry) => entry.phase === "voice-over")!;

    expect(phase.stages).toEqual([{ stage: "voice-over", provider: { name: "ElevenLabs", model: VOICE_PROVIDER.model }, attempts: 2 }]);
  });

  it("shows timestamps (the latest mechanism, all attempts) and then the instructions stage", async () => {
    const runId = newSession();
    sessionAttempts(runId, "timestamps", ["elevenlabs-native", "elevenlabs-forced-alignment"]);
    sessionAttempts(runId, "decomposition", ["openai-decomposition"]);

    const phase = (await read(runId)).session.phases.find((entry) => entry.phase === "decomposition")!;

    expect(phase.stages).toEqual([
      { stage: "timestamps", provider: { name: "ElevenLabs", model: "forced alignment" }, attempts: 2 },
      { stage: "instructions", provider: { name: "OpenAI", model: "gpt-6-astra" }, attempts: 1 },
    ]);
  });

  it("shows assembly as local assembly with no external provider", async () => {
    const runId = newSession();
    sessionAttempts(runId, "assembly", [null]);

    const phase = (await read(runId)).session.phases.find((entry) => entry.phase === "assembly")!;

    expect(phase.stages).toEqual([{ stage: "assembly", provider: { name: "Local assembly", model: "ffmpeg" }, attempts: 1 }]);
  });

  it("never lists a stage under the scenes phase", async () => {
    const runId = newSession();
    sessionAttempts(runId, "voice-over", [VOICE_PROVIDER.name]);
    sceneWithAttempts(runId, { imageAttempts: 1, imageProvider: IMAGE_PROVIDER.model });

    expect((await read(runId)).session.phases.find((entry) => entry.phase === "scenes")!.stages).toEqual([]);
  });

  it("carries the same stages in a live snapshot as in the read", async () => {
    const runId = newSession();
    sessionAttempts(runId, "voice-over", [VOICE_PROVIDER.name]);
    sceneWithAttempts(runId, { imageAttempts: 1, imageProvider: IMAGE_PROVIDER.model });

    const snapshot = toSnapshot(runId)!;
    const body = await read(runId);

    expect(snapshot.session.phases.map((phase) => phase.stages)).toEqual(body.session.phases.map((phase) => phase.stages));
    expect(body.scenes[0]!.stages.image.attempts).toBe(1); // not an empty comparison
    expect(snapshot.scenes[0]!.stages).toEqual(body.scenes[0]!.stages);
  });
});
