import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrationsTo,
  commitSceneResult,
  countSceneResults,
  createRun,
  createScene,
  deriveAndCreateProjectFolder,
  getRun,
  PROJECTS_ROOT,
  resetAll,
  resolveArtefactPath,
  writeArtefact,
} from "../src/db.ts";

beforeEach(() => {
  resetAll();
});

// define-persistence (JOS-181) Decision 3 / spec "Repeated confirmations
// rejected by the store" — experiment 5.3.
function realScene(): string {
  const runId = randomUUID();
  const sceneId = randomUUID();
  createRun(runId, "idempotency test", "test script", "en");
  createScene(sceneId, runId, 1, "success", 100);
  return sceneId;
}

describe("store-enforced idempotency (Decision 3)", () => {
  it("commits a scene result exactly once; a second attempt is rejected by the store", () => {
    const sceneId = realScene();
    const first = commitSceneResult(sceneId, "image-a.png");
    const second = commitSceneResult(sceneId, "image-a.png"); // duplicate delivery
    const third = commitSceneResult(sceneId, "a-different-result.png"); // even with a different payload

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(third).toBe(false);
    expect(countSceneResults(sceneId)).toBe(1); // never more than one row, regardless of attempts
  });

  it("two 'concurrent' confirmations for the same scene: exactly one succeeds", () => {
    // node:sqlite is synchronous and Node is single-threaded, so true
    // interleaving can't be forced here — but the assertion that matters is
    // structural: the guarantee comes from the PRIMARY KEY, not from any
    // ordering assumption, so calling it twice back to back proves the same
    // property a genuinely concurrent pair would hit.
    const sceneId = realScene();
    const results = [commitSceneResult(sceneId, "x"), commitSceneResult(sceneId, "x")];
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

// PRD §12.2, AC15 — experiment 5.5.
describe("project folder naming (PRD §12.2)", () => {
  it("gives two sessions with the same title in the same minute distinct folders", () => {
    const now = new Date("2026-09-25T10:42:00Z");
    const first = deriveAndCreateProjectFolder("My Trip", now);
    const second = deriveAndCreateProjectFolder("My Trip", now);

    expect(first).not.toBe(second);
    expect(second).toBe(`${first} (2)`);
    expect(existsSync(join(PROJECTS_ROOT, first))).toBe(true);
    expect(existsSync(join(PROJECTS_ROOT, second))).toBe(true);
  });

  it("writes and resolves an artefact relative to the session's own folder", () => {
    const folder = deriveAndCreateProjectFolder("Artefact Test", new Date());
    const relativePath = writeArtefact(folder, "scene-1.png", "hello");
    const fullPath = resolveArtefactPath(folder, relativePath);
    expect(readFileSync(fullPath, "utf8")).toBe("hello");
  });

  it("keeps two same-title sessions' records pointed at their own folder only", () => {
    const runIdA = randomUUID();
    const runIdB = randomUUID();
    const runA = createRun(runIdA, "Same Title", "test script", "en");
    const runB = createRun(runIdB, "Same Title", "test script", "en");

    expect(runA.projectFolder).not.toBe(runB.projectFolder);
    expect(getRun(runIdA)!.projectFolder).toBe(runA.projectFolder);
    expect(getRun(runIdB)!.projectFolder).toBe(runB.projectFolder);
  });
});

// PRD §11.2 — experiment 5.7: a later schema version must not alter chunks
// and intervals already established in existing sessions.
describe("schema migration preserves existing data (Decision 6, §11.2)", () => {
  it("adds new columns with safe defaults without touching pre-existing rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-test-"));
    const fixturePath = join(dir, "pre-migration.sqlite");

    try {
      // Build a fixture at schema version 1 (before this change's migration existed).
      const fixture = new DatabaseSync(fixturePath);
      fixture.exec(`
        CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
      `);
      const runId = "pre-existing-run";
      const sceneId = "pre-existing-scene";
      fixture.prepare("INSERT INTO runs (id, title, created_at, paused) VALUES (?, 'Old Session', '2026-01-01T00:00:00.000Z', 0)").run(runId);
      fixture.prepare("INSERT INTO scenes (id, run_id, idx, status, instruction) VALUES (?, ?, 1, 'chunk-complete', 'original instruction')").run(sceneId, runId);

      // Apply the current migration set against that same fixture file.
      const applied = applyMigrationsTo(fixture);
      expect(applied).toContain(2);

      // The pre-existing rows are untouched...
      const run = fixture.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as any;
      const scene = fixture.prepare("SELECT * FROM scenes WHERE id = ?").get(sceneId) as any;
      expect(run.title).toBe("Old Session");
      expect(scene.idx).toBe(1);
      expect(scene.instruction).toBe("original instruction"); // the chunk/interval-equivalent field, unchanged

      // ...and the new columns exist with a safe default.
      expect(run.language).toBe("");
      expect(run.project_folder).toBe("");

      // Applying again is a no-op (idempotent upgrade).
      expect(applyMigrationsTo(fixture)).toEqual([]);

      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates scenes with a real, non-empty language once a session is created through the normal path", () => {
    const runId = randomUUID();
    const run = createRun(runId, "Language Test", "test script", "es");
    expect(run.language).toBe("es");
    expect(getRun(runId)!.language).toBe("es");
  });
});
