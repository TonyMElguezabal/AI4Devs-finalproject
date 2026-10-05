import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptLateResult,
  applyMigrationsTo,
  cancelScheduledAttempt,
  cancelScheduledAttemptsOfInstance,
  claimScheduledAttempt,
  completeStageAttempt,
  createRun,
  getStageAttempt,
  recordLateFailure,
  recordStageAttempt,
  scheduleStageAttempt,
  supersedeLateResult,
  resetAll,
  timeOutAttempt,
} from "../src/db.ts";

// stage-execution-time-limit (JOS-185), group 3 — the conditional transitions that decide every
// race between a timeout, a result and a retry: each moves an attempt exactly once.

const SENT = "2026-10-05T10:00:00.000Z";
const LATER = "2026-10-05T10:00:30.000Z";

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "attempt outcomes test", "A short script.", "en");
  return runId;
}

function inFlight(runId: string) {
  return recordStageAttempt({ runId, stage: "voice-over", providerId: "stub-voice", queuedAt: SENT, sentAt: SENT });
}

function scheduled(runId: string) {
  return scheduleStageAttempt({ runId, stage: "voice-over", providerId: "stub-voice", queuedAt: SENT, dueAt: LATER, trigger: "automatic" });
}

describe("in-flight → timed-out", () => {
  it("succeeds exactly once and records when it timed out", () => {
    const attempt = inFlight(newRunId());

    expect(timeOutAttempt(attempt.id, LATER)).toBe(true);
    expect(timeOutAttempt(attempt.id, LATER)).toBe(false);

    expect(getStageAttempt(attempt.id)).toMatchObject({ outcome: "timed-out", finishedAt: LATER });
  });

  it("does not touch an attempt that already has a result", () => {
    const attempt = inFlight(newRunId());
    completeStageAttempt(attempt.id, { outcome: "success", finishedAt: SENT });

    expect(timeOutAttempt(attempt.id, LATER)).toBe(false);
    expect(getStageAttempt(attempt.id)!.outcome).toBe("success");
  });
});

describe("timed-out → late-success or superseded", () => {
  it("accepts a late result exactly once and records when it arrived", () => {
    const attempt = inFlight(newRunId());
    timeOutAttempt(attempt.id, LATER);

    expect(acceptLateResult(attempt.id, "2026-10-05T10:01:00.000Z")).toBe(true);
    expect(acceptLateResult(attempt.id, "2026-10-05T10:02:00.000Z")).toBe(false);

    expect(getStageAttempt(attempt.id)).toMatchObject({ outcome: "late-success", lateResultAt: "2026-10-05T10:01:00.000Z" });
  });

  it("supersedes a late result exactly once", () => {
    const attempt = inFlight(newRunId());
    timeOutAttempt(attempt.id, LATER);

    expect(supersedeLateResult(attempt.id, "2026-10-05T10:01:00.000Z")).toBe(true);
    expect(supersedeLateResult(attempt.id, "2026-10-05T10:02:00.000Z")).toBe(false);

    expect(getStageAttempt(attempt.id)).toMatchObject({ outcome: "superseded", lateResultAt: "2026-10-05T10:01:00.000Z" });
  });

  it("lets only one of accept and supersede win for the same attempt", () => {
    const attempt = inFlight(newRunId());
    timeOutAttempt(attempt.id, LATER);

    expect(acceptLateResult(attempt.id, LATER)).toBe(true);
    expect(supersedeLateResult(attempt.id, LATER)).toBe(false);
    expect(getStageAttempt(attempt.id)!.outcome).toBe("late-success");
  });

  it("applies only to a timed-out attempt, never to one still in flight", () => {
    const attempt = inFlight(newRunId());

    expect(acceptLateResult(attempt.id, LATER)).toBe(false);
    expect(supersedeLateResult(attempt.id, LATER)).toBe(false);
    expect(getStageAttempt(attempt.id)!.outcome).toBe("in-flight");
  });
});

describe("scheduled → cancelled", () => {
  it("succeeds exactly once", () => {
    const attempt = scheduled(newRunId());

    expect(cancelScheduledAttempt(attempt.id)).toBe(true);
    expect(cancelScheduledAttempt(attempt.id)).toBe(false);
    expect(getStageAttempt(attempt.id)!.outcome).toBe("cancelled");
  });

  it("loses to a send that claimed the attempt first", () => {
    const attempt = scheduled(newRunId());

    expect(claimScheduledAttempt(attempt.id, LATER)).toBe(true);
    expect(cancelScheduledAttempt(attempt.id)).toBe(false);
    expect(getStageAttempt(attempt.id)!.outcome).toBe("in-flight");
  });

  it("makes a later send fail to claim it", () => {
    const attempt = scheduled(newRunId());

    expect(cancelScheduledAttempt(attempt.id)).toBe(true);
    expect(claimScheduledAttempt(attempt.id, LATER)).toBe(false);
  });
});

describe("a late failure and bulk cancellation", () => {
  it("records a late failure on a timed-out attempt without changing its outcome, and not on any other", () => {
    const timedOut = inFlight(newRunId());
    timeOutAttempt(timedOut.id, LATER);
    const running = inFlight(newRunId());

    expect(recordLateFailure(timedOut.id, "provider gave up")).toBe(true);
    expect(recordLateFailure(running.id, "provider gave up")).toBe(false);

    expect(getStageAttempt(timedOut.id)).toMatchObject({ outcome: "timed-out", errorMessage: "provider gave up" });
  });

  it("cancels only the scheduled attempts of one stage instance", () => {
    const runId = newRunId();
    const first = scheduled(runId);
    const other = scheduled(newRunId());
    const sent = inFlight(runId);

    expect(cancelScheduledAttemptsOfInstance(first.stageInstanceKey)).toBe(1);

    expect(getStageAttempt(first.id)!.outcome).toBe("cancelled");
    expect(getStageAttempt(other.id)!.outcome).toBe("scheduled");
    expect(getStageAttempt(sent.id)!.outcome).toBe("in-flight");
  });
});

describe("Migration 15 adds the outcomes and lateResultAt", () => {
  it("allows the new outcomes on a database migrated from 14, keeps old rows, and still caps a cycle at four", () => {
    const dir = mkdtempSync(join(tmpdir(), "vid4you-timeout-migration-test-"));
    try {
      const fixture = new DatabaseSync(join(dir, "pre-timeout.sqlite"));
      fixture.exec(`
        CREATE TABLE runs (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE scenes (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idx INTEGER NOT NULL, status TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '');
      `);
      fixture.prepare("INSERT INTO runs (id, title, created_at) VALUES ('old', 'Old', '2026-01-01T00:00:00.000Z')").run();
      applyMigrationsTo(fixture, 14);
      fixture
        .prepare(
          "INSERT INTO stage_attempts (id, run_id, stage, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, outcome) VALUES ('a1', 'old', 'voice-over', 'old:voice-over', 1, 1, 'initial', 'p', 1, 'q', 's', 'transient')",
        )
        .run();

      expect(applyMigrationsTo(fixture)).toEqual([15]);

      const insert = (id: string, sequence: number, outcome: string) =>
        fixture
          .prepare(
            "INSERT INTO stage_attempts (id, run_id, stage, stage_instance_key, cycle, sequence_in_cycle, attempt_trigger, provider_id, attempt_number, queued_at, sent_at, outcome, late_result_at) VALUES (?, 'old', 'voice-over', 'old:voice-over', 1, ?, 'automatic', 'p', ?, 'q', 's', ?, NULL)",
          )
          .run(id, sequence, sequence, outcome);
      for (const [index, outcome] of ["timed-out", "superseded", "late-success"].entries()) insert(`n${index}`, index + 2, outcome);
      expect(() => insert("bad", 5, "cancelled")).toThrow(/CHECK constraint failed/); // fifth in the cycle: the cap holds
      expect(() => insert("bad2", 4, "nonsense")).toThrow(/CHECK constraint failed/);
      expect((fixture.prepare("SELECT outcome FROM stage_attempts WHERE id = 'a1'").get() as { outcome: string }).outcome).toBe("transient");
      fixture.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
