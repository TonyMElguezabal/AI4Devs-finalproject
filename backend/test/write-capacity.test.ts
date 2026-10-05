import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import {
  createRun,
  createScene,
  db,
  getScenesForRun,
  insertProviderRequest,
  markSceneInFlight,
  resetAll,
} from "../src/db.ts";
import { deriveSessionState, handleProviderResult } from "../src/orchestrator.ts";
import { STAGE } from "../src/types.ts";

// harden-backend-foundation (JOS-186), spec concurrent-write-capacity: result
// recording and the one-result-per-scene guard hold when one session's scenes
// all complete at once and every completion is delivered twice.
//
// Requests are recorded straight into `provider_requests` as zero-latency stub
// requests instead of going through `launchScene`: `provider.send` also arms its
// own delivery timer, which would add deliveries this test cannot count.
// Deliveries are shuffled and each runs in its own `setImmediate`, so they
// interleave on the event loop, the only concurrency this single-process
// backend has. Elapsed time is logged as evidence for ADR 0002, never asserted.

const SCALE = 300;

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function deliverLater(requestId: string): Promise<{ applied: boolean; note: string }> {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(handleProviderResult(requestId));
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** One session whose `sceneCount` scenes are all in flight with a resolved zero-latency request. */
function sessionWithRequestsInFlight(sceneCount: number): { runId: string; requestIds: string[] } {
  const runId = randomUUID();
  createRun(runId, `write capacity ${sceneCount}`, "script", "en");
  const requestIds: string[] = [];
  for (let index = 1; index <= sceneCount; index++) {
    const sceneId = randomUUID();
    createScene(sceneId, runId, index, "success", 0);
    const requestId = randomUUID();
    insertProviderRequest(requestId, sceneId, 0, "success", 1);
    markSceneInFlight(sceneId, requestId, 1);
    requestIds.push(requestId);
  }
  return { runId, requestIds };
}

async function deliverEveryRequestTwice(requestIds: string[]) {
  const outcomes = await Promise.all(shuffled([...requestIds, ...requestIds]).map(deliverLater));
  return {
    applied: outcomes.filter((outcome) => outcome.applied).length,
    duplicatesIgnored: outcomes.filter((outcome) => outcome.note.startsWith("duplicate delivery ignored")).length,
  };
}

function countRows(connection: { prepare(sql: string): { get(): unknown } }, table: string, runId: string): number {
  const row = connection
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE scene_id IN (SELECT id FROM scenes WHERE run_id = '${runId}')`)
    .get() as { n: number };
  return row.n;
}

beforeEach(() => {
  resetAll();
  concurrency.resetAll();
  concurrency.setLimit(STAGE, SCALE + 1); // the cap plays no part here; the store is what is under test
});

describe(`result recording at MVP session scale (${SCALE} scenes in one session)`, () => {
  it("records exactly one result per scene, ignores every second delivery, and reaches the same final state as at small scale", async () => {
    const small = sessionWithRequestsInFlight(3);
    await deliverEveryRequestTwice(small.requestIds);
    const smallState = deriveSessionState(getScenesForRun(small.runId));

    const { runId, requestIds } = sessionWithRequestsInFlight(SCALE);
    const startedAt = performance.now();
    const { applied, duplicatesIgnored } = await deliverEveryRequestTwice(requestIds);
    const elapsedMs = performance.now() - startedAt;
    console.log(`write-capacity: ${SCALE} scenes, ${requestIds.length * 2} deliveries in ${elapsedMs.toFixed(1)} ms`);

    expect(applied).toBe(SCALE);
    expect(duplicatesIgnored).toBe(SCALE);
    expect(countRows(db, "scene_results", runId)).toBe(SCALE);
    expect(getScenesForRun(runId).every((scene) => scene.status === "image-complete")).toBe(true);
    expect(deriveSessionState(getScenesForRun(runId))).toEqual(smallState);

    // The same rows are visible to a second connection opened on the same file.
    const secondConnection = new DatabaseSync(process.env.DB_PATH ?? "data/skeleton.sqlite");
    try {
      expect(countRows(secondConnection, "scene_results", runId)).toBe(SCALE);
    } finally {
      secondConnection.close();
    }
  });
});
