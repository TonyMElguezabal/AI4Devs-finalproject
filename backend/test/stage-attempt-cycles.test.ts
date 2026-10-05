import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrationsTo, createRun, db, getStageAttempts, recordStageAttempt, resetAll } from "../src/db.ts";

// bounded-retry-policy (JOS-184), group 3 — the store enforces the budget:
// at most four attempts per cycle of a stage instance, a unique
// (stage instance, cycle, sequence), and a new cycle that starts again at 1.

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "attempt cycles test", "A short script.", "en");
  return runId;
}

function record(runId: string, extra: { cycle?: number; trigger?: "initial" | "automatic" | "manual" } = {}) {
  const now = "2026-10-04T10:00:00.000Z";
  return recordStageAttempt({ runId, stage: "voice-over", providerId: "stub-voice", queuedAt: now, sentAt: now, ...extra });
}

describe("The cap is enforced by the store (Decision 3)", () => {
  it("accepts four attempts in a cycle and rejects a fifth, leaving four rows", () => {
    const runId = newRunId();
    for (let n = 1; n <= 4; n++) expect(record(runId).sequenceInCycle).toBe(n);

    expect(() => record(runId)).toThrow(/CHECK constraint failed/);

    expect(getStageAttempts(runId, "voice-over")).toHaveLength(4);
  });

  it("leaves exactly one row when two inserts claim the same (stage instance, cycle, sequence)", () => {
    const runId = newRunId();
    const insert = () =>
      db
        .prepare(
          `INSERT INTO stage_attempts (id, run_id, stage, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, outcome)
           VALUES (?, ?, 'voice-over', ?, 1, 1, 'initial', 'stub-voice', ?, 'q', 's', 'in-flight')`,
        )
        .run(randomUUID(), runId, `${runId}:voice-over`, Math.floor(Math.random() * 1_000_000));

    insert();
    expect(insert).toThrow(/UNIQUE constraint failed/);

    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
  });

  it("keeps each session's budget separate", () => {
    const first = newRunId();
    const second = newRunId();
    for (let n = 1; n <= 4; n++) record(first);

    expect(record(second).sequenceInCycle).toBe(1);
  });

  it("records the first attempt as the initial trigger in cycle 1, keyed by session and stage", () => {
    const runId = newRunId();

    const attempt = record(runId);

    expect(attempt).toMatchObject({ stageInstanceKey: `${runId}:voice-over`, cycle: 1, sequenceInCycle: 1, trigger: "initial", dueAt: null });
  });
});

describe("A new cycle (Decision 7)", () => {
  it("accepts sequence 1 again, keeps the earlier attempts and continues the session-wide attempt number", () => {
    const runId = newRunId();
    for (let n = 1; n <= 4; n++) record(runId);

    const next = record(runId, { cycle: 2, trigger: "manual" });

    expect(next).toMatchObject({ cycle: 2, sequenceInCycle: 1, trigger: "manual", attemptNumber: 5 });
    const all = getStageAttempts(runId, "voice-over");
    expect(all).toHaveLength(5);
    expect(all.filter((attempt) => attempt.cycle === 1)).toHaveLength(4);
  });

  it("allows four attempts in the new cycle and rejects a fifth there too", () => {
    const runId = newRunId();
    for (let n = 1; n <= 4; n++) record(runId);
    for (let n = 1; n <= 4; n++) record(runId, { cycle: 2, trigger: n === 1 ? "manual" : "automatic" });

    expect(() => record(runId, { cycle: 2, trigger: "automatic" })).toThrow(/CHECK constraint failed/);
  });

  it("continues in the latest cycle when no cycle is given", () => {
    const runId = newRunId();
    record(runId);
    record(runId, { cycle: 2, trigger: "manual" });

    expect(record(runId, { trigger: "automatic" })).toMatchObject({ cycle: 2, sequenceInCycle: 2 });
  });
});

describe("The scheduled outcome", () => {
  it("stores a scheduled attempt with its due time and no send time", () => {
    const runId = newRunId();
    db.prepare(
      `INSERT INTO stage_attempts (id, run_id, stage, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, due_at, outcome)
       VALUES (?, ?, 'voice-over', ?, 1, 1, 'automatic', 'stub-voice', 1, 'q', '2026-10-04T10:00:05.000Z', 'scheduled')`,
    ).run(randomUUID(), runId, `${runId}:voice-over`);

    expect(getStageAttempts(runId, "voice-over")[0]).toMatchObject({ outcome: "scheduled", dueAt: "2026-10-04T10:00:05.000Z", sentAt: null });
  });
});

describe("Migration 14 backfills the existing attempts (design Migration Plan)", () => {
  function fixtureAt12(dir: string): DatabaseSync {
    const fixture = new DatabaseSync(join(dir, "pre-retry-policy.sqlite"));
    fixture.exec(`
      CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
    `);
    fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('old', 'Old', '2026-01-01T00:00:00.000Z')").run();
    applyMigrationsTo(fixture, 12);
    return fixture;
  }

  function oldAttempt(fixture: DatabaseSync, stage: string, attemptNumber: number): void {
    fixture
      .prepare(
        "INSERT INTO stage_attempts (id, run_id, stage, provider_id, attempt_number, queued_at, sent_at, outcome) VALUES (?, 'old', ?, 'p', ?, 'q', ?, 'transient')",
      )
      .run(randomUUID(), stage, attemptNumber, `2026-01-01T00:00:0${attemptNumber}.000Z`);
  }

  it("makes every old attempt cycle 1 with a sequence in sent order, and keys timestamps attempts to the decomposition instance", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-retry-migration-test-"));
    try {
      const fixture = fixtureAt12(dir);
      oldAttempt(fixture, "voice-over", 1);
      oldAttempt(fixture, "voice-over", 2);
      oldAttempt(fixture, "timestamps", 1);

      expect(applyMigrationsTo(fixture)).toEqual([14]);

      const rows = fixture
        .prepare("SELECT stage, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, attempt_number FROM stage_attempts ORDER BY stage, attempt_number")
        .all() as Array<Record<string, unknown>>;
      expect(rows).toEqual([
        { stage: "timestamps", stage_instance_key: "old:decomposition", cycle: 1, sequence_in_cycle: 1, attempt_trigger: "initial", attempt_number: 1 },
        { stage: "voice-over", stage_instance_key: "old:voice-over", cycle: 1, sequence_in_cycle: 1, attempt_trigger: "initial", attempt_number: 1 },
        { stage: "voice-over", stage_instance_key: "old:voice-over", cycle: 1, sequence_in_cycle: 2, attempt_trigger: "manual", attempt_number: 2 },
      ]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly, leaving the old table untouched, when a stage instance already holds more than four attempts", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-retry-migration-test-"));
    try {
      const fixture = fixtureAt12(dir);
      for (let n = 1; n <= 5; n++) oldAttempt(fixture, "voice-over", n);

      expect(() => applyMigrationsTo(fixture)).toThrow(/CHECK constraint failed/);

      expect((fixture.prepare("SELECT COUNT(*) c FROM stage_attempts").get() as { c: number }).c).toBe(5);
      const columns = (fixture.prepare("PRAGMA table_info(stage_attempts)").all() as Array<{ name: string }>).map((column) => column.name);
      expect(columns).not.toContain("stage_instance_key");
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
