import { beforeEach, describe, expect, it } from "vitest";
import * as concurrency from "../src/concurrency.ts";
import { getRun, getStageAttempts, resetAll } from "../src/db.ts";
import { toSnapshot } from "../src/orchestrator.ts";
import { sweepTimedOutAttempts } from "../src/retry/attemptTimeoutWatcher.ts";
import { releaseAttempt, resetScheduler } from "../src/retry/retryScheduler.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { simulateRestart } from "./restartHelpers.ts";
import { after, createGatedVoiceProvider, register, sendFirstAttempt, T0, useProvider, VOICE_LIMIT_MS, waitFor } from "./voiceTimeoutFixtures.ts";

// limit-provider-requests-per-stage (JOS-167), group 5 — waiting is neither
// execution time, nor an attempt, nor a failure (spec "Waiting is neither...").

beforeEach(() => {
  resetAll();
  resetScheduler();
  concurrency.resetAll();
  concurrency.setLimit("voice", 1);
});

const outcomes = (runId: string) => getStageAttempts(runId, "voice-over").map((attempt) => attempt.outcome);

describe("A voice-over waiting for its slot", () => {
  it("is a success, not timed-out, when it waits longer than the maximum time and then returns in time (5.1, 5.2)", async () => {
    const provider = createGatedVoiceProvider();
    useProvider(provider);
    concurrency.acquire("voice", "another-session", () => undefined);
    const runId = register();
    const times = [T0, after(VOICE_LIMIT_MS * 3)];
    const clock = () => times[Math.min(clockReads++, times.length - 1)]!;
    let clockReads = 0;

    const pending = generateVoiceOver(runId, clock);
    await waitFor(() => getStageAttempts(runId, "voice-over").length === 1);
    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS * 3))).toBe(0); // a scheduled attempt has no clock
    expect(outcomes(runId)).toEqual(["scheduled"]);

    concurrency.release("voice", "another-session");
    await waitFor(() => provider.calls === 1);
    provider.answer(1);
    await pending;

    const [attempt, ...rest] = getStageAttempts(runId, "voice-over");
    expect(rest).toEqual([]); // waiting used no attempt of the cycle
    expect(attempt).toMatchObject({ outcome: "success", queuedAt: T0.toISOString(), sentAt: after(VOICE_LIMIT_MS * 3).toISOString() });
    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS * 3 + 1000))).toBe(0);
  });
});

describe("A timed-out voice attempt (5.3)", () => {
  it("keeps its slot until its call returns, and the retry it scheduled waits for that slot", async () => {
    const runId = register();
    const { provider } = await sendFirstAttempt(runId);
    expect(sweepTimedOutAttempts(after(VOICE_LIMIT_MS + 1))).toBe(1);
    expect(outcomes(runId)).toEqual(["timed-out", "scheduled"]);
    expect(concurrency.stats("voice")).toMatchObject({ inFlight: 1 });

    const retry = getStageAttempts(runId, "voice-over")[1]!;
    expect(releaseAttempt(retry.id, () => after(3_600_000))).toBe("waiting");
    expect(provider.calls).toBe(1);

    provider.answer(1, { kind: "failed_transient", reason: "late failure" }); // the original call finally returns
    await waitFor(() => provider.calls === 2);
    expect(concurrency.stats("voice")).toMatchObject({ inFlight: 1, queued: 0 });
    expect(getStageAttempts(runId, "voice-over")[1]).toMatchObject({ outcome: "in-flight" });
  });
});

describe("A restart while an attempt waits (5.4)", () => {
  it("leaves it scheduled with no failed attempt, and sends it once a slot is free", async () => {
    const provider = createGatedVoiceProvider();
    useProvider(provider);
    concurrency.acquire("voice", "another-session", () => undefined);
    const runId = register();
    void generateVoiceOver(runId);
    await waitFor(() => outcomes(runId).length === 1);

    simulateRestart(); // the process loses its queue and its slots; the store keeps the attempt
    await waitFor(() => provider.calls === 1);

    expect(getStageAttempts(runId, "voice-over").filter((attempt) => attempt.outcome === "transient")).toEqual([]);
    expect(outcomes(runId)).toEqual(["in-flight"]);
    expect(getRun(runId)?.failure).toBeNull();
  });
});

describe("A session whose voice-over waits for a slot (5.5)", () => {
  it("has no failure and is not shown as failed", async () => {
    useProvider(createGatedVoiceProvider());
    concurrency.acquire("voice", "another-session", () => undefined);
    const runId = register();
    void generateVoiceOver(runId);
    await waitFor(() => outcomes(runId).length === 1);

    expect(getRun(runId)?.failure).toBeNull();
    expect(toSnapshot(runId)?.session.state).not.toBe("failed");
  });
});
