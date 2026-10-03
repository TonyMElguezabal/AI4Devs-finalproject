import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { requestedClipDuration } from "../src/admittedDurations.ts";
import { SPEED_FACTOR_LIMIT } from "../src/config/providers.ts";
import { applyMigrationsTo, createRun, createScene, db, getScene, getScenesForRun, insertRegisteredScenes, resetAll } from "../src/db.ts";

/** record-speed-adjustment-factor (JOS-148) — the warning this test file's fixtures set when a fixture's own factor exceeds the real limit. */
function speedFactorWarningFor(factor: number): "exceeds-limit" | null {
  return factor > SPEED_FACTOR_LIMIT ? "exceeds-limit" : null;
}

// assign-scene-identifiers (JOS-144), group 2 — design Decisions 2, 3 and 7:
// separate PROMPT/IMAGE/VIDEO columns, the PRD's ID (`idx`) unique within a
// session, and established chunks locked by the store (PRD §6). The writes
// below are raw SQL on purpose: the locks must hold for any caller.

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "Scene persistence test", "A short script.", "en");
  return runId;
}

function newScene(runId: string, index = 1): string {
  const sceneId = randomUUID();
  createScene(sceneId, runId, index, "success", 100, "an instruction");
  return sceneId;
}

function triggerNames(target: DatabaseSync = db): string[] {
  return (
    target.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as Array<{ name: string }>
  ).map((row) => row.name);
}

describe("Migration 7 adds the chunk content columns", () => {
  it("adds prompt, image_instruction and video_instruction with empty defaults to a pre-existing scene", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-7-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-7.sqlite"));
      fixture.exec(`
        CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
      `);
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('r', 'Old', 'then')").run();
      fixture.prepare("INSERT INTO scenes (id, run_id, idx, status, instruction) VALUES ('s', 'r', 1, 'submitted', 'old instruction')").run();

      expect(applyMigrationsTo(fixture)).toContain(7);

      const scene = fixture.prepare("SELECT * FROM scenes WHERE id = 's'").get() as Record<string, unknown>;
      expect(scene).toMatchObject({ instruction: "old instruction", prompt: "", image_instruction: "", video_instruction: "" });
      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns the new fields on a scene, empty for a scene created without them", () => {
    const sceneId = newScene(newRunId());
    expect(getScene(sceneId)).toMatchObject({ prompt: "", imageInstruction: "", videoInstruction: "" });
  });
});

describe("A chunk's number is unique within its session (Decision 2)", () => {
  it("refuses a second scene with the same number in the same session", () => {
    const runId = newRunId();
    newScene(runId, 1);
    expect(() => newScene(runId, 1)).toThrow(/UNIQUE constraint failed/);
  });

  it("allows the same number in two sessions", () => {
    newScene(newRunId(), 1);
    expect(() => newScene(newRunId(), 1)).not.toThrow();
  });
});

describe("An established chunk is locked by the store (Decision 7, AC4)", () => {
  it.each([
    ["idx", "UPDATE scenes SET idx = 2 WHERE id = ?"],
    ["prompt", "UPDATE scenes SET prompt = 'changed' WHERE id = ?"],
    ["run_id", "UPDATE scenes SET run_id = 'another-run' WHERE id = ?"],
  ])("refuses a change of %s, naming the field, and leaves the scene unchanged", (column, statement) => {
    const runId = newRunId();
    const sceneId = newScene(runId);
    const before = getScene(sceneId);

    expect(() => db.prepare(statement).run(sceneId)).toThrow(new RegExp(`locked: scenes\\.${column}`));

    expect(getScene(sceneId)).toEqual(before);
  });

  it("refuses deleting a chunk, and the chunk still exists", () => {
    const sceneId = newScene(newRunId());
    expect(() => db.prepare("DELETE FROM scenes WHERE id = ?").run(sceneId)).toThrow(/locked: scenes cannot be deleted/);
    expect(getScene(sceneId)).toBeDefined();
  });

  it("still lets the visual instructions, the skeleton instruction and the status change (PRD §10.3)", () => {
    const sceneId = newScene(newRunId());

    db.prepare(
      "UPDATE scenes SET image_instruction = 'new image', video_instruction = 'new video', instruction = 'new image', status = 'failed' WHERE id = ?",
    ).run(sceneId);

    expect(getScene(sceneId)).toMatchObject({
      imageInstruction: "new image",
      videoInstruction: "new video",
      instruction: "new image",
      status: "failed",
    });
  });
});

describe("The test-only reset keeps the chunk locks (Decision 7)", () => {
  it("empties the scenes and leaves every scene trigger in place", () => {
    newScene(newRunId());

    resetAll();

    expect(db.prepare("SELECT COUNT(*) c FROM scenes").get()).toEqual({ c: 0 });
    expect(triggerNames()).toEqual(
      expect.arrayContaining(["scenes_idx_locked", "scenes_no_delete", "scenes_prompt_locked", "scenes_run_id_locked"]),
    );
  });

  it("locks a scene created after a reset, exactly as before", () => {
    resetAll();
    const sceneId = newScene(newRunId());
    expect(() => db.prepare("DELETE FROM scenes WHERE id = ?").run(sceneId)).toThrow(/locked/);
  });
});

// assign-narration-intervals (JOS-143), group 4 — design Decisions 3 and 4:
// the interval is stored with the chunk in the registration transaction, and
// the store refuses any change to it (PRD §3 "No permitida", AC4).
describe("The narration interval is stored with the chunk (JOS-143, Decision 4)", () => {
  function requestedDuration(interval: { startSeconds: number; endSeconds: number }) {
    const { seconds, warning, factor } = requestedClipDuration(interval);
    return { requestedDurationSeconds: seconds, durationWarning: warning, speedFactor: factor, speedFactorWarning: speedFactorWarningFor(factor) };
  }

  function registerTwoChunks(runId: string): string[] {
    const ids = [randomUUID(), randomUUID()];
    const first = { startSeconds: 0, endSeconds: 7.4 };
    const second = { startSeconds: 7.4, endSeconds: 15 };
    insertRegisteredScenes(runId, [
      {
        id: ids[0]!,
        index: 1,
        prompt: "One.",
        imageInstruction: "image 1",
        videoInstruction: "video 1",
        narrationInterval: first,
        ...requestedDuration(first),
      },
      {
        id: ids[1]!,
        index: 2,
        prompt: "Two.",
        imageInstruction: "image 2",
        videoInstruction: "video 2",
        narrationInterval: second,
        ...requestedDuration(second),
      },
    ]);
    return ids;
  }

  it("reads each registered chunk back with the interval registration gave it", () => {
    const runId = newRunId();
    registerTwoChunks(runId);

    expect(getScenesForRun(runId).map((scene) => scene.narrationInterval)).toEqual([
      { startSeconds: 0, endSeconds: 7.4 },
      { startSeconds: 7.4, endSeconds: 15 },
    ]);
  });

  it("gives a scene created without a decomposition no interval", () => {
    const sceneId = newScene(newRunId());
    expect(getScene(sceneId)?.narrationInterval).toBeNull();
  });
});

describe("Migration 9 adds the interval columns and their locks (JOS-143, Decision 3)", () => {
  const intervalColumns = ["narration_start_seconds", "narration_end_seconds"];

  /** The oldest schema the migrations start from: a runs and a scenes table. */
  function createBaselineSchema(target: DatabaseSync): void {
    target.exec(`
      CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
    `);
  }

  function columnNames(target: DatabaseSync): string[] {
    return (target.prepare("PRAGMA table_info(scenes)").all() as Array<{ name: string }>).map((row) => row.name);
  }

  it("applies on a database at version 8 and is idempotent", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-9-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "at-8.sqlite"));
      createBaselineSchema(fixture);
      applyMigrationsTo(fixture);
      // Pretend this database stopped at version 8: remove what migration 9 added and forget it ran.
      fixture.exec("DROP TRIGGER scenes_narration_start_seconds_locked; DROP TRIGGER scenes_narration_end_seconds_locked;");
      for (const column of intervalColumns) fixture.exec(`ALTER TABLE scenes DROP COLUMN ${column}`);
      fixture.exec("DELETE FROM schema_migrations WHERE version = 9");
      expect(columnNames(fixture)).not.toContain("narration_start_seconds");

      expect(applyMigrationsTo(fixture)).toEqual([9]);

      expect(columnNames(fixture)).toEqual(expect.arrayContaining(intervalColumns));
      expect(triggerNames(fixture)).toEqual(
        expect.arrayContaining(["scenes_narration_end_seconds_locked", "scenes_narration_start_seconds_locked"]),
      );
      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves the interval of a scene that pre-dates it empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-9-old-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-7.sqlite"));
      createBaselineSchema(fixture);
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('r', 'Old', 'then')").run();
      fixture.prepare("INSERT INTO scenes (id, run_id, idx, status) VALUES ('s', 'r', 1, 'submitted')").run();

      applyMigrationsTo(fixture);

      expect(fixture.prepare("SELECT narration_start_seconds a, narration_end_seconds b FROM scenes").get()).toEqual({ a: null, b: null });
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("A registered chunk's interval is locked by the store (JOS-143, AC4)", () => {
  function registeredSceneId(): string {
    const runId = newRunId();
    const sceneId = randomUUID();
    const interval = { startSeconds: 0, endSeconds: 6 };
    const { seconds, warning, factor } = requestedClipDuration(interval);
    insertRegisteredScenes(runId, [
      {
        id: sceneId,
        index: 1,
        prompt: "One.",
        imageInstruction: "image",
        videoInstruction: "video",
        narrationInterval: interval,
        requestedDurationSeconds: seconds,
        durationWarning: warning,
        speedFactor: factor,
        speedFactorWarning: speedFactorWarningFor(factor),
      },
    ]);
    return sceneId;
  }

  it.each([
    ["narration_start_seconds", "UPDATE scenes SET narration_start_seconds = 1 WHERE id = ?"],
    ["narration_end_seconds", "UPDATE scenes SET narration_end_seconds = 9 WHERE id = ?"],
  ])("refuses a change of %s, naming the field, and leaves the interval unchanged", (column, statement) => {
    const sceneId = registeredSceneId();

    expect(() => db.prepare(statement).run(sceneId)).toThrow(
      new RegExp(`locked: scenes\\.${column} cannot be modified once the chunk is established`),
    );

    expect(getScene(sceneId)?.narrationInterval).toEqual({ startSeconds: 0, endSeconds: 6 });
  });

  it("refuses a change even when it sets the value it already has", () => {
    const sceneId = registeredSceneId();
    expect(() => db.prepare("UPDATE scenes SET narration_start_seconds = 0 WHERE id = ?").run(sceneId)).toThrow(/locked/);
  });

  it("keeps the locks after the test-only reset", () => {
    resetAll();
    expect(triggerNames()).toEqual(
      expect.arrayContaining(["scenes_narration_end_seconds_locked", "scenes_narration_start_seconds_locked"]),
    );
  });
});

// request-admitted-clip-duration (JOS-147), group 3 — design Decisions 2 and 3:
// the requested duration and its over-maximum warning are decided once at
// registration and stored with the chunk, in the same transaction as the
// interval; the store refuses any later change to either.
describe("Migration 10 adds the requested-duration columns and their locks (JOS-147, Decision 3)", () => {
  const durationColumns = ["requested_duration_seconds", "duration_warning"];

  function createBaselineSchema(target: DatabaseSync): void {
    target.exec(`
      CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
    `);
  }

  function columnNames(target: DatabaseSync): string[] {
    return (target.prepare("PRAGMA table_info(scenes)").all() as Array<{ name: string }>).map((row) => row.name);
  }

  it("applies on a database at version 9 and is idempotent", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-10-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "at-9.sqlite"));
      createBaselineSchema(fixture);
      applyMigrationsTo(fixture);
      // Pretend this database stopped at version 9: remove what migration 10 added and forget it ran.
      fixture.exec("DROP TRIGGER scenes_requested_duration_seconds_locked; DROP TRIGGER scenes_duration_warning_locked;");
      for (const column of durationColumns) fixture.exec(`ALTER TABLE scenes DROP COLUMN ${column}`);
      fixture.exec("DELETE FROM schema_migrations WHERE version = 10");
      expect(columnNames(fixture)).not.toContain("requested_duration_seconds");

      expect(applyMigrationsTo(fixture)).toEqual([10]);

      expect(columnNames(fixture)).toEqual(expect.arrayContaining(durationColumns));
      expect(triggerNames(fixture)).toEqual(
        expect.arrayContaining(["scenes_duration_warning_locked", "scenes_requested_duration_seconds_locked"]),
      );
      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves the requested duration and warning of a scene that pre-dates it empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-10-old-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-10.sqlite"));
      createBaselineSchema(fixture);
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('r', 'Old', 'then')").run();
      fixture.prepare("INSERT INTO scenes (id, run_id, idx, status) VALUES ('s', 'r', 1, 'submitted')").run();

      applyMigrationsTo(fixture);

      expect(fixture.prepare("SELECT requested_duration_seconds a, duration_warning b FROM scenes").get()).toEqual({ a: null, b: null });
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("The requested duration is stored with the chunk (JOS-147, Decision 2)", () => {
  function registerTwoChunks(runId: string): string[] {
    const ids = [randomUUID(), randomUUID()];
    insertRegisteredScenes(runId, [
      {
        id: ids[0]!,
        index: 1,
        prompt: "One.",
        imageInstruction: "image 1",
        videoInstruction: "video 1",
        narrationInterval: { startSeconds: 0, endSeconds: 5.49 },
        requestedDurationSeconds: 6,
        durationWarning: null,
        speedFactor: 6 / 5.49,
        speedFactorWarning: speedFactorWarningFor(6 / 5.49),
      },
      {
        id: ids[1]!,
        index: 2,
        prompt: "Two.",
        imageInstruction: "image 2",
        videoInstruction: "video 2",
        narrationInterval: { startSeconds: 5.49, endSeconds: 22.89 },
        requestedDurationSeconds: 15,
        durationWarning: "exceeds-maximum",
        speedFactor: 17.4 / 15,
        speedFactorWarning: speedFactorWarningFor(17.4 / 15),
      },
    ]);
    return ids;
  }

  it("reads each registered chunk back with the requested duration and warning registration gave it", () => {
    const runId = newRunId();
    registerTwoChunks(runId);

    expect(getScenesForRun(runId).map((scene) => ({ requestedDurationSeconds: scene.requestedDurationSeconds, durationWarning: scene.durationWarning }))).toEqual([
      { requestedDurationSeconds: 6, durationWarning: null },
      { requestedDurationSeconds: 15, durationWarning: "exceeds-maximum" },
    ]);
  });

  it("gives a scene created without a decomposition no requested duration and no warning", () => {
    const sceneId = newScene(newRunId());
    const scene = getScene(sceneId);
    expect(scene?.requestedDurationSeconds).toBeNull();
    expect(scene?.durationWarning).toBeNull();
  });
});

describe("A registered chunk's requested duration is locked by the store (JOS-147, AC5)", () => {
  function registeredSceneId(): string {
    const runId = newRunId();
    const sceneId = randomUUID();
    insertRegisteredScenes(runId, [
      {
        id: sceneId,
        index: 1,
        prompt: "One.",
        imageInstruction: "image",
        videoInstruction: "video",
        narrationInterval: { startSeconds: 0, endSeconds: 17.4 },
        requestedDurationSeconds: 15,
        durationWarning: "exceeds-maximum",
        speedFactor: 17.4 / 15,
        speedFactorWarning: speedFactorWarningFor(17.4 / 15),
      },
    ]);
    return sceneId;
  }

  it.each([
    ["requested_duration_seconds", "UPDATE scenes SET requested_duration_seconds = 10 WHERE id = ?"],
    ["duration_warning", "UPDATE scenes SET duration_warning = NULL WHERE id = ?"],
  ])("refuses a change of %s, naming the field, and leaves the stored value unchanged", (column, statement) => {
    const sceneId = registeredSceneId();

    expect(() => db.prepare(statement).run(sceneId)).toThrow(
      new RegExp(`locked: scenes\\.${column} cannot be modified once the chunk is established`),
    );

    const scene = getScene(sceneId);
    expect(scene?.requestedDurationSeconds).toBe(15);
    expect(scene?.durationWarning).toBe("exceeds-maximum");
  });

  it("keeps the locks after the test-only reset", () => {
    resetAll();
    expect(triggerNames()).toEqual(
      expect.arrayContaining(["scenes_duration_warning_locked", "scenes_requested_duration_seconds_locked"]),
    );
  });
});

describe("Migration 11 adds the speed-factor columns and their locks (record-speed-adjustment-factor, JOS-148, Decision 2)", () => {
  const speedFactorColumns = ["speed_factor", "speed_factor_warning"];

  function createBaselineSchema(target: DatabaseSync): void {
    target.exec(`
      CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
    `);
  }

  function columnNames(target: DatabaseSync): string[] {
    return (target.prepare("PRAGMA table_info(scenes)").all() as Array<{ name: string }>).map((row) => row.name);
  }

  it("applies on a database at version 10 and is idempotent", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-11-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "at-10.sqlite"));
      createBaselineSchema(fixture);
      applyMigrationsTo(fixture);
      // Pretend this database stopped at version 10: remove what migration 11 added and forget it ran.
      fixture.exec("DROP TRIGGER scenes_speed_factor_locked; DROP TRIGGER scenes_speed_factor_warning_locked;");
      for (const column of speedFactorColumns) fixture.exec(`ALTER TABLE scenes DROP COLUMN ${column}`);
      fixture.exec("DELETE FROM schema_migrations WHERE version = 11");
      expect(columnNames(fixture)).not.toContain("speed_factor");

      expect(applyMigrationsTo(fixture)).toEqual([11]);

      expect(columnNames(fixture)).toEqual(expect.arrayContaining(speedFactorColumns));
      expect(triggerNames(fixture)).toEqual(
        expect.arrayContaining(["scenes_speed_factor_locked", "scenes_speed_factor_warning_locked"]),
      );
      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves the speed factor and warning of a scene that pre-dates it empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-11-old-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-11.sqlite"));
      createBaselineSchema(fixture);
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('r', 'Old', 'then')").run();
      fixture.prepare("INSERT INTO scenes (id, run_id, idx, status) VALUES ('s', 'r', 1, 'submitted')").run();

      applyMigrationsTo(fixture);

      expect(fixture.prepare("SELECT speed_factor a, speed_factor_warning b FROM scenes").get()).toEqual({ a: null, b: null });
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Migration 12 (generate-chunk-video, JOS-146): video stage columns, provider_requests.stage, scene_video_results", () => {
  const videoColumns = ["video_provider", "video_result"];

  function createBaselineSchema(target: DatabaseSync): void {
    target.exec(`
      CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
    `);
  }

  function columnNames(target: DatabaseSync): string[] {
    return (target.prepare("PRAGMA table_info(scenes)").all() as Array<{ name: string }>).map((row) => row.name);
  }

  function providerRequestColumns(target: DatabaseSync): string[] {
    return (target.prepare("PRAGMA table_info(provider_requests)").all() as Array<{ name: string }>).map((row) => row.name);
  }

  function tableNames(target: DatabaseSync): string[] {
    return (target.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name);
  }

  it("applies on a database at version 11 and is idempotent", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-12-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "at-11.sqlite"));
      createBaselineSchema(fixture);
      applyMigrationsTo(fixture);
      // Pretend the database stopped at version 11.
      fixture.exec("DROP TABLE scene_video_results");
      for (const col of videoColumns) fixture.exec(`ALTER TABLE scenes DROP COLUMN ${col}`);
      fixture.exec("ALTER TABLE provider_requests DROP COLUMN stage");
      fixture.exec("DELETE FROM schema_migrations WHERE version = 12");
      expect(columnNames(fixture)).not.toContain("video_provider");

      expect(applyMigrationsTo(fixture)).toEqual([12]);

      expect(columnNames(fixture)).toEqual(expect.arrayContaining(videoColumns));
      expect(providerRequestColumns(fixture)).toContain("stage");
      expect(tableNames(fixture)).toContain("scene_video_results");
      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves video_provider and video_result null for scenes that pre-date it", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-12-old-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-12.sqlite"));
      createBaselineSchema(fixture);
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('r', 'Old', 'then')").run();
      fixture.prepare("INSERT INTO scenes (id, run_id, idx, status) VALUES ('s', 'r', 1, 'submitted')").run();

      applyMigrationsTo(fixture);

      expect(fixture.prepare("SELECT video_provider vp, video_result vr FROM scenes").get()).toEqual({ vp: null, vr: null });
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("existing provider_requests rows read back with stage = 'image'", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-12-pr-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-12-pr.sqlite"));
      createBaselineSchema(fixture);
      applyMigrationsTo(fixture);
      // Undo ALL of migration 12 so we can simulate a pre-12 state with an existing row.
      fixture.exec("DROP TABLE scene_video_results");
      fixture.exec("ALTER TABLE scenes DROP COLUMN video_result");
      fixture.exec("ALTER TABLE scenes DROP COLUMN video_provider");
      fixture.exec("ALTER TABLE provider_requests DROP COLUMN stage");
      fixture.exec("DELETE FROM schema_migrations WHERE version = 12");
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('r', 'Old', 'then')").run();
      fixture.prepare("INSERT INTO scenes (id, run_id, idx, status) VALUES ('s', 'r', 1, 'submitted')").run();
      fixture.prepare("INSERT INTO provider_requests (id, scene_id, sent_at, latency_ms, mode, attempt_number, resolved) VALUES ('pr', 's', 'then', 0, 'success', 1, 1)").run();

      applyMigrationsTo(fixture);

      const row = fixture.prepare("SELECT stage FROM provider_requests WHERE id = 'pr'").get() as { stage: string };
      expect(row.stage).toBe("image");
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a second scene_video_results commit for the same scene is refused", () => {
    const runId = randomUUID();
    createRun(runId, "T", "s", "en");
    const sceneId = randomUUID();
    db.prepare("INSERT INTO scenes (id, run_id, idx, status, updated_at) VALUES (?, ?, 1, 'submitted', ?)").run(sceneId, runId, new Date().toISOString());
    db.prepare("INSERT INTO scene_video_results (scene_id, result, committed_at) VALUES (?, ?, ?)").run(sceneId, "scene-1.mp4", new Date().toISOString());

    expect(() => {
      db.prepare("INSERT INTO scene_video_results (scene_id, result, committed_at) VALUES (?, ?, ?)").run(sceneId, "scene-1-dup.mp4", new Date().toISOString());
    }).toThrow();
  });
});

describe("The speed-adjustment factor is stored with the chunk (record-speed-adjustment-factor, JOS-148, Decision 2)", () => {
  function registerTwoChunks(runId: string): string[] {
    const ids = [randomUUID(), randomUUID()];
    insertRegisteredScenes(runId, [
      {
        id: ids[0]!,
        index: 1,
        prompt: "One.",
        imageInstruction: "image 1",
        videoInstruction: "video 1",
        narrationInterval: { startSeconds: 0, endSeconds: 5.49 },
        requestedDurationSeconds: 6,
        durationWarning: null,
        speedFactor: 6 / 5.49,
        speedFactorWarning: null,
      },
      {
        id: ids[1]!,
        index: 2,
        prompt: "Two.",
        imageInstruction: "image 2",
        videoInstruction: "video 2",
        narrationInterval: { startSeconds: 5.49, endSeconds: 22.89 },
        requestedDurationSeconds: 15,
        durationWarning: "exceeds-maximum",
        speedFactor: 17.4 / 15,
        speedFactorWarning: "exceeds-limit",
      },
    ]);
    return ids;
  }

  it("reads each registered chunk back with the speed factor and warning registration gave it", () => {
    const runId = newRunId();
    registerTwoChunks(runId);

    const stored = getScenesForRun(runId).map((scene) => ({ speedFactor: scene.speedFactor, speedFactorWarning: scene.speedFactorWarning }));
    expect(stored[0]!.speedFactor).toBeCloseTo(6 / 5.49, 10);
    expect(stored[0]!.speedFactorWarning).toBeNull();
    expect(stored[1]!.speedFactor).toBeCloseTo(17.4 / 15, 10);
    expect(stored[1]!.speedFactorWarning).toBe("exceeds-limit");
  });

  it("gives a scene created without a decomposition no speed factor and no warning", () => {
    const sceneId = newScene(newRunId());
    const scene = getScene(sceneId);
    expect(scene?.speedFactor).toBeNull();
    expect(scene?.speedFactorWarning).toBeNull();
  });
});

describe("A registered chunk's speed factor is locked by the store (record-speed-adjustment-factor, JOS-148)", () => {
  function registeredSceneId(): string {
    const runId = newRunId();
    const sceneId = randomUUID();
    insertRegisteredScenes(runId, [
      {
        id: sceneId,
        index: 1,
        prompt: "One.",
        imageInstruction: "image",
        videoInstruction: "video",
        narrationInterval: { startSeconds: 0, endSeconds: 17.4 },
        requestedDurationSeconds: 15,
        durationWarning: "exceeds-maximum",
        speedFactor: 17.4 / 15,
        speedFactorWarning: "exceeds-limit",
      },
    ]);
    return sceneId;
  }

  it.each([
    ["speed_factor", "UPDATE scenes SET speed_factor = 1 WHERE id = ?"],
    ["speed_factor_warning", "UPDATE scenes SET speed_factor_warning = NULL WHERE id = ?"],
  ])("refuses a change of %s, naming the field, and leaves the stored value unchanged", (column, statement) => {
    const sceneId = registeredSceneId();

    expect(() => db.prepare(statement).run(sceneId)).toThrow(
      new RegExp(`locked: scenes\\.${column} cannot be modified once the chunk is established`),
    );

    const scene = getScene(sceneId);
    expect(scene?.speedFactor).toBeCloseTo(17.4 / 15, 10);
    expect(scene?.speedFactorWarning).toBe("exceeds-limit");
  });

  it("keeps the locks after the test-only reset", () => {
    resetAll();
    expect(triggerNames()).toEqual(
      expect.arrayContaining(["scenes_speed_factor_locked", "scenes_speed_factor_warning_locked"]),
    );
  });
});
