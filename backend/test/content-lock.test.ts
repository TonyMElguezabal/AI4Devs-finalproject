import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ArtefactAlreadyExistsError,
  applyMigrationsTo,
  bindVoiceProvider,
  countVoiceOvers,
  createRun,
  db,
  getRun,
  getVoiceOver,
  insertVoiceOver,
  resetAll,
  resolveArtefactPath,
  setRunFailure,
  setRunPaused,
  type VoiceOverInput,
  writeArtefactOnce,
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


// ---- Group 3 — a completed narration is never replaced (AC2, design Decision 2) ----

function voiceOverFor(runId: string): VoiceOverInput {
  return {
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: null,
    durationSeconds: 12.5,
    sizeBytes: 200_000,
    nativeTimestampsAvailable: false,
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
  };
}

function triggerNames(target: DatabaseSync = db): string[] {
  return (
    target.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as Array<{ name: string }>
  ).map((row) => row.name);
}

describe("A completed voice-over record cannot be modified or deleted (AC2)", () => {
  it.each([
    ["audio_path", "UPDATE voice_overs SET audio_path = 'replaced.mp3' WHERE run_id = ?"],
    ["duration_seconds", "UPDATE voice_overs SET duration_seconds = 99 WHERE run_id = ?"],
    ["native_timestamps_available", "UPDATE voice_overs SET native_timestamps_available = 1 WHERE run_id = ?"],
  ])("refuses a modification of %s and leaves the record unchanged", (_column, statement) => {
    const runId = newRunId();
    insertVoiceOver(voiceOverFor(runId));

    expect(() => db.prepare(statement).run(runId)).toThrow(/locked/);

    expect(getVoiceOver(runId)).toEqual(voiceOverFor(runId));
  });

  it("refuses a deletion and the record still exists", () => {
    const runId = newRunId();
    insertVoiceOver(voiceOverFor(runId));

    expect(() => db.prepare("DELETE FROM voice_overs WHERE run_id = ?").run(runId)).toThrow(/locked/);

    expect(countVoiceOvers(runId)).toBe(1);
    expect(getVoiceOver(runId)).toEqual(voiceOverFor(runId));
  });

  it("refuses a deletion of every row at once", () => {
    const runA = newRunId();
    const runB = newRunId();
    insertVoiceOver(voiceOverFor(runA));
    insertVoiceOver(voiceOverFor(runB));

    expect(() => db.exec("DELETE FROM voice_overs")).toThrow(/locked/);

    expect(countVoiceOvers(runA) + countVoiceOvers(runB)).toBe(2);
  });

  it("still refuses a second voice-over for the same session", () => {
    const runId = newRunId();
    insertVoiceOver(voiceOverFor(runId));
    expect(insertVoiceOver({ ...voiceOverFor(runId), audioPath: "second.mp3" })).toBe(false);
    expect(getVoiceOver(runId)?.audioPath).toBe("voice-over.mp3");
  });

  it("protects a database that already applied migration 5, through migration 6", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-lock-migration-6-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "at-version-5.sqlite"));
      fixture.exec("CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);");
      applyMigrationsTo(fixture);
      // Pretend this database stopped at version 5: drop what migration 6 added and forget it ran.
      fixture.exec("DROP TRIGGER voice_overs_no_update; DROP TRIGGER voice_overs_no_delete; DELETE FROM schema_migrations WHERE version = 6;");
      fixture.prepare("INSERT INTO runs (id, title, created_at, paused, script) VALUES ('r', 't', 'now', 0, 's')").run();
      fixture
        .prepare(
          "INSERT INTO voice_overs (run_id, audio_path, duration_seconds, size_bytes, native_timestamps_available, completed_at) VALUES ('r', 'a.mp3', 1, 1, 0, 'now')",
        )
        .run();

      expect(applyMigrationsTo(fixture)).toEqual([6]);

      expect(() => fixture.prepare("UPDATE voice_overs SET audio_path = 'x' WHERE run_id = 'r'").run()).toThrow(/locked/);
      expect(() => fixture.prepare("DELETE FROM voice_overs WHERE run_id = 'r'").run()).toThrow(/locked/);
      expect(triggerNames(fixture)).toEqual(
        expect.arrayContaining(["voice_overs_no_delete", "voice_overs_no_update"]),
      );
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("The test-only reset empties voice-overs without lifting the lock (design Decision 2)", () => {
  it("removes the voice-over rows and leaves both voice-over triggers in place", () => {
    const runId = newRunId();
    insertVoiceOver(voiceOverFor(runId));

    resetAll();

    expect(db.prepare("SELECT COUNT(*) c FROM voice_overs").get()).toEqual({ c: 0 });
    expect(triggerNames()).toEqual(expect.arrayContaining(["voice_overs_no_delete", "voice_overs_no_update"]));
  });

  it("locks a voice-over stored after a reset, exactly as before", () => {
    resetAll();
    const runId = newRunId();
    insertVoiceOver(voiceOverFor(runId));

    expect(() => db.prepare("DELETE FROM voice_overs WHERE run_id = ?").run(runId)).toThrow(/locked/);
    expect(() => db.prepare("UPDATE voice_overs SET audio_path = 'x' WHERE run_id = ?").run(runId)).toThrow(/locked/);
  });

  it("leaves the session content locks in place too", () => {
    resetAll();
    expect(triggerNames()).toEqual(
      expect.arrayContaining(["runs_language_locked", "runs_script_locked", "runs_title_locked"]),
    );
  });
});


// ---- Group 4 — the MP3 file is written once (AC2, design Decision 3) ----

describe("An artefact that must not be replaced is written once", () => {
  const filesIn = (projectFolder: string, relativeDir = "."): string[] =>
    readdirSync(resolveArtefactPath(projectFolder, relativeDir)).sort();

  it("writes a new file under the session's project folder and returns its relative path", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");

    const relativePath = writeArtefactOnce(projectFolder, "voice-over.mp3", Buffer.from("first"));

    expect(relativePath).toBe("voice-over.mp3");
    expect(readFileSync(resolveArtefactPath(projectFolder, relativePath), "utf8")).toBe("first");
  });

  it("refuses a second write to the same path and leaves the first file's bytes unchanged", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");
    writeArtefactOnce(projectFolder, "voice-over.mp3", Buffer.from("first"));

    expect(() => writeArtefactOnce(projectFolder, "voice-over.mp3", Buffer.from("second"))).toThrow(
      ArtefactAlreadyExistsError,
    );

    expect(readFileSync(resolveArtefactPath(projectFolder, "voice-over.mp3"), "utf8")).toBe("first");
  });

  it("names the refused path in the error", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");
    writeArtefactOnce(projectFolder, "voice-over.mp3", "first");
    expect(() => writeArtefactOnce(projectFolder, "voice-over.mp3", "second")).toThrow(/voice-over\.mp3/);
  });

  it("two back-to-back writes to the same path: exactly one succeeds", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");
    const outcomes = ["a", "b"].map((content) => {
      try {
        writeArtefactOnce(projectFolder, "voice-over.mp3", content);
        return "written";
      } catch {
        return "refused";
      }
    });
    expect(outcomes.filter((outcome) => outcome === "written")).toHaveLength(1);
  });

  it("stores binary content byte for byte", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, value) => value));

    writeArtefactOnce(projectFolder, "voice-over.mp3", bytes);

    expect(readFileSync(resolveArtefactPath(projectFolder, "voice-over.mp3")).equals(bytes)).toBe(true);
  });

  it("creates the directories of a nested path", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");
    writeArtefactOnce(projectFolder, "audio/voice-over.mp3", "nested");
    expect(filesIn(projectFolder, "audio")).toEqual(["voice-over.mp3"]);
  });

  it("refuses a path outside the session's project folder, as writeArtefact does", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");
    expect(() => writeArtefactOnce(projectFolder, "../escaped.mp3", "x")).toThrow(/outside/);
  });

  it("leaves no temporary file behind after a success", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");
    writeArtefactOnce(projectFolder, "voice-over.mp3", "first");
    expect(filesIn(projectFolder)).toEqual(["voice-over.mp3"]);
  });

  it("leaves no temporary file behind after a refusal", () => {
    const { projectFolder } = createRun(randomUUID(), "Once", "A script.", "en");
    writeArtefactOnce(projectFolder, "voice-over.mp3", "first");
    expect(() => writeArtefactOnce(projectFolder, "voice-over.mp3", "second")).toThrow();
    expect(filesIn(projectFolder)).toEqual(["voice-over.mp3"]);
  });

  it("does not disturb another session's folder", () => {
    const first = createRun(randomUUID(), "Same Title", "A script.", "en");
    const second = createRun(randomUUID(), "Same Title", "A script.", "en");
    writeArtefactOnce(first.projectFolder, "voice-over.mp3", "first");
    expect(filesIn(second.projectFolder)).toEqual([]);
    expect(() => writeArtefactOnce(second.projectFolder, "voice-over.mp3", "second")).not.toThrow();
  });
});
