import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrationsTo,
  bindVoiceProvider,
  completeStageAttempt,
  countVoiceOvers,
  createRun,
  db,
  getRun,
  getStageAttempts,
  getVoiceOver,
  insertVoiceOver,
  recordStageAttempt,
  resetAll,
  setRunFailure,
  snapshotCounts,
  type VoiceOverInput,
} from "../src/db.ts";
import { createVoiceOverFailure } from "../src/sessionStateMachine.ts";

// generate-voice-over (JOS-136), group 3 — the records this story adds to the
// store: the bound voice provider and the failure on the session, exactly one
// voice-over per session, and the append-only stage-attempt record.

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "voice-over persistence test", "A short script.", "en");
  return runId;
}

function voiceOverFor(runId: string, overrides: Partial<VoiceOverInput> = {}): VoiceOverInput {
  return {
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: null,
    durationSeconds: 12.5,
    sizeBytes: 200_000,
    nativeTimestampsAvailable: false,
    providerRequestId: "req-1",
    completedAt: "2026-09-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("A session has at most one voice-over (Decision 8)", () => {
  it("stores the first voice-over and rejects a second one, leaving the first unchanged", () => {
    const runId = newRunId();

    const first = insertVoiceOver(voiceOverFor(runId, { audioPath: "first.mp3" }));
    const second = insertVoiceOver(voiceOverFor(runId, { audioPath: "second.mp3" }));

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(countVoiceOvers(runId)).toBe(1);
    expect(getVoiceOver(runId)?.audioPath).toBe("first.mp3");
  });

  it("two 'concurrent' confirmations for the same session: exactly one is stored", () => {
    // node:sqlite is synchronous, so true interleaving cannot be forced; the
    // guarantee is structural (the store's unique key), so two back-to-back
    // calls prove the same property a genuinely concurrent pair would hit.
    const runId = newRunId();
    const results = [insertVoiceOver(voiceOverFor(runId)), insertVoiceOver(voiceOverFor(runId))];
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(countVoiceOvers(runId)).toBe(1);
  });

  it("is enforced by the store itself, not only by the repository function", () => {
    const runId = newRunId();
    insertVoiceOver(voiceOverFor(runId));
    expect(() =>
      db
        .prepare(
          "INSERT INTO voice_overs (run_id, audio_path, duration_seconds, size_bytes, native_timestamps_available, completed_at) VALUES (?, 'raw.mp3', 1, 1, 0, 'now')",
        )
        .run(runId),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("gives each session its own voice-over", () => {
    const runA = newRunId();
    const runB = newRunId();
    expect(insertVoiceOver(voiceOverFor(runA, { audioPath: "a.mp3" }))).toBe(true);
    expect(insertVoiceOver(voiceOverFor(runB, { audioPath: "b.mp3" }))).toBe(true);
    expect(getVoiceOver(runA)?.audioPath).toBe("a.mp3");
    expect(getVoiceOver(runB)?.audioPath).toBe("b.mp3");
  });

  it("keeps the native-timestamp fields exactly as given", () => {
    const runId = newRunId();
    insertVoiceOver(
      voiceOverFor(runId, { timestampsPath: "voice-over.timestamps.json", nativeTimestampsAvailable: true }),
    );
    expect(getVoiceOver(runId)).toMatchObject({
      timestampsPath: "voice-over.timestamps.json",
      nativeTimestampsAvailable: true,
      durationSeconds: 12.5,
      sizeBytes: 200_000,
      providerRequestId: "req-1",
    });
  });

  it("has no voice-over until one is inserted", () => {
    const runId = newRunId();
    expect(getVoiceOver(runId)).toBeUndefined();
    expect(countVoiceOvers(runId)).toBe(0);
  });
});

describe("The voice provider is bound once (Decision 3)", () => {
  it("starts unbound", () => {
    expect(getRun(newRunId())?.voiceProviderId).toBeNull();
  });

  it("binds the provider on the first call", () => {
    const runId = newRunId();
    expect(bindVoiceProvider(runId, "elevenlabs")).toBe(true);
    expect(getRun(runId)?.voiceProviderId).toBe("elevenlabs");
  });

  it("does not overwrite a provider that is already bound", () => {
    const runId = newRunId();
    bindVoiceProvider(runId, "elevenlabs");

    expect(bindVoiceProvider(runId, "another-provider")).toBe(false);
    expect(getRun(runId)?.voiceProviderId).toBe("elevenlabs");
  });

  it("binds each session independently", () => {
    const runA = newRunId();
    const runB = newRunId();
    bindVoiceProvider(runA, "provider-a");
    expect(getRun(runB)?.voiceProviderId).toBeNull();
  });
});

describe("The session carries its failure (Decision 9)", () => {
  it("has no failure by default", () => {
    expect(getRun(newRunId())?.failure).toBeNull();
  });

  it("stores and returns the failure with its phase, cause, retryability and time", () => {
    const runId = newRunId();
    const failure = createVoiceOverFailure({
      cause: "The voice provider rejected the request.",
      retryable: false,
      occurredAt: new Date("2026-09-28T10:00:00.000Z"),
    });

    setRunFailure(runId, failure);

    expect(getRun(runId)?.failure).toEqual(failure);
  });
});

describe("Stage attempts are recorded before the request and never rewritten (Decision 2)", () => {
  const recordFirst = (runId: string) =>
    recordStageAttempt({
      runId,
      stage: "voice-over",
      providerId: "elevenlabs",
      queuedAt: "2026-09-28T10:00:00.000Z",
      sentAt: "2026-09-28T10:00:01.000Z",
    });

  it("records an in-flight attempt with its stage, provider, sequence and times", () => {
    const runId = newRunId();

    const attempt = recordFirst(runId);

    expect(attempt).toMatchObject({
      runId,
      stage: "voice-over",
      providerId: "elevenlabs",
      attemptNumber: 1,
      queuedAt: "2026-09-28T10:00:00.000Z",
      sentAt: "2026-09-28T10:00:01.000Z",
      outcome: "in-flight",
      finishedAt: null,
      externalRequestId: null,
    });
    expect(getStageAttempts(runId, "voice-over")).toEqual([attempt]);
  });

  it("appends a new row for each attempt, numbering them in sequence and keeping the earlier ones", () => {
    const runId = newRunId();
    const first = recordFirst(runId);
    completeStageAttempt(first.id, { outcome: "transient", finishedAt: "2026-09-28T10:00:02.000Z", errorMessage: "503" });
    const second = recordFirst(runId);

    const all = getStageAttempts(runId, "voice-over");
    expect(all.map((a) => a.attemptNumber)).toEqual([1, 2]);
    expect(all[0]?.outcome).toBe("transient");
    expect(second.outcome).toBe("in-flight");
  });

  it("completes an in-flight attempt with its outcome, finish time and external request id", () => {
    const runId = newRunId();
    const attempt = recordFirst(runId);

    const completed = completeStageAttempt(attempt.id, {
      outcome: "success",
      finishedAt: "2026-09-28T10:00:05.000Z",
      externalRequestId: "req-42",
    });

    expect(completed).toBe(true);
    expect(getStageAttempts(runId, "voice-over")[0]).toMatchObject({
      outcome: "success",
      finishedAt: "2026-09-28T10:00:05.000Z",
      externalRequestId: "req-42",
    });
  });

  it("keeps the provider's raw error code and message on a failed attempt", () => {
    const runId = newRunId();
    const attempt = recordFirst(runId);

    completeStageAttempt(attempt.id, {
      outcome: "not-retryable",
      finishedAt: "2026-09-28T10:00:05.000Z",
      errorCode: "422",
      errorMessage: "voice not found",
    });

    expect(getStageAttempts(runId, "voice-over")[0]).toMatchObject({
      outcome: "not-retryable",
      errorCode: "422",
      errorMessage: "voice not found",
    });
  });

  it("refuses to complete an attempt twice, so a repeated outcome cannot rewrite history", () => {
    const runId = newRunId();
    const attempt = recordFirst(runId);
    completeStageAttempt(attempt.id, { outcome: "success", finishedAt: "2026-09-28T10:00:05.000Z" });

    const again = completeStageAttempt(attempt.id, { outcome: "transient", finishedAt: "2026-09-28T10:00:09.000Z" });

    expect(again).toBe(false);
    expect(getStageAttempts(runId, "voice-over")[0]?.outcome).toBe("success");
  });

  it("refuses to complete an attempt with the in-flight outcome", () => {
    const attempt = recordFirst(newRunId());
    expect(() =>
      // @ts-expect-error the type already forbids it; this proves the runtime guard as well
      completeStageAttempt(attempt.id, { outcome: "in-flight", finishedAt: "2026-09-28T10:00:05.000Z" }),
    ).toThrow(/in-flight/);
  });

  it("is enforced by the store: a duplicate (session, stage, sequence) is rejected", () => {
    const runId = newRunId();
    recordFirst(runId);
    expect(() =>
      db
        .prepare(
          "INSERT INTO stage_attempts (id, run_id, stage, provider_id, attempt_number, queued_at, sent_at, outcome) VALUES (?, ?, 'voice-over', 'elevenlabs', 1, 'q', 's', 'in-flight')",
        )
        .run(randomUUID(), runId),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("numbers each session's attempts from 1", () => {
    const runA = newRunId();
    const runB = newRunId();
    recordFirst(runA);
    recordFirst(runA);
    expect(recordFirst(runB).attemptNumber).toBe(1);
  });
});

describe("Store housekeeping", () => {
  it("counts voice-overs and stage attempts in the state snapshot and clears them on reset", () => {
    const runId = newRunId();
    insertVoiceOver(voiceOverFor(runId));
    recordStageAttempt({
      runId,
      stage: "voice-over",
      providerId: "elevenlabs",
      queuedAt: "2026-09-28T10:00:00.000Z",
      sentAt: "2026-09-28T10:00:01.000Z",
    });
    expect(snapshotCounts()).toMatchObject({ runs: 1, voiceOvers: 1, stageAttempts: 1 });

    resetAll();

    expect(snapshotCounts()).toEqual({ runs: 0, scenes: 0, providerRequests: 0, sceneResults: 0, voiceOvers: 0, stageAttempts: 0 });
  });
});

describe("Migration 4 preserves existing sessions (define-persistence Decision 6)", () => {
  it("adds the voice-over columns and tables without touching a pre-existing session", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-voice-migration-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-voice-over.sqlite"));
      fixture.exec(`
        CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
        -- the baseline schema always has a scenes table; migration 7 alters it
        CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
      `);
      fixture
        .prepare("INSERT INTO runs (id, title, created_at, paused) VALUES ('old-run', 'Old Session', '2026-01-01T00:00:00.000Z', 0)")
        .run();

      const applied = applyMigrationsTo(fixture);
      expect(applied).toContain(4);

      const run = fixture.prepare("SELECT * FROM runs WHERE id = 'old-run'").get() as Record<string, unknown>;
      expect(run.title).toBe("Old Session");
      expect(run.voice_provider_id).toBeNull();
      expect(run.failure).toBeNull();

      const tables = (
        fixture.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
      ).map((row) => row.name);
      expect(tables).toEqual(expect.arrayContaining(["voice_overs", "stage_attempts"]));

      expect(applyMigrationsTo(fixture)).toEqual([]);
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
