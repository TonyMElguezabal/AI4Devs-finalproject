import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { claimScheduledAttempt, createRun, getRun, getStageAttempts, recordStageAttempt, resetAll, setRunFailure } from "../src/db.ts";
import type { RetryDelayConfig } from "../src/retry/retryPolicy.ts";
import { recordAttemptOutcome, recordAttemptTimeout, startNewCycle } from "../src/retry/stageAttemptRecorder.ts";
import { createVoiceOverFailure } from "../src/sessionStateMachine.ts";
import type { AttemptStage } from "../src/types.ts";

// bounded-retry-policy (JOS-184), group 4 — the recorder applies the policy to
// a classified outcome in one transaction: it schedules the next attempt, fails
// the stage instance, or ignores an outcome that was already recorded; and a
// manual retry opens a new cycle only on a failed stage instance.

const DELAY: RetryDelayConfig = { baseSeconds: 2, capSeconds: 10 };
const NOW = new Date("2026-10-04T10:00:00.000Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString();

beforeEach(() => {
  resetAll();
});

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "recorder test", "A short script.", "en");
  return runId;
}

function send(runId: string, stage: AttemptStage = "voice-over", sceneId?: string) {
  return recordStageAttempt({ runId, stage, ...(sceneId ? { sceneId } : {}), providerId: "stub-voice", queuedAt: at(0), sentAt: at(0) });
}

const transient = (extra: { retryAfterSeconds?: number } = {}) => ({ outcome: "transient" as const, errorMessage: "stub: 503", ...extra });
const options = { now: () => NOW, delay: DELAY, onScheduled: () => {} };

describe("A transient failure with budget left", () => {
  it("completes the attempt and schedules the next one for the same stage instance, after the delay", () => {
    const runId = newRunId();
    const first = send(runId);

    const result = recordAttemptOutcome(first.id, transient(), options);

    expect(result).toMatchObject({ action: "scheduled", next: { outcome: "scheduled", sequenceInCycle: 2, cycle: 1, trigger: "automatic", stageInstanceKey: first.stageInstanceKey, dueAt: at(2), sentAt: null, providerId: "stub-voice" } });
    const [done, next] = getStageAttempts(runId, "voice-over");
    expect(done).toMatchObject({ outcome: "transient", errorMessage: "stub: 503" });
    expect(next?.outcome).toBe("scheduled");
  });

  it("backs off further after each failure and never before the provider's retry-after", () => {
    const runId = newRunId();
    const first = send(runId);
    const second = (() => {
      const scheduled = recordAttemptOutcome(first.id, transient(), options);
      if (scheduled.action !== "scheduled") throw new Error("expected a scheduled retry");
      return scheduled.next;
    })();
    expect(second.dueAt).toBe(at(2));

    const result = recordAttemptOutcome(claim(second.id), transient({ retryAfterSeconds: 25 }), options);

    expect(result).toMatchObject({ action: "scheduled", next: { sequenceInCycle: 3, dueAt: at(25) } });
  });

  it("leaves the session without a failure, so it stays in progress", () => {
    const runId = newRunId();

    recordAttemptOutcome(send(runId).id, transient(), options);

    expect(getRun(runId)?.failure).toBeNull();
  });
});

function claim(attemptId: string): string {
  if (!claimScheduledAttempt(attemptId, at(5))) throw new Error("could not claim the scheduled attempt");
  return attemptId;
}

function runThroughFailures(runId: string, count: number, stage: AttemptStage = "voice-over", sceneId?: string) {
  let attempt = send(runId, stage, sceneId);
  let result = recordAttemptOutcome(attempt.id, transient(), options);
  for (let n = 2; n <= count; n++) {
    if (result.action !== "scheduled") throw new Error(`no retry scheduled before attempt ${n}`);
    claim(result.next.id);
    result = recordAttemptOutcome(result.next.id, transient(), options);
  }
  return result;
}

describe("Three transient failures followed by a success", () => {
  it("completes the stage instance with no fifth attempt", () => {
    const runId = newRunId();
    const third = runThroughFailures(runId, 3);
    if (third.action !== "scheduled") throw new Error("expected a fourth attempt to be scheduled");
    claim(third.next.id);

    const result = recordAttemptOutcome(third.next.id, { outcome: "success" }, options);

    expect(result).toEqual({ action: "complete" });
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(4);
    expect(getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "scheduled")).toBe(false);
  });
});

describe("An exhausted cycle", () => {
  it("fails retryable with a manual retry available and nothing scheduled after the fourth transient failure", () => {
    const runId = newRunId();

    const result = runThroughFailures(runId, 4);

    expect(result).toEqual({ action: "failed", retryable: true, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 4 });
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(4);
    expect(getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "scheduled")).toBe(false);
  });
});

describe("A not-retryable failure", () => {
  it("fails at once, not retryable, with nothing scheduled", () => {
    const runId = newRunId();

    const result = recordAttemptOutcome(send(runId).id, { outcome: "not-retryable", errorMessage: "stub: rejected" }, options);

    expect(result).toEqual({ action: "failed", retryable: false, manualRetryAvailable: false, cycle: 1, attemptsInCycle: 1 });
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
  });
});

describe("An outcome that was already recorded", () => {
  it("is ignored: a second notification for the same attempt records no further attempt", () => {
    const runId = newRunId();
    const fourth = (() => {
      const third = runThroughFailures(runId, 3);
      if (third.action !== "scheduled") throw new Error("expected a fourth attempt");
      claim(third.next.id);
      return third.next;
    })();

    const first = recordAttemptOutcome(fourth.id, transient(), options);
    const second = recordAttemptOutcome(fourth.id, transient(), options);

    expect(first.action).toBe("failed");
    expect(second).toEqual({ action: "ignored" });
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(4);
  });
});

// stage-execution-time-limit (JOS-185), Decision 2 — a timeout is a transient failure through the same policy.
describe("A timeout", () => {
  it("is recorded timed-out and schedules the next attempt after the same backoff as a transient failure", () => {
    const runId = newRunId();
    const first = send(runId);

    const result = recordAttemptTimeout(first.id, "no result after 10 s", options);

    expect(result.action).toBe("scheduled");
    const [timedOut, next] = getStageAttempts(runId, "voice-over");
    expect(timedOut).toMatchObject({ outcome: "timed-out", errorMessage: "no result after 10 s", finishedAt: NOW.toISOString() });
    expect(next).toMatchObject({ outcome: "scheduled", sequenceInCycle: 2, trigger: "automatic", dueAt: at(2) });
  });

  it("fails retryable, with a manual retry available and nothing scheduled, on the fourth attempt of the cycle", () => {
    const runId = newRunId();
    let last = send(runId);
    for (let attempt = 1; attempt < 4; attempt++) {
      recordAttemptTimeout(last.id, "no result", options);
      const scheduled = getStageAttempts(runId, "voice-over").find((candidate) => candidate.outcome === "scheduled")!;
      expect(claimScheduledAttempt(scheduled.id, at(attempt * 100))).toBe(true);
      last = scheduled;
    }

    expect(recordAttemptTimeout(last.id, "no result", options)).toEqual({ action: "failed", retryable: true, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 4 });
    expect(getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "scheduled")).toBe(false);
  });

  it("is ignored when the attempt already has an outcome, and records nothing", () => {
    const runId = newRunId();
    const first = send(runId);
    recordAttemptOutcome(first.id, { outcome: "success" }, options);

    expect(recordAttemptTimeout(first.id, "no result", options)).toEqual({ action: "ignored" });

    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
    expect(getStageAttempts(runId, "voice-over")[0]!.outcome).toBe("success");
  });

  it("is ignored for an attempt that does not exist", () => {
    expect(recordAttemptTimeout(randomUUID(), "no result", options)).toEqual({ action: "ignored" });
  });

  it("makes a result reported afterwards ignored, so the attempt is never recorded twice", () => {
    const runId = newRunId();
    const first = send(runId);
    recordAttemptTimeout(first.id, "no result", options);

    expect(recordAttemptOutcome(first.id, { outcome: "success" }, options)).toEqual({ action: "ignored" });

    expect(getStageAttempts(runId, "voice-over")).toHaveLength(2); // the timed-out attempt and its scheduled retry
  });

  it("leaves a stage instance a manual retry can start from after the cycle ends in timeouts", () => {
    const runId = newRunId();
    let last = send(runId);
    for (let attempt = 1; attempt < 4; attempt++) {
      recordAttemptTimeout(last.id, "no result", options);
      last = getStageAttempts(runId, "voice-over").find((candidate) => candidate.outcome === "scheduled")!;
      claimScheduledAttempt(last.id, at(attempt * 100));
    }
    recordAttemptTimeout(last.id, "no result", options);

    expect(startNewCycle({ sessionId: runId, stage: "voice-over" }, options)).toMatchObject({ started: true });
  });
});

describe("Stage instances are budgeted separately", () => {
  it("counts two scenes failing at the same stage against their own budgets", () => {
    const runId = newRunId();
    const sceneOne = runThroughFailures(runId, 4, "image", "scene-1");

    const sceneTwoFirst = send(runId, "image", "scene-2");
    const sceneTwo = recordAttemptOutcome(sceneTwoFirst.id, transient(), options);

    expect(sceneOne).toMatchObject({ action: "failed", attemptsInCycle: 4 });
    expect(sceneTwoFirst.sequenceInCycle).toBe(1);
    expect(sceneTwo).toMatchObject({ action: "scheduled", next: { sequenceInCycle: 2 } });
  });

  it("gives a scene's video stage a full budget of its own after its image stage was exhausted", () => {
    const runId = newRunId();
    runThroughFailures(runId, 4, "image", "scene-1");

    expect(send(runId, "video", "scene-1").sequenceInCycle).toBe(1);
  });
});

describe("startNewCycle (Decision 7)", () => {
  function failedSession(): { runId: string } {
    const runId = newRunId();
    runThroughFailures(runId, 4);
    setRunFailure(runId, createVoiceOverFailure({ cause: "the provider kept failing", retryable: true, occurredAt: NOW, cycle: 1, attemptsInCycle: 4 }));
    return { runId };
  }

  it("opens cycle 2 on a failed stage instance, due now, keeps cycle 1's attempts, and ends the failure", () => {
    const { runId } = failedSession();

    const result = startNewCycle({ sessionId: runId, stage: "voice-over" }, options);

    expect(result).toMatchObject({ started: true, attempt: { cycle: 2, sequenceInCycle: 1, trigger: "manual", outcome: "scheduled", dueAt: at(0) } });
    expect(getRun(runId)?.failure).toBeNull();
    expect(getStageAttempts(runId, "voice-over").filter((attempt) => attempt.cycle === 1)).toHaveLength(4);
  });

  it("allows four attempts in the new cycle, then fails it again", () => {
    const { runId } = failedSession();
    const started = startNewCycle({ sessionId: runId, stage: "voice-over" }, options);
    if (!started.started) throw new Error("expected a new cycle");
    claim(started.attempt.id);
    let result = recordAttemptOutcome(started.attempt.id, transient(), options);
    for (let n = 2; n <= 4; n++) {
      if (result.action !== "scheduled") throw new Error("expected another retry");
      claim(result.next.id);
      result = recordAttemptOutcome(result.next.id, transient(), options);
    }

    expect(result).toEqual({ action: "failed", retryable: true, manualRetryAvailable: true, cycle: 2, attemptsInCycle: 4 });
  });

  it("does nothing for a stage instance that has not failed", () => {
    const runId = newRunId();
    send(runId);

    expect(startNewCycle({ sessionId: runId, stage: "voice-over" }, options)).toEqual({ started: false, reason: "not-failed" });
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
  });

  it("does nothing for a stage instance that was never attempted", () => {
    expect(startNewCycle({ sessionId: newRunId(), stage: "voice-over" }, options)).toEqual({ started: false, reason: "not-failed" });
  });

  it("refuses a stage instance whose failure is not retryable", () => {
    const runId = newRunId();
    recordAttemptOutcome(send(runId).id, { outcome: "not-retryable", errorMessage: "rejected" }, options);

    expect(startNewCycle({ sessionId: runId, stage: "voice-over" }, options)).toEqual({ started: false, reason: "not-retryable" });
  });

  it("reopens only the failed stage instance, leaving another scene's attempts alone", () => {
    const runId = newRunId();
    runThroughFailures(runId, 4, "image", "scene-1");
    const other = recordAttemptOutcome(send(runId, "image", "scene-2").id, { outcome: "success" }, options);

    const result = startNewCycle({ sessionId: runId, sceneId: "scene-1", stage: "image" }, options);

    expect(other).toEqual({ action: "complete" });
    expect(result).toMatchObject({ started: true, attempt: { cycle: 2, stageInstanceKey: `${runId}:scene-1:image` } });
    expect(getStageAttempts(runId, "image").filter((attempt) => attempt.stageInstanceKey === `${runId}:scene-2:image`)).toHaveLength(1);
  });
});
