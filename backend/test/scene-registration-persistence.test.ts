import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrationsTo, createRun, createScene, db, getScene, resetAll } from "../src/db.ts";

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
