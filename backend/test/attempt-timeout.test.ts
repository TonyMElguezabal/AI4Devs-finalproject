import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createRun, getRun, getStageAttempt, getStageAttempts, resetAll, startVoiceAttempt } from "../src/db.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { sweepTimedOutAttempts } from "../src/retry/attemptTimeoutWatcher.ts";
import { PER_PHASE_MAX_TIME_SECONDS } from "../src/config/providers.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry } from "../src/voiceProvider.ts";

// stage-execution-time-limit (JOS-185), group 4 — a sent attempt that outlasts its stage's maximum
// time is timed out through the retry policy. Time is injected: nothing here waits for real time.

const SCRIPT = "The sun rose slowly over the quiet hills. Birds began to sing.";
const VOICE_LIMIT_MS = PER_PHASE_MAX_TIME_SECONDS.voice * 1000;
const T0 = new Date("2026-10-05T10:00:00.000Z");
const after = (ms: number) => new Date(T0.getTime() + ms);

beforeEach(() => {
  resetAll();
});

function register(): string {
  const runId = randomUUID();
  createRun(runId, "Timeout test", SCRIPT, "en");
  return runId;
}

function useHangingProvider() {
  const stub = createStubVoiceProvider("hang");
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": stub } });
  return stub;
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Starts the first attempt at T0; the provider never answers until the stub is released. */
async function sendFirstAttempt(runId: string) {
  const stub = useHangingProvider();
  const pending = generateVoiceOver(runId, () => T0);
  await waitFor(() => getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "in-flight"));
  return { stub, pending };
}

/** Claims the scheduled retry as if its due time had come, with the clock at `at`. */
function sendScheduledRetry(runId: string, at: Date): void {
  const scheduled = getStageAttempts(runId, "voice-over").find((attempt) => attempt.outcome === "scheduled");
  if (!scheduled) throw new Error("no retry is scheduled");
  expect(releaseAttempt(scheduled.id, () => at)).toBe("sent");
}

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
    const { stub, pending } = await sendFirstAttempt(runId);
    stub.release();
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
