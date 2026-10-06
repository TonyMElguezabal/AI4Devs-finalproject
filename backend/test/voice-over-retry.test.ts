import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createRun, getRun, getStageAttempts, insertVoiceOver, resetAll, setRunFailure } from "../src/db.ts";
import { events, pauseSession, toSnapshot } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import { createDecompositionFailure } from "../src/sessionStateMachine.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { retryVoiceOver } from "../src/voiceOverRetry.ts";
import {
  createSilentMp3,
  createStubVoiceProvider,
  setVoiceProviderRegistry,
  type StubVoiceProviderMode,
  type VoiceProvider,
} from "../src/voiceProvider.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import type { SessionSnapshot } from "../src/types.ts";

// retry-voice-over (JOS-155), group 2 — the service checks of design
// Decision 2: the order of the refusals, that a refusal sends nothing, that two
// concurrent calls open one cycle, and the acceptance after an exhausted cycle.

const SCRIPT = "The sun rose slowly over the quiet hills. Birds began to sing.";

let app: FastifyInstance;
const published: SessionSnapshot[] = [];
const onState = (snapshot: SessionSnapshot) => published.push(snapshot);

beforeEach(async () => {
  resetAll();
  published.length = 0;
  events.on("state", onState);
  app = await buildApp();
});

afterEach(async () => {
  events.off("state", onState);
  await app.close();
});

function register(): string {
  const runId = randomUUID();
  createRun(runId, "Retry test", SCRIPT, "en");
  return runId;
}

function useProvider(provider: VoiceProvider, identifier = "stub-voice"): void {
  setVoiceProviderRegistry({ defaultIdentifier: identifier, adapters: { [identifier]: provider } });
}

function useStub(mode: StubVoiceProviderMode) {
  const stub = createStubVoiceProvider(mode);
  useProvider(stub);
  return stub;
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function sendScheduledRetry(runId: string): Promise<void> {
  const scheduled = getStageAttempts(runId, "voice-over").find((attempt) => attempt.outcome === "scheduled");
  if (!scheduled) throw new Error("no retry is scheduled");
  expect(releaseAttempt(scheduled.id, () => new Date(Date.now() + 3_600_000))).toBe("sent");
  await waitFor(() => getStageAttempts(runId, "voice-over").every((attempt) => attempt.outcome !== "in-flight"));
}

/** Drives a session to `failed` in voice-over: a retryable failure after four transient attempts. */
async function failRetryably(runId: string) {
  const stub = useStub("transient-failure");
  await generateVoiceOver(runId);
  for (let attempt = 2; attempt <= 4; attempt++) await sendScheduledRetry(runId);
  expect(stateOf(runId)).toBe("failed");
  return stub;
}

/** Drives a session to `failed` in voice-over with a not-retryable cause. */
async function failNotRetryably(runId: string) {
  const stub = useStub("not-retryable-failure");
  await generateVoiceOver(runId);
  expect(stateOf(runId)).toBe("failed");
  return stub;
}

function stateOf(runId: string): string | undefined {
  return toSnapshot(runId)?.session.state;
}

describe("Refusals send nothing (2.1)", () => {
  it("refuses an unknown session as not found", () => {
    expect(retryVoiceOver(randomUUID())).toEqual({ ok: false, reason: "session-not-found" });
  });

  it("refuses a session that is not failed, with not-failed-in-voice-over", async () => {
    const runId = register();
    const stub = useStub("hang");
    void generateVoiceOver(runId);
    await waitFor(() => stub.calls.length === 1);

    expect(retryVoiceOver(runId)).toEqual({ ok: false, reason: "not-failed-in-voice-over" });

    expect(stub.calls).toHaveLength(1);
    stub.release();
  });

  it("refuses a session that failed in decomposition, with not-failed-in-voice-over", async () => {
    const runId = register();
    const stub = useStub("success");
    await generateVoiceOver(runId);
    await waitFor(() => stateOf(runId) !== "voice-over-generating");
    const callsBefore = stub.calls.length;
    setRunFailure(runId, createDecompositionFailure({ cause: "bad scenes", retryable: true, occurredAt: new Date() }));

    expect(retryVoiceOver(runId)).toEqual({ ok: false, reason: "not-failed-in-voice-over" });
    expect(stub.calls).toHaveLength(callsBefore);
  });

  it("refuses a session that already has its voice-over, with narration-complete", async () => {
    const runId = register();
    const stub = await failRetryably(runId);
    insertVoiceOver({
      runId,
      audioPath: "voice-over.mp3",
      timestampsPath: null,
      durationSeconds: 1,
      sizeBytes: createSilentMp3(1).length,
      nativeTimestampsAvailable: false,
      providerRequestId: "req-1",
      completedAt: new Date().toISOString(),
    });
    const callsBefore = stub.calls.length;

    expect(retryVoiceOver(runId)).toEqual({ ok: false, reason: "narration-complete" });

    expect(stub.calls).toHaveLength(callsBefore);
  });

  it("refuses a not-retryable failure, with not-retryable, and opens no cycle", async () => {
    const runId = register();
    const stub = await failNotRetryably(runId);
    const attemptsBefore = getStageAttempts(runId, "voice-over").length;

    expect(retryVoiceOver(runId)).toEqual({ ok: false, reason: "not-retryable" });

    expect(stub.calls).toHaveLength(1);
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(attemptsBefore);
    expect(stateOf(runId)).toBe("failed");
  });

  it("refuses a second retry with retry-already-pending, and sends nothing for it", async () => {
    const runId = register();
    await failRetryably(runId);
    const stub = useStub("hang");
    pauseSession(runId);

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: true });
    expect(retryVoiceOver(runId)).toEqual({ ok: false, reason: "retry-already-pending" });

    expect(stub.calls).toHaveLength(0);
    expect(getStageAttempts(runId, "voice-over").filter((attempt) => attempt.cycle === 2)).toHaveLength(1);
  });

  it("opens exactly one cycle for two calls made back to back", async () => {
    const runId = register();
    await failRetryably(runId);
    useStub("hang");

    const results = [retryVoiceOver(runId), retryVoiceOver(runId)];

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "retry-already-pending" }]);
    expect(Math.max(...getStageAttempts(runId, "voice-over").map((attempt) => attempt.cycle))).toBe(2);
  });
});

describe("Acceptance (2.2)", () => {
  it("accepts a retry after an exhausted cycle, opens cycle 2 and sends a new attempt", async () => {
    const runId = register();
    await failRetryably(runId);
    const stub = useStub("success");

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: false });

    await waitFor(() => stub.calls.length === 1);
    await waitFor(() => stateOf(runId) === "voice-over-complete");
    const cycleTwo = getStageAttempts(runId, "voice-over").filter((attempt) => attempt.cycle === 2);
    expect(cycleTwo).toHaveLength(1);
    expect(cycleTwo[0]).toMatchObject({ trigger: "manual", sequenceInCycle: 1, outcome: "success" });
    expect(getRun(runId)?.failure).toBeNull();
  });
});
