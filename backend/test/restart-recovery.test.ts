import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createRun,
  createScene,
  getScene,
  markChunkComplete,
  markImageComplete,
  markSceneFailed,
  resetAll,
} from "../src/db.ts";
import { pauseSession } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import { ulid } from "../src/util/ulid.ts";
import { simulateRestart } from "./restartHelpers.ts";

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
