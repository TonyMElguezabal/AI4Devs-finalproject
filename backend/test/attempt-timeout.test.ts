import { beforeEach, describe, expect, it } from "vitest";
import { getRun, getStageAttempt, getStageAttempts, resetAll, startVoiceAttempt } from "../src/db.ts";
import { continueSession, pauseSession } from "../src/orchestrator.ts";
import { setVoiceOverLogger, type VoiceOverLogEntry } from "../src/voiceOverPhase.ts";
import { startAttemptTimeoutWatcher, sweepTimedOutAttempts } from "../src/retry/attemptTimeoutWatcher.ts";
import { after, createGatedVoiceProvider, register, sendFirstAttempt, sendScheduledRetry, T0, useProvider, VOICE_LIMIT_MS, waitFor } from "./voiceTimeoutFixtures.ts";

// stage-execution-time-limit (JOS-185), group 4 — a sent attempt that outlasts its stage's maximum
// time is timed out through the retry policy. Time is injected: nothing here waits for real time.

beforeEach(() => {
  resetAll();
});

describe("a sent attempt that never answers", () => {
  it("is recorded timed-out after the stage's maximum time, and the retry policy schedules the next attempt", async () => {
    const runId = register();
    await sendFirstAttempt(runId);

    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS - 1))).toBe(0); // inside the limit: untouched
    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS + 1))).toBe(1);

    const [first, second] = getStageAttempts(runId, "voice-over");
    expect(first).toMatchObject({ outcome: "timed-out", sequenceInCycle: 1 });
    expect(second).toMatchObject({ outcome: "scheduled", sequenceInCycle: 2, trigger: "automatic" });
    expect(getRun(runId)!.failure).toBeNull(); // still in progress: no new user-visible state
  });

  it("is not timed out twice by a second sweep", async () => {
    const runId = register();
    await sendFirstAttempt(runId);

    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS + 1))).toBe(1);
    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS + 2))).toBe(0);

    expect(getStageAttempts(runId, "voice-over")).toHaveLength(2); // one timed-out, one scheduled; no extra retry
  });

  it("fails the stage, retryable, when the fourth attempt of the cycle times out", async () => {
    const runId = register();
    await sendFirstAttempt(runId);
    let clock = after(VOICE_LIMIT_MS + 1);
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(sweepTimedOutAttempts(clock)).toBe(1);
      clock = new Date(clock.getTime() + 3_600_000);
      sendScheduledRetry(runId, clock);
      clock = new Date(clock.getTime() + VOICE_LIMIT_MS + 1);
    }

    expect(sweepTimedOutAttempts(clock)).toBe(1); // the fourth

    expect(getStageAttempts(runId, "voice-over").map((attempt) => attempt.outcome)).toEqual(["timed-out", "timed-out", "timed-out", "timed-out"]);
    expect(getRun(runId)!.failure).toMatchObject({ phase: "voice-over", retryable: true, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 4 });
    expect(getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "scheduled")).toBe(false);
  });

  it("is a failed stage a manual retry can start from (a timed-out attempt counts as a failure)", async () => {
    const runId = register();
    await sendFirstAttempt(runId);
    let clock = after(VOICE_LIMIT_MS + 1);
    for (let attempt = 1; attempt <= 3; attempt++) {
      sweepTimedOutAttempts(clock);
      clock = new Date(clock.getTime() + 3_600_000);
      sendScheduledRetry(runId, clock);
      clock = new Date(clock.getTime() + VOICE_LIMIT_MS + 1);
    }
    sweepTimedOutAttempts(clock);

    const { startNewCycle } = await import("../src/retry/stageAttemptRecorder.ts");
    const started = startNewCycle({ sessionId: runId, stage: "voice-over" }, { onScheduled: () => {} });

    expect(started).toMatchObject({ started: true });
  });
});

describe("a result and a timeout racing on the same attempt", () => {
  it("leave exactly one outcome: a result that already arrived is never timed out", async () => {
    const runId = register();
    const { provider, pending } = await sendFirstAttempt(runId);
    provider.answer(1);
    await pending;
    expect(getStageAttempts(runId, "voice-over")[0]!.outcome).toBe("success");

    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS * 10))).toBe(0);

    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
    expect(getStageAttempts(runId, "voice-over")[0]!.outcome).toBe("success");
  });
});

describe("the clock survives a restart", () => {
  it("times an attempt out at its recorded send time plus the maximum time, not from the restart", () => {
    const runId = register();
    const attempt = startVoiceAttempt({ runId, providerId: "stub-voice", queuedAt: T0.toISOString(), sentAt: T0.toISOString() });

    // The process "restarts" here: no in-memory state exists, only the stored attempt.
    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS - 1))).toBe(0);
    expect(getStageAttempt(attempt.id)!.outcome).toBe("in-flight");
    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS + 1))).toBe(1);
    expect(getStageAttempt(attempt.id)!.outcome).toBe("timed-out");
  });

  it("times out promptly an attempt whose limit passed while the application was down", () => {
    const runId = register();
    const attempt = startVoiceAttempt({ runId, providerId: "stub-voice", queuedAt: T0.toISOString(), sentAt: T0.toISOString() });

    expect(sweepTimedOutAttempts(after(3 * 3_600_000))).toBe(1); // three hours later, at startup

    expect(getStageAttempt(attempt.id)!.outcome).toBe("timed-out");
  });
});

describe("an attempt held by a pause", () => {
  it("starts its clock when it is sent after the User continues, not when it was held", async () => {
    const runId = register();
    useProvider(createGatedVoiceProvider());
    pauseSession(runId);

    // Held for far longer than the maximum time: no attempt exists, so there is nothing to time out.
    expect(sweepTimedOutAttempts(new Date(Date.now() + 10 * VOICE_LIMIT_MS))).toBe(0);
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(0);

    continueSession(runId);
    await waitFor(() => getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "in-flight"));
    const sentAt = Date.parse(getStageAttempts(runId, "voice-over")[0]!.sentAt!);

    expect(sweepTimedOutAttempts(new Date(sentAt + VOICE_LIMIT_MS - 1))).toBe(0);
    expect(sweepTimedOutAttempts(new Date(sentAt + VOICE_LIMIT_MS + 1))).toBe(1);
  });
});

describe("the watcher at startup", () => {
  it("sweeps once immediately, so an attempt whose limit passed while the application was down is timed out", () => {
    const runId = register();
    const attempt = startVoiceAttempt({ runId, providerId: "stub-voice", queuedAt: "2020-01-01T00:00:00.000Z", sentAt: "2020-01-01T00:00:00.000Z" });

    const stop = startAttemptTimeoutWatcher(60_000);
    stop();

    expect(getStageAttempt(attempt.id)!.outcome).toBe("timed-out");
  });

  it("keeps sweeping on its interval until stopped", async () => {
    const runId = register();
    const stop = startAttemptTimeoutWatcher(10);
    const attempt = startVoiceAttempt({ runId, providerId: "stub-voice", queuedAt: "2020-01-01T00:00:00.000Z", sentAt: "2020-01-01T00:00:00.000Z" });

    await waitFor(() => getStageAttempt(attempt.id)!.outcome === "timed-out");
    stop();
  });
});

describe("logging", () => {
  it("logs a timeout and a late result with the attempt's identity, send time, elapsed time and outcome", async () => {
    const entries: VoiceOverLogEntry[] = [];
    setVoiceOverLogger({ info: (entry) => entries.push(entry), warn: (entry) => entries.push(entry) });
    const runId = register();
    const { provider } = await sendFirstAttempt(runId);

    sweepTimedOutAttempts(after(VOICE_LIMIT_MS + 1));
    provider.answer(1, { kind: "failed_transient", reason: "stub: gave up late" });
    await waitFor(() => entries.some((entry) => entry.event === "voice-over.attempt.late-result"));

    const timeout = entries.find((entry) => entry.event === "voice-over.attempt.timed-out")!;
    expect(timeout).toMatchObject({ outcome: "timed-out", cycle: 1, sequenceInCycle: 1, sentAt: T0.toISOString(), latencyMs: VOICE_LIMIT_MS + 1 });
    expect(timeout.stageInstanceKey).toMatch(/voice-over$/);
    const late = entries.find((entry) => entry.event === "voice-over.attempt.late-result")!;
    expect(late).toMatchObject({ outcome: "late-failure", cycle: 1, sequenceInCycle: 1, sentAt: T0.toISOString() });
    setVoiceOverLogger({ info: () => {}, warn: () => {} });
  });
});
