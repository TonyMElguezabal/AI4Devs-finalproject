import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrationsTo,
  bindVoiceProvider,
  createRun,
  db,
  getRun,
  resetAll,
  setRunFailure,
  setRunPaused,
} from "../src/db.ts";
import { createVoiceOverFailure } from "../src/sessionStateMachine.ts";

// lock-script-and-narration (JOS-137), group 2 — PRD §4.2, D10: the script,
// title and language cannot change from `submitted` onward. The lock lives in
// the store, so these tests write with raw SQL: they must fail for ANY caller,
// not only for the repository functions this codebase happens to expose.

const ORIGINAL_SCRIPT = "The original script, exactly as submitted.";

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "Original title", ORIGINAL_SCRIPT, "en");
  return runId;
}

function rawUpdate(runId: string, column: "script" | "title" | "language", value: string): void {
  db.prepare(`UPDATE runs SET ${column} = ? WHERE id = ?`).run(value, runId);
}

describe("The script cannot be modified from submitted onward (AC1)", () => {
  it("refuses a modification of a submitted session's script", () => {
    const runId = newRunId();

    expect(() => rawUpdate(runId, "script", "A rewritten script.")).toThrow(/locked/);

    expect(getRun(runId)?.script).toBe(ORIGINAL_SCRIPT);
  });

  it("refuses a modification while the session is paused", () => {
    const runId = newRunId();
    setRunPaused(runId, true);

    expect(() => rawUpdate(runId, "script", "A rewritten script.")).toThrow(/locked/);

    expect(getRun(runId)?.script).toBe(ORIGINAL_SCRIPT);
  });

  it("refuses a modification after a voice failure", () => {
    const runId = newRunId();
    setRunFailure(
      runId,
      createVoiceOverFailure({ cause: "The voice provider rejected the request.", retryable: false, occurredAt: new Date() }),
    );

    expect(() => rawUpdate(runId, "script", "A rewritten script.")).toThrow(/locked/);

    expect(getRun(runId)?.script).toBe(ORIGINAL_SCRIPT);
  });

  it("refuses even a write of the identical value, since nothing legitimate writes it", () => {
    const runId = newRunId();
    expect(() => rawUpdate(runId, "script", ORIGINAL_SCRIPT)).toThrow(/locked/);
  });

  it("refuses a modification of another session's script without touching either", () => {
    const runA = newRunId();
    const runB = newRunId();
    expect(() => rawUpdate(runA, "script", "Changed.")).toThrow(/locked/);
    expect(getRun(runA)?.script).toBe(ORIGINAL_SCRIPT);
    expect(getRun(runB)?.script).toBe(ORIGINAL_SCRIPT);
  });
});

describe("The title and language cannot be modified either", () => {
  it("refuses a modification of the title", () => {
    const runId = newRunId();
    expect(() => rawUpdate(runId, "title", "A new title")).toThrow(/locked/);
    expect(getRun(runId)?.title).toBe("Original title");
  });

  it("refuses a modification of the language", () => {
    const runId = newRunId();
    expect(() => rawUpdate(runId, "language", "es")).toThrow(/locked/);
    expect(getRun(runId)?.language).toBe("en");
  });

  it.each(["script", "title", "language"] as const)("names the locked field %s in the refusal", (column) => {
    const runId = newRunId();
    expect(() => rawUpdate(runId, column, "x")).toThrow(new RegExp(`runs\\.${column}`));
  });

  it("refuses an update that changes an allowed column and a locked one together, changing neither", () => {
    const runId = newRunId();
    expect(() => db.prepare("UPDATE runs SET paused = 1, script = 'x' WHERE id = ?").run(runId)).toThrow(/locked/);
    expect(getRun(runId)).toMatchObject({ paused: false, script: ORIGINAL_SCRIPT });
  });
});

describe("Other session fields still change normally", () => {
  it("pauses, continues, binds the voice provider and records a failure without touching the locked content", () => {
    const runId = newRunId();

    setRunPaused(runId, true);
    setRunPaused(runId, false);
    bindVoiceProvider(runId, "elevenlabs");
    const failure = createVoiceOverFailure({ cause: "The voice provider timed out.", retryable: true, occurredAt: new Date() });
    setRunFailure(runId, failure);

    expect(getRun(runId)).toMatchObject({
      paused: false,
      voiceProviderId: "elevenlabs",
      failure,
      title: "Original title",
      script: ORIGINAL_SCRIPT,
      language: "en",
    });
  });
});

describe("A session stored before the lock existed (define-persistence Decision 6)", () => {
  it("refuses a script modification once the migration has run, and the migration is idempotent", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-lock-migration-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-lock.sqlite"));
      fixture.exec(`
        CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      `);
      fixture
        .prepare("INSERT INTO runs (id, title, created_at, paused) VALUES ('old-run', 'Old Session', '2026-01-01T00:00:00.000Z', 0)")
        .run();

      const applied = applyMigrationsTo(fixture);
      expect(applied).toContain(5);

      expect(() => fixture.prepare("UPDATE runs SET script = 'tampered' WHERE id = 'old-run'").run()).toThrow(/locked/);
      const run = fixture.prepare("SELECT title, script FROM runs WHERE id = 'old-run'").get() as { title: string; script: string };
      expect(run).toEqual({ title: "Old Session", script: "" });

      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
