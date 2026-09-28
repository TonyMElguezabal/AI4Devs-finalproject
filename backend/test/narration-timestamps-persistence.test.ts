import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrationsTo,
  countNarrationTimestamps,
  createRun,
  db,
  getNarrationTimestamps,
  getStageAttempts,
  insertNarrationTimestamps,
  recordStageAttempt,
  resetAll,
  type NarrationTimestampsInput,
} from "../src/db.ts";

// obtain-narration-timestamps (JOS-139), group 2 — design Decisions 2 and 7:
// the `timestamps` stage records attempts like the voice-over stage, and the
// obtained timestamps are stored once and locked by the store. Raw SQL is used
// on purpose: the locks must hold for any caller.

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "Timestamps persistence test", "A short script.", "en");
  return runId;
}

function timestampsFor(runId: string, overrides: Partial<NarrationTimestampsInput> = {}): NarrationTimestampsInput {
  return {
    runId,
    mechanism: "native",
    path: "narration-timestamps.json",
    characterCount: 16,
    obtainedAt: "2026-09-28T10:00:00.000Z",
    ...overrides,
  };
}

function triggerNames(target: DatabaseSync = db): string[] {
  return (
    target.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as Array<{ name: string }>
  ).map((row) => row.name);
}

const attempt = (runId: string, stage: "voice-over" | "timestamps", providerId = "elevenlabs-native") =>
  recordStageAttempt({
    runId,
    stage,
    providerId,
    queuedAt: "2026-09-28T10:00:00.000Z",
    sentAt: "2026-09-28T10:00:01.000Z",
  });

describe("The timestamps stage records attempts (Decision 2)", () => {
  it("accepts the stage timestamps and reads it back", () => {
    const runId = newRunId();
    const recorded = attempt(runId, "timestamps");
    expect(recorded).toMatchObject({ runId, stage: "timestamps", providerId: "elevenlabs-native", attemptNumber: 1, outcome: "in-flight" });
    expect(getStageAttempts(runId, "timestamps")).toEqual([recorded]);
  });

  it("numbers its attempts separately from the voice-over stage's", () => {
    const runId = newRunId();
    attempt(runId, "voice-over");
    attempt(runId, "voice-over");
    expect(attempt(runId, "timestamps").attemptNumber).toBe(1);
    expect(attempt(runId, "timestamps").attemptNumber).toBe(2);
    expect(getStageAttempts(runId, "voice-over").map((a) => a.attemptNumber)).toEqual([1, 2]);
  });

  it("keeps each session's timestamps attempts to itself", () => {
    const runA = newRunId();
    const runB = newRunId();
    attempt(runA, "timestamps");
    expect(getStageAttempts(runB, "timestamps")).toEqual([]);
  });
});

describe("Obtained timestamps are stored once (Decision 7)", () => {
  it("stores the first record and refuses a second, leaving the first unchanged", () => {
    const runId = newRunId();

    expect(insertNarrationTimestamps(timestampsFor(runId, { mechanism: "native" }))).toBe(true);
    expect(insertNarrationTimestamps(timestampsFor(runId, { mechanism: "alignment", characterCount: 99 }))).toBe(false);

    expect(countNarrationTimestamps(runId)).toBe(1);
    expect(getNarrationTimestamps(runId)).toEqual(timestampsFor(runId, { mechanism: "native" }));
  });

  it("gives each session its own record", () => {
    const runA = newRunId();
    const runB = newRunId();
    insertNarrationTimestamps(timestampsFor(runA, { mechanism: "native" }));
    insertNarrationTimestamps(timestampsFor(runB, { mechanism: "alignment" }));
    expect(getNarrationTimestamps(runA)?.mechanism).toBe("native");
    expect(getNarrationTimestamps(runB)?.mechanism).toBe("alignment");
  });

  it("refuses a record for a session that does not exist, as an error and not as a duplicate", () => {
    expect(() => insertNarrationTimestamps(timestampsFor("no-such-session"))).toThrow(/FOREIGN KEY/);
  });

  it("has no record until one is stored", () => {
    const runId = newRunId();
    expect(getNarrationTimestamps(runId)).toBeUndefined();
    expect(countNarrationTimestamps(runId)).toBe(0);
  });

  it("refuses a mechanism other than native or alignment, in the store itself", () => {
    const runId = newRunId();
    expect(() =>
      db
        .prepare("INSERT INTO narration_timestamps (run_id, mechanism, path, character_count, obtained_at) VALUES (?, 'guess', 'p', 1, 'now')")
        .run(runId),
    ).toThrow(/CHECK constraint failed/);
  });

  it("is enforced by the store itself, not only by the repository function", () => {
    const runId = newRunId();
    insertNarrationTimestamps(timestampsFor(runId));
    expect(() =>
      db
        .prepare("INSERT INTO narration_timestamps (run_id, mechanism, path, character_count, obtained_at) VALUES (?, 'native', 'p', 1, 'now')")
        .run(runId),
    ).toThrow(/UNIQUE constraint failed/);
  });
});

describe("Stored timestamps cannot be modified or deleted (Decision 7)", () => {
  it.each([
    ["mechanism", "UPDATE narration_timestamps SET mechanism = 'alignment' WHERE run_id = ?"],
    ["path", "UPDATE narration_timestamps SET path = 'other.json' WHERE run_id = ?"],
    ["character_count", "UPDATE narration_timestamps SET character_count = 1 WHERE run_id = ?"],
  ])("refuses a change of %s and leaves the record unchanged", (_column, statement) => {
    const runId = newRunId();
    insertNarrationTimestamps(timestampsFor(runId));

    expect(() => db.prepare(statement).run(runId)).toThrow(/locked: narration_timestamps cannot be modified/);

    expect(getNarrationTimestamps(runId)).toEqual(timestampsFor(runId));
  });

  it("refuses a deletion and the record still exists", () => {
    const runId = newRunId();
    insertNarrationTimestamps(timestampsFor(runId));
    expect(() => db.prepare("DELETE FROM narration_timestamps WHERE run_id = ?").run(runId)).toThrow(
      /locked: narration_timestamps cannot be deleted/,
    );
    expect(countNarrationTimestamps(runId)).toBe(1);
  });
});

describe("Migration 8 (define-persistence Decision 6)", () => {
  it("adds the table and both triggers to a pre-existing database without touching its sessions, and is idempotent", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-migration-8-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-8.sqlite"));
      fixture.exec(`
        CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
        -- the baseline schema always has a scenes table; later migrations alter it
        CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
      `);
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('old-run', 'Old Session', 'then')").run();

      expect(applyMigrationsTo(fixture)).toContain(8);

      const tables = (fixture.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((r) => r.name);
      expect(tables).toContain("narration_timestamps");
      expect(triggerNames(fixture)).toEqual(
        expect.arrayContaining(["narration_timestamps_no_delete", "narration_timestamps_no_update"]),
      );
      expect(fixture.prepare("SELECT title FROM runs WHERE id = 'old-run'").get()).toEqual({ title: "Old Session" });
      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("The test-only reset keeps the timestamps lock", () => {
  it("empties narration_timestamps and leaves both triggers in place", () => {
    insertNarrationTimestamps(timestampsFor(newRunId()));

    resetAll();

    expect(db.prepare("SELECT COUNT(*) c FROM narration_timestamps").get()).toEqual({ c: 0 });
    expect(triggerNames()).toEqual(
      expect.arrayContaining(["narration_timestamps_no_delete", "narration_timestamps_no_update"]),
    );
  });

  it("locks a record stored after a reset, exactly as before", () => {
    resetAll();
    const runId = newRunId();
    insertNarrationTimestamps(timestampsFor(runId));
    expect(() => db.prepare("DELETE FROM narration_timestamps WHERE run_id = ?").run(runId)).toThrow(/locked/);
  });
});
