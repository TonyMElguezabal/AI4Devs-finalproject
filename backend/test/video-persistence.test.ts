import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrationsTo,
  commitSceneResult,
  commitSceneVideoResult,
  countSceneVideoResults,
  createRun,
  createScene,
  getScene,
  insertProviderRequest,
  resetAll,
} from "../src/db.ts";

// generate-chunk-video (JOS-146), group 2 — design Decision 5:
// `scenes.video_provider`, `scenes.video_result`, `provider_requests.stage`
// and `scene_video_results` are added in one additive migration (version 12).

beforeEach(() => {
  resetAll();
});

// Helper: build the pre-migration-12 schema (what the DB looks like before
// this change), mirroring what persistence.test.ts does for earlier migrations.
function buildPreMigration12(target: DatabaseSync): void {
  target.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE scenes (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      status TEXT NOT NULL,
      instruction TEXT NOT NULL DEFAULT '',
      result TEXT,
      provider TEXT NOT NULL DEFAULT 'stub-image-provider'
    );
    CREATE TABLE provider_requests (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      mode TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE scene_results (
      scene_id TEXT PRIMARY KEY,
      result TEXT NOT NULL,
      committed_at TEXT NOT NULL
    );
  `);
}

describe("migration 12 applies (Decision 5)", () => {
  it("applies to a pre-migration-12 database and includes version 12", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration12-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-12.db"));
      buildPreMigration12(fixture);
      const runId = "run-before-12";
      const sceneId = "scene-before-12";
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES (?, 'Old', '2026-01-01T00:00:00Z')").run(runId);
      fixture
        .prepare("INSERT INTO scenes (id, run_id, idx, status) VALUES (?, ?, 1, 'submitted')")
        .run(sceneId, runId);
      fixture
        .prepare("INSERT INTO provider_requests (id, scene_id, sent_at, latency_ms, mode, attempt_number) VALUES (?, ?, '2026-01-01T00:00:00Z', 100, 'success', 1)")
        .run("req-before-12", sceneId);

      const applied = applyMigrationsTo(fixture);
      expect(applied).toContain(12);

      // Existing scenes get null video_provider and video_result
      const row = fixture.prepare("SELECT video_provider, video_result FROM scenes WHERE id = ?").get(sceneId) as any;
      expect(row.video_provider).toBeNull();
      expect(row.video_result).toBeNull();

      // Existing provider_requests get stage = 'image'
      const req = fixture
        .prepare("SELECT stage FROM provider_requests WHERE id = ?")
        .get("req-before-12") as any;
      expect(req.stage).toBe("image");

      // Idempotent: second apply returns nothing new
      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("existing rows after migration 12 (Decision 5 — additive, no data loss)", () => {
  it("existing scenes read back with null videoProvider and videoResult", () => {
    const runId = randomUUID();
    const sceneId = randomUUID();
    createRun(runId, "migration test", "script", "en");
    createScene(sceneId, runId, 1, "success", 100);

    const scene = getScene(sceneId);
    expect(scene?.videoProvider).toBeNull();
    expect(scene?.videoResult).toBeNull();
  });

  it("existing provider_requests rows read back with stage 'image'", () => {
    const runId = randomUUID();
    const sceneId = randomUUID();
    createRun(runId, "stage test", "script", "en");
    createScene(sceneId, runId, 1, "success", 100);

    const requestId = randomUUID();
    const row = insertProviderRequest(requestId, sceneId, 100, "success", 1);
    expect(row.stage).toBe("image");
  });

  it("a new provider_requests row with an explicit stage is stored as given", () => {
    const runId = randomUUID();
    const sceneId = randomUUID();
    createRun(runId, "video stage test", "script", "en");
    createScene(sceneId, runId, 1, "success", 100);

    const requestId = randomUUID();
    const row = insertProviderRequest(requestId, sceneId, 200, "success", 1, "video");
    expect(row.stage).toBe("video");
  });
});

describe("scene_video_results commit guard (Decision 5 / spec: duplicate success delivery)", () => {
  it("commits the first video result and returns true", () => {
    const runId = randomUUID();
    const sceneId = randomUUID();
    createRun(runId, "video commit test", "script", "en");
    createScene(sceneId, runId, 1, "success", 100);
    commitSceneResult(sceneId, "scene-1.png");

    const result = commitSceneVideoResult(sceneId, "scene-1.mp4");
    expect(result).toBe(true);
    expect(countSceneVideoResults(sceneId)).toBe(1);
  });

  it("refuses a second commit for the same scene (duplicate delivery)", () => {
    const runId = randomUUID();
    const sceneId = randomUUID();
    createRun(runId, "video duplicate test", "script", "en");
    createScene(sceneId, runId, 1, "success", 100);
    commitSceneResult(sceneId, "scene-1.png");

    commitSceneVideoResult(sceneId, "scene-1.mp4");
    const second = commitSceneVideoResult(sceneId, "scene-1.mp4");
    expect(second).toBe(false);
    expect(countSceneVideoResults(sceneId)).toBe(1);
  });

  it("a commit with a different payload is still refused (idempotency)", () => {
    const runId = randomUUID();
    const sceneId = randomUUID();
    createRun(runId, "video idempotency test", "script", "en");
    createScene(sceneId, runId, 1, "success", 100);
    commitSceneResult(sceneId, "scene-1.png");

    commitSceneVideoResult(sceneId, "scene-1.mp4");
    const different = commitSceneVideoResult(sceneId, "scene-1-retry.mp4");
    expect(different).toBe(false);
    expect(countSceneVideoResults(sceneId)).toBe(1);
  });
});
