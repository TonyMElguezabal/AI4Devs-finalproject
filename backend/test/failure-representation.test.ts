import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createRun, getStageAttempts, resetAll } from "../src/db.ts";
import { events } from "../src/orchestrator.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { buildApp } from "../src/server.ts";
import type { SessionSnapshot } from "../src/types.ts";
import { ulid } from "../src/util/ulid.ts";
import { generateVoiceOver, setVoiceOverLogger, type VoiceOverLogEntry } from "../src/voiceOverPhase.ts";
import { createElevenLabsVoiceProvider, createStubVoiceProvider, setVoiceProviderRegistry, type StubVoiceProviderMode, type VoiceProvider } from "../src/voiceProvider.ts";

// bounded-retry-policy (JOS-184), group 6 — what a person and the live updates
// see of a failed stage instance, and what must never appear in it.

let app: FastifyInstance;
const published: SessionSnapshot[] = [];
const logs: VoiceOverLogEntry[] = [];
const warnings: VoiceOverLogEntry[] = [];
const onState = (snapshot: SessionSnapshot) => published.push(snapshot);

beforeEach(async () => {
  resetAll();
  published.length = 0;
  logs.length = 0;
  warnings.length = 0;
  setVoiceOverLogger({ info: (entry) => logs.push(entry), warn: (entry) => warnings.push(entry) });
  events.on("state", onState);
  app = await buildApp();
});

afterEach(async () => {
  events.off("state", onState);
  await app.close();
});

function useProvider(provider: VoiceProvider): void {
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": provider } });
}

async function exhaustedSession(mode: StubVoiceProviderMode | VoiceProvider): Promise<string> {
  useProvider(typeof mode === "string" ? createStubVoiceProvider(mode) : mode);
  const sessionId = ulid();
  createRun(sessionId, "Failure test", "A short script.", "en");
  await generateVoiceOver(sessionId);
  for (let attempt = 2; attempt <= 4; attempt++) {
    const scheduled = getStageAttempts(sessionId, "voice-over").find((candidate) => candidate.outcome === "scheduled");
    if (!scheduled) break;
    releaseAttempt(scheduled.id, () => new Date(Date.now() + 3_600_000));
    for (let waited = 0; getStageAttempts(sessionId, "voice-over").some((candidate) => candidate.outcome === "in-flight") && waited < 200; waited++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  return sessionId;
}

async function readSession(sessionId: string): Promise<Record<string, any>> {
  return (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json().session;
}

describe("A failed stage instance's representation (6.1)", () => {
  it("carries cause, retryable, manualRetryAvailable, cycle and attemptsInCycle once four transient failures exhaust the cycle", async () => {
    const sessionId = await exhaustedSession("transient-failure");

    const session = await readSession(sessionId);

    expect(session.state).toBe("failed");
    expect(session.failure).toEqual({
      phase: "voice-over",
      cause: expect.stringContaining("stub: transient voice provider error"),
      retryable: true,
      manualRetryAvailable: true,
      cycle: 1,
      attemptsInCycle: 4,
      occurredAt: expect.any(String),
    });
  });

  it("offers no manual retry for a not-retryable failure", async () => {
    const sessionId = await exhaustedSession("not-retryable-failure");

    const session = await readSession(sessionId);

    expect(session.failure).toMatchObject({ retryable: false, manualRetryAvailable: false, cycle: 1, attemptsInCycle: 1 });
  });

  it("is carried by the live-update event of the failure, too", async () => {
    await exhaustedSession("transient-failure");

    const failed = published.filter((snapshot) => snapshot.session.state === "failed").at(-1);
    expect(failed?.session.failure).toMatchObject({ retryable: true, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 4 });
  });

  it("shows no failure while retries are still being made", async () => {
    useProvider(createStubVoiceProvider("transient-failure"));
    const sessionId = ulid();
    createRun(sessionId, "Retrying", "A short script.", "en");

    await generateVoiceOver(sessionId);

    expect((await readSession(sessionId)).failure).toBeUndefined();
    expect(published.some((snapshot) => snapshot.session.state === "failed")).toBe(false);
  });
});

describe("What a provider error may put in the cause (6.2)", () => {
  const SECRET = "sk-super-secret-credential-value";
  const RAW_PAYLOAD = "RAW-PROVIDER-PAYLOAD-with-the-script-text";

  it("never reflects a credential or a raw payload, whether the provider answered with an error body or the call threw", async () => {
    const answering = createElevenLabsVoiceProvider({
      loadKey: () => SECRET,
      fetchFn: (async () => new Response(`${RAW_PAYLOAD} ${SECRET}`, { status: 500 })) as unknown as typeof fetch,
    });
    const throwing = createElevenLabsVoiceProvider({
      loadKey: () => SECRET,
      fetchFn: (async () => {
        throw new Error(`connect failed with ${SECRET} ${RAW_PAYLOAD}`);
      }) as unknown as typeof fetch,
    });

    for (const provider of [answering, throwing]) {
      resetAll();
      const sessionId = await exhaustedSession(provider);

      const everythingShown = JSON.stringify([await readSession(sessionId), published, logs, getStageAttempts(sessionId, "voice-over")]);

      expect(everythingShown).not.toContain(SECRET);
      expect(everythingShown).not.toContain(RAW_PAYLOAD);
    }
  });

  it("never reflects a secret in a provider that throws while the adapter is a stand-in", async () => {
    const sessionId = await exhaustedSession({
      synthesize: async () => {
        throw new Error(`boom ${SECRET}`);
      },
    });

    const everythingShown = JSON.stringify([await readSession(sessionId), published, logs, getStageAttempts(sessionId, "voice-over")]);

    expect(everythingShown).not.toContain(SECRET);
  });
});

describe("Attempt logs (6.4)", () => {
  it("log each attempt with its stage instance key, cycle, sequence, trigger, outcome, latency and queue time", async () => {
    const sessionId = await exhaustedSession("transient-failure");

    const finished = logs.filter((entry) => entry.event === "voice-over.attempt.finished");

    expect(finished).toHaveLength(4);
    expect(finished.map((entry) => entry.sequenceInCycle)).toEqual([1, 2, 3, 4]);
    expect(finished[0]).toMatchObject({ stageInstanceKey: `${sessionId}:voice-over`, cycle: 1, trigger: "initial", outcome: "transient", latencyMs: expect.any(Number), queuedMs: expect.any(Number) });
    expect(finished[1]).toMatchObject({ trigger: "automatic" });
    expect(logs.filter((entry) => entry.event === "voice-over.attempt.started")[1]).toMatchObject({ sequenceInCycle: 2, cycle: 1, queuedMs: expect.any(Number) });
  });

  it("log exhaustion at warning level, once, with the cycle's last attempt", async () => {
    await exhaustedSession("transient-failure");

    expect(warnings.map((entry) => entry.event)).toEqual(["voice-over.retries.exhausted"]);
    expect(warnings[0]).toMatchObject({ cycle: 1, sequenceInCycle: 4, outcome: "transient" });
  });

  it("log a not-retryable failure at warning level and nothing at warning level for a retry that is merely scheduled", async () => {
    await exhaustedSession("not-retryable-failure");
    expect(warnings.map((entry) => entry.event)).toEqual(["voice-over.failure.not-retryable"]);

    warnings.length = 0;
    useProvider(createStubVoiceProvider("transient-failure"));
    const sessionId = ulid();
    createRun(sessionId, "One failure", "A short script.", "en");
    await generateVoiceOver(sessionId);
    expect(warnings).toEqual([]);
  });
});
