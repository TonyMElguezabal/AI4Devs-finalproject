import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createRun,
  createScene,
  db,
  getRun,
  getScene,
  markChunkComplete,
  markImageComplete,
  markSceneFailed,
  resetAll,
  setRunPaused,
  writeArtefactOnce,
} from "../src/db.ts";
import { continueSession, pauseSession, resetVideoStageStartDelayMs } from "../src/orchestrator.ts";
import { sessionHeldWork } from "../src/launchGate.ts";
import { createStubVideoProvider, resetVideoProviderRegistry, setVideoProviderRegistry } from "../src/videoProvider.ts";
import { buildApp } from "../src/server.ts";
import { ulid } from "../src/util/ulid.ts";
import { simulateRestart } from "./restartHelpers.ts";
import * as concurrency from "../src/concurrency.ts";

// preserve-progress-across-restarts (JOS-160), spec restart-recovery — a session reads the same after a restart.

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
});

/** The session read, without the update times a restart is allowed to change. */
async function readSession(sessionId: string): Promise<unknown> {
  const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
  expect(res.statusCode).toBe(200);
  return JSON.parse(JSON.stringify(res.json(), (key, value: unknown) => (key === "updatedAt" ? undefined : value)));
}

/** Registers a session with one scene per state a restart leaves untouched while the session is paused or settled. */
function sessionWithScenes(title: string, paused: boolean): { sessionId: string; sceneIds: string[] } {
  const sessionId = ulid();
  createRun(sessionId, title, "A harbor at dawn. Boats leave the quay.", "en");
  const sceneIds = [1, 2, 3, 4].map((index) => {
    const sceneId = randomUUID();
    createScene(sceneId, sessionId, index, "success", 100, `scene ${index}`);
    return sceneId;
  });
  if (paused) {
    markImageComplete(sceneIds[1]!, "scene-2.png");
  } else {
    markImageComplete(sceneIds[0]!, "scene-1.png");
    markChunkComplete(sceneIds[0]!, "scene-1.mp4");
    markImageComplete(sceneIds[1]!, "scene-2.png");
    markChunkComplete(sceneIds[1]!, "scene-2.mp4");
    markSceneFailed(sceneIds[2]!, "the image provider refused the request");
    markImageComplete(sceneIds[3]!, "scene-4.png");
    markChunkComplete(sceneIds[3]!, "scene-4.mp4");
  }
  return { sessionId, sceneIds };
}

describe("A session reads the same after a restart (AC1, AC3)", () => {
  it("every state survives: submitted, image-complete, chunk-complete and failed scenes, with their results and errors", async () => {
    const settled = sessionWithScenes("Settled", false);
    const paused = sessionWithScenes("Paused", true);
    pauseSession(paused.sessionId);
    const empty = ulid();
    createRun(empty, "No scenes yet", "A script.", "en");

    const sessions = [settled.sessionId, paused.sessionId, empty];
    const before = await Promise.all(sessions.map(readSession));

    simulateRestart();

    expect(await Promise.all(sessions.map(readSession))).toEqual(before);
  });

  it("a paused session sends nothing at boot and its held work is unchanged", async () => {
    const { sessionId, sceneIds } = sessionWithScenes("Held", true);
    pauseSession(sessionId);
    const before = await readSession(sessionId);
    expect(JSON.stringify(before)).toContain("held");

    simulateRestart();

    expect(await readSession(sessionId)).toEqual(before);
    expect(getScene(sceneIds[0]!)!.status).toBe("submitted"); // held, not launched
    expect(getScene(sceneIds[0]!)!.attempts).toBe(0);
  });
});

describe("Held work, continue and boot agree (4.3)", () => {
  /** A paused session with one scene waiting for its image and one waiting for its clip. */
  function pausedSessionWithPendingWork(): { sessionId: string; imageSceneId: string; clipSceneId: string } {
    const sessionId = ulid();
    createRun(sessionId, "Agreement", "A script.", "en");
    const imageSceneId = randomUUID();
    createScene(imageSceneId, sessionId, 1, "success", 5_000, "scene 1");
    const clipSceneId = randomUUID();
    const imagePath = writeArtefactOnce(getRun(sessionId)!.projectFolder, "scene-2.png", Buffer.from([137, 80, 78, 71]));
    db.prepare(
      "INSERT INTO scenes (id, run_id, idx, status, result, requested_duration_seconds, updated_at) VALUES (?, ?, 2, 'image-complete', ?, 8, ?)",
    ).run(clipSceneId, sessionId, imagePath, new Date().toISOString());
    pauseSession(sessionId);
    return { sessionId, imageSceneId, clipSceneId };
  }

  it("launches the scenes it reports held, whether the session is continued or restarted unpaused", () => {
    resetVideoStageStartDelayMs();
    resetVideoProviderRegistry();
    setVideoProviderRegistry({ defaultIdentifier: "pending-video", adapters: { "pending-video": createStubVideoProvider("pending", { bytes: Buffer.alloc(12) }) } });

    const continued = pausedSessionWithPendingWork();
    expect([...sessionHeldWork(continued.sessionId).sceneIds].sort()).toEqual([continued.imageSceneId, continued.clipSceneId].sort());
    continueSession(continued.sessionId);

    const restarted = pausedSessionWithPendingWork();
    setRunPaused(restarted.sessionId, false); // unpaused, but nothing launched yet
    concurrency.resetAll();
    simulateRestart();

    const statuses = (ids: { imageSceneId: string; clipSceneId: string }) => [getScene(ids.imageSceneId)!.status, getScene(ids.clipSceneId)!.status];
    expect(statuses(continued)).toEqual(["image-generating", "video-generating"]);
    expect(statuses(restarted)).toEqual(statuses(continued));
  });
});
