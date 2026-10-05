import { beforeEach, describe, expect, it } from "vitest";
import { getRun, getStageAttempts, getVoiceOver, resetAll } from "../src/db.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { sweepTimedOutAttempts } from "../src/retry/attemptTimeoutWatcher.ts";
import { startNewCycle } from "../src/retry/stageAttemptRecorder.ts";
import { after, register, sendFirstAttempt, sendScheduledRetry, VOICE_LIMIT_MS, waitFor } from "./voiceTimeoutFixtures.ts";

// stage-execution-time-limit (JOS-185), group 4 — a result that arrives after its attempt timed out is
// accepted once, or discarded, and never completes the stage twice.

beforeEach(() => {
  resetAll();
});

const outcomes = (runId: string) => getStageAttempts(runId, "voice-over").map((attempt) => attempt.outcome);

/** Times attempt 1 out and returns the clock to use afterwards. */
async function startAndTimeOut() {
  const runId = register();
  const sent = await sendFirstAttempt(runId);
  sweepTimedOutAttempts(after(VOICE_LIMIT_MS + 1));
  return { runId, ...sent };
}

/** Exhausts the cycle: four attempts, all timed out, the stage failed. Resolves nothing at the provider. */
async function exhaustCycle() {
  const runId = register();
  const sent = await sendFirstAttempt(runId);
  let clock = after(VOICE_LIMIT_MS + 1);
  for (let retry = 1; retry <= 3; retry++) {
    sweepTimedOutAttempts(clock);
    clock = new Date(clock.getTime() + 3_600_000);
    sendScheduledRetry(runId, clock);
    clock = new Date(clock.getTime() + VOICE_LIMIT_MS + 1);
  }
  sweepTimedOutAttempts(clock);
  expect(getRun(runId)!.failure).toMatchObject({ phase: "voice-over", retryable: true });
  return { runId, ...sent };
}

describe("a late success", () => {
  it("before the retry is sent is accepted and the scheduled retry is cancelled and never sent", async () => {
    const { runId, provider } = await startAndTimeOut();
    const [, retry] = getStageAttempts(runId, "voice-over");
    expect(retry!.outcome).toBe("scheduled");

    provider.answer(1);
    await waitFor(() => getVoiceOver(runId) !== undefined && getVoiceOver(runId) !== null);

    expect(outcomes(runId)).toEqual(["late-success", "cancelled"]);
    expect(releaseAttempt(retry!.id, () => after(3_600_000))).toBe("gone");
    expect(provider.calls).toBe(1); // the retry was never sent
    expect(getVoiceOver(runId)).toBeTruthy();
  });

  it("while the retry is in flight is accepted, and the retry's later success is superseded", async () => {
    const { runId, provider } = await startAndTimeOut();
    sendScheduledRetry(runId, after(3_600_000));
    await waitFor(() => provider.calls === 2);

    provider.answer(1);
    await waitFor(() => outcomes(runId)[0] === "late-success");
    provider.answer(2);
    await waitFor(() => outcomes(runId)[1] === "superseded");

    expect(outcomes(runId)).toEqual(["late-success", "superseded"]);
    expect(getVoiceOver(runId)).toBeTruthy();
  });

  it("after a later attempt already succeeded is superseded and stores nothing new", async () => {
    const { runId, provider } = await startAndTimeOut();
    sendScheduledRetry(runId, after(3_600_000));
    await waitFor(() => provider.calls === 2);
    provider.answer(2);
    await waitFor(() => outcomes(runId)[1] === "success");
    const stored = getVoiceOver(runId);

    provider.answer(1);
    await waitFor(() => outcomes(runId)[0] === "superseded");

    expect(outcomes(runId)).toEqual(["superseded", "success"]);
    expect(getVoiceOver(runId)).toEqual(stored); // the stage completed once
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(2); // nothing was launched again
  });

  it("after the cycle was exhausted, with no manual retry, completes the stage and clears the failure", async () => {
    const { runId, provider } = await exhaustCycle();

    provider.answer(1);
    await waitFor(() => outcomes(runId)[0] === "late-success");

    expect(getVoiceOver(runId)).toBeTruthy();
    expect(getRun(runId)!.failure).toBeNull();
  });

  it("after a manual retry opened a new cycle is superseded", async () => {
    const { runId, provider } = await exhaustCycle();
    expect(startNewCycle({ sessionId: runId, stage: "voice-over" }, { onScheduled: () => {} })).toMatchObject({ started: true });

    provider.answer(1);
    await waitFor(() => outcomes(runId)[0] === "superseded");

    expect(getVoiceOver(runId)).toBeFalsy(); // the new cycle owns the outcome
  });
});

describe("a late failure", () => {
  it("is recorded on its attempt and consumes no budget or retry", async () => {
    const { runId, provider } = await startAndTimeOut();
    const before = getStageAttempts(runId, "voice-over").length;

    provider.answer(1, { kind: "failed_transient", reason: "stub: the provider gave up late" });
    await waitFor(() => getStageAttempts(runId, "voice-over")[0]!.errorMessage?.includes("gave up late") ?? false);

    const attempts = getStageAttempts(runId, "voice-over");
    expect(attempts).toHaveLength(before); // nothing added
    expect(attempts[0]).toMatchObject({ outcome: "timed-out" });
    expect(attempts[1]!.outcome).toBe("scheduled"); // the retry the timeout already scheduled is untouched
    expect(getRun(runId)!.failure).toBeNull();
  });
});
