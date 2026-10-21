import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyMigrationsTo, bindAlignmentProvider, bindDecompositionProvider, createRun, getRun, resetAll } from "../src/db.ts";

// change-active-provider-from-admin (JOS-171), group 2 — design Decisions 2 and 3: the `active_providers`
// table, the two new per-session bindings, and the backfill of sessions that predate them.

const PREVIOUS_VERSION = 17;

// The same version-1 baseline persistence.test.ts uses; the migrations build everything else on top of it.
function baselineDatabase(): DatabaseSync {
  const target = new DatabaseSync(":memory:");
  target.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
  `);
  return target;
}

function insertRun(target: DatabaseSync, id: string): void {
  target.prepare("INSERT INTO runs (id, title, created_at) VALUES (?, 'T', '2026-10-01T00:00:00.000Z')").run(id);
}

function insertAttempt(target: DatabaseSync, runId: string, stage: string, attemptNumber: number, providerId: string | null): void {
  target
    .prepare(
      `INSERT INTO stage_attempts (id, run_id, stage, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, outcome)
       VALUES (?, ?, ?, ?, 1, ?, 'initial', ?, ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', 'success')`,
    )
    .run(`${runId}-${stage}-${attemptNumber}`, runId, stage, stage === "timestamps" ? "decomposition" : stage, attemptNumber, providerId, attemptNumber);
}

function bindings(target: DatabaseSync, runId: string): { decomposition: string | null; alignment: string | null } {
  const row = target.prepare("SELECT decomposition_provider_id AS d, alignment_provider_id AS a FROM runs WHERE id = ?").get(runId) as {
    d: string | null;
    a: string | null;
  };
  return { decomposition: row.d, alignment: row.a };
}

describe("active-provider storage migration", () => {
  it("creates active_providers and the two binding columns", () => {
    const target = baselineDatabase();
    applyMigrationsTo(target);
    const columns = (table: string) => (target.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns("active_providers")).toEqual(["stage", "provider_id", "changed_at"]);
    expect(columns("runs")).toEqual(expect.arrayContaining(["decomposition_provider_id", "alignment_provider_id"]));
  });

  it("backfills a pre-migration run from its earliest attempt of each stage", () => {
    const target = baselineDatabase();
    applyMigrationsTo(target, PREVIOUS_VERSION);
    insertRun(target, "run-1");
    insertAttempt(target, "run-1", "decomposition", 1, "openai-decomposition");
    insertAttempt(target, "run-1", "decomposition", 2, "openai-other");
    // Timestamps and decomposition share one stage instance, so their sequence numbers differ.
    insertAttempt(target, "run-1", "timestamps", 3, "elevenlabs-forced-alignment");
    applyMigrationsTo(target);
    expect(bindings(target, "run-1")).toEqual({ decomposition: "openai-decomposition", alignment: "elevenlabs-forced-alignment" });
  });

  it("does not backfill alignment from native timestamps", () => {
    const target = baselineDatabase();
    applyMigrationsTo(target, PREVIOUS_VERSION);
    insertRun(target, "run-2");
    insertAttempt(target, "run-2", "timestamps", 1, "elevenlabs-native");
    applyMigrationsTo(target);
    expect(bindings(target, "run-2").alignment).toBeNull();
  });

  it("leaves a run with no attempts unbound", () => {
    const target = baselineDatabase();
    applyMigrationsTo(target, PREVIOUS_VERSION);
    insertRun(target, "run-3");
    applyMigrationsTo(target);
    expect(bindings(target, "run-3")).toEqual({ decomposition: null, alignment: null });
  });
});

describe("bindDecompositionProvider and bindAlignmentProvider", () => {
  beforeEach(() => resetAll());

  const newRun = (): string => {
    const runId = randomUUID();
    createRun(runId, "Binding test", "A short script.", "en");
    return runId;
  };

  it("binds on the first call and never changes afterwards (reasoning)", () => {
    const runId = newRun();
    expect(bindDecompositionProvider(runId, "stub-a")).toBe(true);
    expect(bindDecompositionProvider(runId, "stub-b")).toBe(false);
    expect(getRun(runId)!.decompositionProviderId).toBe("stub-a");
  });

  it("binds on the first call and never changes afterwards (alignment)", () => {
    const runId = newRun();
    expect(bindAlignmentProvider(runId, "stub-a")).toBe(true);
    expect(bindAlignmentProvider(runId, "stub-b")).toBe(false);
    expect(getRun(runId)!.alignmentProviderId).toBe("stub-a");
  });

  it("starts unbound", () => {
    const run = getRun(newRun())!;
    expect([run.decompositionProviderId, run.alignmentProviderId]).toEqual([null, null]);
  });
});
