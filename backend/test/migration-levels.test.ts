import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { applyMigrationsTo } from "../src/db.ts";

// JOS-210 — what a build does with a database left at another migration level.

const SCRATCH = mkdtempSync(join(tmpdir(), "vid4you-migration-levels-"));

function versionOneFixture(name: string): DatabaseSync {
  const fixture = new DatabaseSync(join(SCRATCH, `${name}.sqlite`));
  fixture.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
    INSERT INTO runs (id, title, created_at) VALUES ('old-run', 'Old session', '2026-01-01T00:00:00.000Z');
    INSERT INTO scenes (id, run_id, idx, status, instruction) VALUES ('old-scene', 'old-run', 1, 'chunk-complete', 'original instruction');
  `);
  return fixture;
}

const allLevels = (() => {
  const probe = versionOneFixture("probe");
  const levels = applyMigrationsTo(probe);
  probe.close();
  return levels;
})();

describe("upgrading a database left at any migration level", () => {
  it("has no gap in the migration list", () => {
    expect(allLevels).toEqual(Array.from({ length: allLevels.length }, (_, index) => index + 2));
  });

  it.each(allLevels)("keeps the session of a database left at level %i", (level) => {
    const fixture = versionOneFixture(`level-${level}`);
    applyMigrationsTo(fixture, level);

    const upgraded = applyMigrationsTo(fixture);

    expect(upgraded).toEqual(allLevels.filter((version) => version > level));
    const run = fixture.prepare("SELECT title FROM runs WHERE id = 'old-run'").get() as { title: string };
    const scene = fixture.prepare("SELECT idx, instruction FROM scenes WHERE id = 'old-scene'").get() as { idx: number; instruction: string };
    expect(run.title).toBe("Old session");
    expect(scene).toEqual({ idx: 1, instruction: "original instruction" });
    const recorded = (fixture.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[]).map((row) => row.version);
    expect(recorded).toEqual(allLevels);
    fixture.close();
  });
});

describe("opening a database that a newer build migrated", () => {
  // Pins what happens today: the runner ignores a level it does not know and leaves the data alone. The README tells the
  // user to restore the data-folder backup to roll back; an older build is not expected to refuse (JOS-210 report).
  it("ignores a migration level this build does not know", () => {
    const fixture = versionOneFixture("newer");
    applyMigrationsTo(fixture);
    const newest = allLevels[allLevels.length - 1]!;
    fixture.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, 'later')").run(newest + 1);

    expect(applyMigrationsTo(fixture)).toEqual([]);

    expect(fixture.prepare("SELECT title FROM runs WHERE id = 'old-run'").get()).toEqual({ title: "Old session" });
    fixture.close();
  });
});

process.on("exit", () => rmSync(SCRATCH, { recursive: true, force: true }));
