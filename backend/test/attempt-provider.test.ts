import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrationsTo, db, getLatestProviderRequestForScene, getProviderRequest, insertProviderRequest, rebindFailedClip, resetAll } from "../src/db.ts";
import { failVideo, installTwoProvidersPerStage, registerScenes, removeTwoProvidersPerStage } from "./failedStageFixtures.ts";

// record-attempt-provider (JOS-222), groups 2 and 3 — design Decisions 1-4: migration 21 adds and backfills
// `provider_requests.provider_id`; every new attempt stores its stage's binding.

const PREVIOUS_VERSION = 20;

function baselineDatabase(): DatabaseSync {
  const target = new DatabaseSync(":memory:");
  target.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '', provider TEXT);
  `);
  return target;
}

function insertScene(target: DatabaseSync, id: string, provider: string | null, videoProvider: string | null): void {
  target.prepare("INSERT INTO scenes (id, run_id, idx, status, provider, video_provider) VALUES (?, ?, 1, 'success', ?, ?)").run(id, `run-${id}`, provider, videoProvider);
}

function insertRow(target: DatabaseSync, id: string, sceneId: string, stage: "image" | "video"): void {
  target
    .prepare("INSERT INTO provider_requests (id, scene_id, sent_at, latency_ms, mode, attempt_number, resolved, stage) VALUES (?, ?, '2026-10-01T00:00:00.000Z', 12, 'success', 1, 1, ?)")
    .run(id, sceneId, stage);
}

describe("migration 21", () => {
  it("backfills each attempt with its stage's binding and changes nothing else", () => {
    const target = baselineDatabase();
    applyMigrationsTo(target, PREVIOUS_VERSION);
    insertScene(target, "s1", "A", "B");
    insertScene(target, "s2", "A", null);
    insertRow(target, "image-1", "s1", "image");
    insertRow(target, "clip-1", "s1", "video");
    insertRow(target, "clip-2", "s2", "video");
    const before = target.prepare("SELECT * FROM provider_requests ORDER BY id").all() as Array<Record<string, unknown>>;

    applyMigrationsTo(target);

    const after = target.prepare("SELECT * FROM provider_requests ORDER BY id").all() as Array<Record<string, unknown>>;
    expect(after.map(({ id, provider_id }) => [id, provider_id])).toEqual([["clip-1", "B"], ["clip-2", null], ["image-1", "A"]]);
    expect(after.map(({ provider_id: _providerId, ...rest }) => rest)).toEqual(before);
  });
});

describe("insertProviderRequest records the provider", () => {
  beforeEach(() => {
    resetAll();
    installTwoProvidersPerStage();
  });
  afterEach(() => removeTwoProvidersPerStage());

  it("stores the image binding for an image attempt and the clip binding for a clip attempt", async () => {
    const { sceneIds: [scene] } = await registerScenes([8]);
    db.prepare("UPDATE scenes SET provider = 'A', video_provider = 'B' WHERE id = ?").run(scene!);

    const image = insertProviderRequest(randomUUID(), scene!, 0, "success", 1, "image");
    const clip = insertProviderRequest(randomUUID(), scene!, 0, "success", 1, "video");

    expect(getProviderRequest(image.id)?.providerId).toBe("A");
    expect(getProviderRequest(clip.id)?.providerId).toBe("B");
    expect(getLatestProviderRequestForScene(scene!)?.providerId).toBe("B");
  });

  it("keeps the earlier attempt on its provider after the failed clip stage moves", async () => {
    const { runId, sceneIds: [scene] } = await registerScenes([8]);
    failVideo(runId, scene!, "stub-a");
    const first = insertProviderRequest(randomUUID(), scene!, 0, "not_retryable_failure", 1, "video");

    rebindFailedClip(scene!, "stub-a", "stub-b", { requestedDurationSeconds: 8, durationWarning: null, speedFactor: 1, speedFactorWarning: null });
    const second = insertProviderRequest(randomUUID(), scene!, 0, "success", 2, "video");

    expect([getProviderRequest(first.id)?.providerId, getProviderRequest(second.id)?.providerId]).toEqual(["stub-a", "stub-b"]);
  });
});
