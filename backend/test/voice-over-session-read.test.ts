import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ulid } from "../src/util/ulid.ts";
import { createRun, getStageAttempts, resetAll } from "../src/db.ts";
import { releaseAttempt } from "../src/retry/retryScheduler.ts";
import { buildApp } from "../src/server.ts";
import { generateVoiceOver } from "../src/voiceOverPhase.ts";
import { createStubVoiceProvider, setVoiceProviderRegistry, type StubVoiceProviderMode } from "../src/voiceProvider.ts";

// generate-voice-over (JOS-136), group 6 — the session read (US-02) exposes the
// voice-over's outcome and the voice-over failure, and offers no MP3 download
// (PRD §12.3).

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

async function sessionAfterVoicePhase(mode: StubVoiceProviderMode): Promise<{ sessionId: string; session: Record<string, unknown> }> {
  setVoiceProviderRegistry({ defaultIdentifier: "stub-voice", adapters: { "stub-voice": createStubVoiceProvider(mode, { audioSeconds: 2 }) } });
  const sessionId = ulid();
  createRun(sessionId, "Read test", "A short script.", "en");
  await generateVoiceOver(sessionId);
  const read = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
  expect(read.statusCode).toBe(200);
  return { sessionId, session: read.json().session };
}

describe("A completed session's representation (6.1)", () => {
  it("carries voiceOver with provider, duration, native-timestamp availability and completion time, and no failure", async () => {
    const { session } = await sessionAfterVoicePhase("success");

    expect(session.state).toBe("voice-over-complete");
    expect(session.voiceOver).toEqual({
      provider: "stub-voice",
      durationSeconds: expect.any(Number),
      nativeTimestampsAvailable: true,
      completedAt: expect.any(String),
    });
    expect((session.voiceOver as { durationSeconds: number }).durationSeconds).toBeGreaterThan(1.9);
    expect(Number.isNaN(Date.parse((session.voiceOver as { completedAt: string }).completedAt))).toBe(false);
    expect(session.failure).toBeUndefined();
  });

  it("reports that native timestamps are not available when the provider returned none", async () => {
    const { session } = await sessionAfterVoicePhase("success-without-timestamps");

    expect((session.voiceOver as { nativeTimestampsAvailable: boolean }).nativeTimestampsAvailable).toBe(false);
  });

  it("never exposes the file paths or the provider request id", async () => {
    const { session } = await sessionAfterVoicePhase("success");

    expect(Object.keys(session.voiceOver as object).sort()).toEqual(["completedAt", "durationSeconds", "nativeTimestampsAvailable", "provider"]);
  });
});

describe("A failed session's representation (6.2)", () => {
  it("carries failure with phase voice-over, cause and retryability, and no voiceOver", async () => {
    const { session } = await sessionAfterVoicePhase("not-retryable-failure");

    expect(session.state).toBe("failed");
    expect(session.failedPhase).toBe("voice-over");
    expect(session.failure).toEqual({
      phase: "voice-over",
      cause: expect.stringContaining("stub: voice provider rejected the input"),
      retryable: false,
      manualRetryAvailable: false,
      cycle: 1,
      attemptsInCycle: 1,
      occurredAt: expect.any(String),
    });
    expect(session.voiceOver).toBeUndefined();
  });

  it("reports no failure while a transient failure is still being retried", async () => {
    const { session } = await sessionAfterVoicePhase("transient-failure");

    expect(session.failure).toBeUndefined();
    expect(session.state).not.toBe("failed");
  });

  it("reports a transient failure as retryable once the retries are exhausted", async () => {
    const { sessionId } = await sessionAfterVoicePhase("transient-failure");
    for (let attempt = 2; attempt <= 4; attempt++) {
      const scheduled = getStageAttempts(sessionId, "voice-over").find((candidate) => candidate.outcome === "scheduled");
      releaseAttempt(scheduled?.id ?? "", () => new Date(Date.now() + 3_600_000));
      for (let waited = 0; getStageAttempts(sessionId, "voice-over").some((candidate) => candidate.outcome === "in-flight") && waited < 200; waited++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    const session = (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json().session;

    expect((session.failure as { retryable: boolean }).retryable).toBe(true);
  });
});

describe("A session before the voice-over exists", () => {
  it("carries neither voiceOver nor failure", async () => {
    const created = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Fresh", script: "Hello.", language: "en" } });

    const session = created.json().session;
    expect(session.voiceOver).toBeUndefined();
    expect(session.failure).toBeUndefined();
  });
});

describe("No download of the MP3 (6.4)", () => {
  it("offers no route that serves the narration", async () => {
    const { sessionId } = await sessionAfterVoicePhase("success");

    expect(app.printRoutes({ commonPrefix: false })).not.toMatch(/voice|narration|audio|mp3/i);
    for (const path of ["voice-over", "voice-over.mp3", "narration", "audio"]) {
      const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}/${path}` });
      expect(res.statusCode).toBe(404);
    }
  });
});
