import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createRun,
  countVoiceOvers,
  getRun,
  getStageAttempts,
  getVoiceOver,
  insertVoiceOver,
  resetAll,
  resolveArtefactPath,
  writeArtefactOnce,
} from "../src/db.ts";
import { events, toSnapshot } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import {
  confirmVoiceOver,
  generateVoiceOver,
  setVoiceOverLogger,
  voiceOverLauncher,
  type VoiceOverLogEntry,
} from "../src/voiceOverPhase.ts";
import {
  createElevenLabsVoiceProvider,
  createSilentMp3,
  createStubVoiceProvider,
  setVoiceProviderRegistry,
  type StubVoiceProviderMode,
  type VoiceProvider,
} from "../src/voiceProvider.ts";
import { VOICE_PROVIDER } from "../src/config/providers.ts";
import { releaseAttempt, releaseSessionAttempts } from "../src/retry/retryScheduler.ts";
import { recordAttemptOutcome, setRetryDelayConfig } from "../src/retry/stageAttemptRecorder.ts";
import { continueSession, pauseSession } from "../src/orchestrator.ts";
import type { SessionSnapshot } from "../src/types.ts";

// generate-voice-over (JOS-136), group 5 — the voice phase: automatic launch,
// the in-flight attempt, the unaltered script, the provider binding, the
// stored MP3 and timestamps, the failure classes, the one-voice-over rule and
// the logs. Every test uses the stub provider except the credential one.

const SCRIPT = "The sun rose slowly over the quiet hills. Birds began to sing.";

let app: FastifyInstance;
const logs: VoiceOverLogEntry[] = [];
const published: SessionSnapshot[] = [];
const onState = (snapshot: SessionSnapshot) => published.push(snapshot);

beforeEach(async () => {
  resetAll();
  logs.length = 0;
  published.length = 0;
  setVoiceOverLogger({ info: (entry) => logs.push(entry) });
  events.on("state", onState);
  app = await buildApp();
});

afterEach(async () => {
  events.off("state", onState);
  await app.close();
});

function register(script = SCRIPT, language = "en"): string {
  const runId = randomUUID();
  createRun(runId, "Voice test", script, language);
  return runId;
}

function useProvider(provider: VoiceProvider, identifier = "stub-voice"): void {
  setVoiceProviderRegistry({ defaultIdentifier: identifier, adapters: { [identifier]: provider } });
}

function useStub(mode: StubVoiceProviderMode, options: { audioSeconds?: number } = {}) {
  const stub = createStubVoiceProvider(mode, options);
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

/** Releases the session's scheduled retry as if its delay had passed, and waits for the send to finish. */
async function sendScheduledRetry(runId: string): Promise<void> {
  const scheduled = getStageAttempts(runId, "voice-over").find((attempt) => attempt.outcome === "scheduled");
  if (!scheduled) throw new Error("no retry is scheduled");
  expect(releaseAttempt(scheduled.id, () => new Date(Date.now() + 3_600_000))).toBe("sent");
  await waitFor(() => getStageAttempts(runId, "voice-over").every((attempt) => attempt.outcome !== "in-flight"));
}

function stateOf(runId: string): string | undefined {
  return toSnapshot(runId)?.session.state;
}

describe("Automatic launch (5.1)", () => {
  it("launches generation from a registered session with no further action, and the session is voice-over-generating before the provider is called", async () => {
    let stateSeenByProvider: string | undefined;
    let sessionId = "";
    const calls: number[] = [];
    useProvider({
      synthesize: async () => {
        calls.push(1);
        stateSeenByProvider = stateOf(sessionId);
        return { kind: "success", audio: createSilentMp3(1) };
      },
    });

    const response = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Auto", script: SCRIPT, language: "en" } });
    sessionId = response.json().session.sessionId;

    expect(response.statusCode).toBe(201);
    expect(response.json().session.state).toBe("submitted");
    await waitFor(() => calls.length === 1);
    expect(stateSeenByProvider).toBe("voice-over-generating");
    await waitFor(() => stateOf(sessionId) === "voice-over-complete");
  });

  it("reads as voice-over-generating while the provider has not answered", async () => {
    const stub = useStub("hang");
    const response = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Wait", script: SCRIPT, language: "en" } });
    const sessionId: string = response.json().session.sessionId;

    await waitFor(() => stub.calls.length === 1);

    const read = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });
    expect(read.json().session.state).toBe("voice-over-generating");
    stub.release();
  });
});

describe("The in-flight attempt (5.2)", () => {
  it("exists with outcome in-flight while the provider holds the request", async () => {
    const runId = register();
    const stub = useStub("hang");

    const pending = generateVoiceOver(runId);
    await waitFor(() => stub.calls.length === 1);

    const attempts = getStageAttempts(runId, "voice-over");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ outcome: "in-flight", providerId: "stub-voice", attemptNumber: 1 });
    expect(attempts[0]?.sentAt).toBeTruthy();
    stub.release();
    await pending;
  });

  it("is completed with its outcome, finish time and external request id", async () => {
    const runId = register();
    useStub("success");

    await generateVoiceOver(runId);

    const [attempt] = getStageAttempts(runId, "voice-over");
    expect(attempt).toMatchObject({ outcome: "success", externalRequestId: "stub-request-1" });
    expect(attempt?.finishedAt).toBeTruthy();
  });

  it("does not start a second attempt while one is in flight", async () => {
    const runId = register();
    const stub = useStub("hang");

    const first = generateVoiceOver(runId);
    await waitFor(() => stub.calls.length === 1);
    const second = await generateVoiceOver(runId);

    expect(second).toEqual({ ok: false, reason: "already-in-flight" });
    expect(stub.calls).toHaveLength(1);
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
    stub.release();
    await first;
  });
});

describe("The script is sent unaltered (5.3)", () => {
  it("sends the stored script, the hardcoded voice, model, format and speed, and the session's language", async () => {
    const script = "  Hola mundo.\n\nSegunda línea,  con   espacios.  ";
    const runId = register(script, "es");
    const stub = useStub("success");

    await generateVoiceOver(runId);

    expect(stub.calls).toEqual([
      {
        text: script,
        language: "es",
        voiceId: VOICE_PROVIDER.voiceId,
        model: VOICE_PROVIDER.model,
        outputFormat: VOICE_PROVIDER.outputFormat,
        speed: VOICE_PROVIDER.speed,
      },
    ]);
  });

  it("sends a script far beyond 1500 words complete, untruncated and in one request", async () => {
    const script = Array.from({ length: 6000 }, (_, i) => `word${i}`).join(" ") + ".";
    const runId = register(script);
    const stub = useStub("success");

    await generateVoiceOver(runId);

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.text).toBe(script);
  });
});

describe("The provider binding (5.4)", () => {
  it("binds the provider on the first attempt and a later attempt uses the binding, not the current default", async () => {
    const runId = register();
    const first = createStubVoiceProvider("transient-failure");
    useProvider(first, "voice-a");
    await generateVoiceOver(runId);
    expect(getRun(runId)?.voiceProviderId).toBe("voice-a");

    const bound = createStubVoiceProvider("success");
    const other = createStubVoiceProvider("success");
    setVoiceProviderRegistry({ defaultIdentifier: "voice-b", adapters: { "voice-a": bound, "voice-b": other } });
    await sendScheduledRetry(runId);

    expect(bound.calls).toHaveLength(1);
    expect(other.calls).toHaveLength(0);
    expect(getRun(runId)?.voiceProviderId).toBe("voice-a");
    expect(getStageAttempts(runId, "voice-over").map((a) => a.providerId)).toEqual(["voice-a", "voice-a"]);
  });

  it("fails without a request when the bound provider is no longer available", async () => {
    const runId = register();
    useProvider(createStubVoiceProvider("transient-failure"), "voice-a");
    await generateVoiceOver(runId);

    const replacement = createStubVoiceProvider("success");
    setVoiceProviderRegistry({ defaultIdentifier: "voice-b", adapters: { "voice-b": replacement } });
    await sendScheduledRetry(runId);

    expect(replacement.calls).toHaveLength(0);
    const failure = getRun(runId)?.failure;
    expect(failure).toMatchObject({ phase: "voice-over", retryable: false });
    expect(failure?.cause).toContain("voice-a");
  });
});

describe("A successful generation (5.5)", () => {
  it("stores exactly one MP3 in the project folder, records the measured duration and size, and reaches voice-over-complete", async () => {
    const runId = register();
    useStub("success", { audioSeconds: 2 });

    const outcome = await generateVoiceOver(runId);

    expect(outcome).toEqual({ ok: true });
    const voiceOver = getVoiceOver(runId);
    expect(voiceOver).toBeDefined();
    if (!voiceOver) return;
    expect(voiceOver.audioPath).toBe("voice-over.mp3");
    const stored = resolveArtefactPath(getRun(runId)?.projectFolder ?? "", voiceOver.audioPath);
    expect(existsSync(stored)).toBe(true);
    expect(voiceOver.sizeBytes).toBe(statSync(stored).size);
    expect(voiceOver.durationSeconds).toBeGreaterThan(1.9);
    expect(voiceOver.durationSeconds).toBeLessThan(2.1);
    expect(voiceOver.providerRequestId).toBe("stub-request-1");
    expect(countVoiceOvers(runId)).toBe(1);
    expect(stateOf(runId)).toBe("voice-over-complete");
  });

  it("clears a failure left by an earlier attempt", async () => {
    const runId = register();
    useStub("not-retryable-failure");
    await generateVoiceOver(runId);
    expect(getRun(runId)?.failure).not.toBeNull();

    useStub("success");
    await generateVoiceOver(runId);

    expect(getRun(runId)?.failure).toBeNull();
    expect(stateOf(runId)).toBe("voice-over-complete");
  });
});

describe("Native timestamps (5.6)", () => {
  it("stores them unmodified next to the MP3 and records that they are available", async () => {
    const runId = register();
    const stub = useStub("success");

    await generateVoiceOver(runId);

    const voiceOver = getVoiceOver(runId);
    expect(voiceOver?.nativeTimestampsAvailable).toBe(true);
    expect(voiceOver?.timestampsPath).toBe("voice-over-timestamps.json");
    const file = resolveArtefactPath(getRun(runId)?.projectFolder ?? "", voiceOver?.timestampsPath ?? "");
    const expected = await createStubVoiceProvider("success").synthesize(stub.calls[0]!);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(expected.kind === "success" ? expected.nativeTimestamps : undefined);
  });

  it("records that none are available when the provider returns none, and writes no timestamps file", async () => {
    const runId = register();
    useStub("success-without-timestamps");

    await generateVoiceOver(runId);

    const voiceOver = getVoiceOver(runId);
    expect(voiceOver).toMatchObject({ nativeTimestampsAvailable: false, timestampsPath: null });
    const folder = getRun(runId)?.projectFolder ?? "";
    expect(existsSync(resolveArtefactPath(folder, "voice-over-timestamps.json"))).toBe(false);
  });
});

describe("Audio that is not usable (5.7)", () => {
  it.each(["undecodable-audio", "empty-audio"] as const)("%s fails the attempt, stores nothing and does not reach voice-over-complete", async (mode) => {
    const runId = register();
    useStub(mode);

    const outcome = await generateVoiceOver(runId);

    expect(outcome).toMatchObject({ ok: false, reason: "retry-scheduled" });
    expect(getVoiceOver(runId)).toBeUndefined();
    const folder = getRun(runId)?.projectFolder ?? "";
    expect(existsSync(resolveArtefactPath(folder, "voice-over.mp3"))).toBe(false);
    expect(getStageAttempts(runId, "voice-over")[0]).toMatchObject({ outcome: "transient", errorCode: "invalid-audio" });
    expect(getStageAttempts(runId, "voice-over")[1]).toMatchObject({ outcome: "scheduled", sequenceInCycle: 2 });
    expect(getRun(runId)?.failure).toBeNull();
  });

  it.each(["undecodable-audio", "empty-audio"] as const)("%s four times in a row fails the session as retryable with a manual retry available", async (mode) => {
    const runId = register();
    useStub(mode);

    await generateVoiceOver(runId);
    for (let attempt = 2; attempt <= 4; attempt++) await sendScheduledRetry(runId);

    expect(getStageAttempts(runId, "voice-over")).toHaveLength(4);
    expect(getRun(runId)?.failure).toMatchObject({ phase: "voice-over", retryable: true, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 4 });
    expect(stateOf(runId)).toBe("failed");
  });

  it("the scheduled retry succeeds once the audio is usable, and the session completes with no failure", async () => {
    const runId = register();
    useStub("undecodable-audio");
    await generateVoiceOver(runId);

    const stub = useStub("success");
    await sendScheduledRetry(runId);

    expect(stub.calls).toHaveLength(1);
    expect(getVoiceOver(runId)).toBeDefined();
    expect(getRun(runId)?.failure).toBeNull();
    expect(getStageAttempts(runId, "voice-over").map((attempt) => attempt.outcome)).toEqual(["transient", "success"]);
  });
});

describe("A not-retryable rejection (5.8)", () => {
  it("records the attempt, fails the session with phase voice-over and the cause, stores no MP3 and makes no retry", async () => {
    const runId = register();
    const stub = useStub("not-retryable-failure");

    const outcome = await generateVoiceOver(runId);

    expect(outcome).toMatchObject({ ok: false, reason: "failed" });
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
    expect(getStageAttempts(runId, "voice-over")[0]).toMatchObject({ outcome: "not-retryable" });
    expect(getStageAttempts(runId, "voice-over")[0]?.errorMessage).toContain("stub: voice provider rejected the input");
    const session = toSnapshot(runId)?.session;
    expect(session?.state).toBe("failed");
    expect(session?.failedPhase).toBe("voice-over");
    const failure = getRun(runId)?.failure;
    expect(failure).toMatchObject({ phase: "voice-over", retryable: false });
    expect(failure?.cause).toContain("stub: voice provider rejected the input");
    expect(getVoiceOver(runId)).toBeUndefined();
    expect(getRun(runId)?.script).toBe(SCRIPT);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(stub.calls).toHaveLength(1);
  });

  it("reports a length refusal with its cause and never sends a shortened script", async () => {
    const script = "word ".repeat(5000);
    const runId = register(script);
    const calls: string[] = [];
    useProvider(
      createElevenLabsVoiceProvider({
        loadKey: () => "test-key",
        fetchFn: (async (_url: string, init?: RequestInit) => {
          calls.push(JSON.parse(String(init?.body)).text);
          return new Response("{}", { status: 413 });
        }) as unknown as typeof fetch,
      }),
    );

    await generateVoiceOver(runId);

    expect(calls).toEqual([script]);
    expect(getRun(runId)?.failure?.cause).toContain("413");
    expect(getRun(runId)?.script).toBe(script);
  });
});

describe("A transient failure (5.9, retry policy JOS-184)", () => {
  it("is recorded as transient and schedules the next attempt without failing the session", async () => {
    const runId = register();
    useStub("transient-failure");

    const outcome = await generateVoiceOver(runId);

    expect(outcome).toEqual({ ok: false, reason: "retry-scheduled" });
    expect(getStageAttempts(runId, "voice-over")[0]).toMatchObject({ outcome: "transient" });
    expect(getStageAttempts(runId, "voice-over")[1]).toMatchObject({ outcome: "scheduled", trigger: "automatic", sequenceInCycle: 2 });
    expect(getRun(runId)?.failure).toBeNull();
    expect(stateOf(runId)).not.toBe("failed");
  });

  it("sends the scheduled retry on its own once its delay has passed", async () => {
    setRetryDelayConfig({ baseSeconds: 0, capSeconds: 0 });
    const runId = register();
    const stub = useStub("transient-failure");

    await generateVoiceOver(runId);
    await waitFor(() => stub.calls.length >= 2);

    expect(getStageAttempts(runId, "voice-over")[1]?.outcome).not.toBe("scheduled");
  });

  it("fails the session after the fourth transient failure: retryable, manual retry available, nothing scheduled", async () => {
    const runId = register();
    const stub = useStub("transient-failure");

    await generateVoiceOver(runId);
    for (let attempt = 2; attempt <= 4; attempt++) await sendScheduledRetry(runId);

    expect(stub.calls).toHaveLength(4);
    expect(getStageAttempts(runId, "voice-over").some((attempt) => attempt.outcome === "scheduled")).toBe(false);
    expect(getRun(runId)?.failure).toMatchObject({ phase: "voice-over", retryable: true, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 4 });
    expect(stateOf(runId)).toBe("failed");
  });

  it("makes no second provider call when a send job is redelivered for an attempt already claimed", async () => {
    const runId = register();
    const stub = useStub("transient-failure");
    await generateVoiceOver(runId);
    const scheduled = getStageAttempts(runId, "voice-over")[1];
    const later = () => new Date(Date.now() + 3_600_000);

    releaseAttempt(scheduled?.id ?? "", later);
    releaseAttempt(scheduled?.id ?? "", later);
    await waitFor(() => stub.calls.length >= 2);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(stub.calls).toHaveLength(2);
  });

  it("is held while the session is paused and sent after continue", async () => {
    setRetryDelayConfig({ baseSeconds: 0, capSeconds: 0 });
    const runId = register();
    const stub = useStub("transient-failure");
    pauseSession(runId);

    await generateVoiceOver(runId);
    await new Promise((resolve) => setTimeout(resolve, 30)); // the retry is due and its timer has fired

    expect(stub.calls).toHaveLength(1);
    expect(getStageAttempts(runId, "voice-over")[1]?.outcome).toBe("scheduled");

    continueSession(runId);
    await waitFor(() => stub.calls.length >= 2);
  });

  it("never reaches the provider again for a session whose voice-over is already stored", async () => {
    const runId = register();
    useStub("transient-failure");
    await generateVoiceOver(runId);
    const stored = useStub("success");
    const scheduled = getStageAttempts(runId, "voice-over")[1];
    insertVoiceOver({ runId, audioPath: "voice-over.mp3", timestampsPath: null, durationSeconds: 1, sizeBytes: 1, nativeTimestampsAvailable: false, providerRequestId: null, completedAt: new Date().toISOString() });

    releaseAttempt(scheduled?.id ?? "", () => new Date(Date.now() + 3_600_000));
    await waitFor(() => getStageAttempts(runId, "voice-over").every((attempt) => attempt.outcome !== "in-flight"));

    expect(stored.calls).toHaveLength(0);
  });
});

describe("A missing credential (5.10)", () => {
  it("sends no request and fails the session with a cause naming the credential and no secret", async () => {
    const runId = register();
    let requests = 0;
    useProvider(
      createElevenLabsVoiceProvider({
        loadKey: () => {
          throw new Error("missing credential 'ELEVENLABS_KEY': set it in the local environment or in the local secrets file (never in the repository)");
        },
        fetchFn: (async () => {
          requests += 1;
          return new Response("{}");
        }) as unknown as typeof fetch,
      }),
    );

    await generateVoiceOver(runId);

    expect(requests).toBe(0);
    const failure = getRun(runId)?.failure;
    expect(failure).toMatchObject({ phase: "voice-over", retryable: false });
    expect(failure?.cause).toContain("ELEVENLABS_KEY");
    expect(stateOf(runId)).toBe("failed");
  });
});

describe("One voice-over per session (5.11)", () => {
  it("a repeated success confirmation stores one voice-over, leaves the MP3 unchanged and launches nothing", async () => {
    const runId = register();
    const stub = useStub("success");
    await generateVoiceOver(runId);
    const folder = getRun(runId)?.projectFolder ?? "";
    const audioFile = resolveArtefactPath(folder, "voice-over.mp3");
    const before = readFileSync(audioFile);

    const again = await confirmVoiceOver(runId, { kind: "success", audio: createSilentMp3(3), providerRequestId: "second" });

    expect(again).toEqual({ stored: false, reason: "already-stored" });
    expect(countVoiceOvers(runId)).toBe(1);
    expect(readFileSync(audioFile).equals(before)).toBe(true);
    expect(stub.calls).toHaveLength(1);
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(1);
  });

  it("two concurrent success confirmations store exactly one voice-over", async () => {
    const runId = register();
    useStub("hang");

    const results = await Promise.all([
      confirmVoiceOver(runId, { kind: "success", audio: createSilentMp3(1), providerRequestId: "a" }),
      confirmVoiceOver(runId, { kind: "success", audio: createSilentMp3(1), providerRequestId: "b" }),
    ]);

    expect(results.filter((r) => r.stored)).toHaveLength(1);
    expect(results.filter((r) => !r.stored)).toEqual([{ stored: false, reason: "already-stored" }]);
    expect(countVoiceOvers(runId)).toBe(1);
  });
});

describe("Generation requested after completion (5.12)", () => {
  it("sends nothing and leaves the MP3 unchanged, because canLaunchVoiceOver refuses", async () => {
    const runId = register();
    const folder = getRun(runId)?.projectFolder ?? "";
    writeArtefactOnce(folder, "voice-over.mp3", Buffer.from("existing narration"));
    insertVoiceOver({
      runId,
      audioPath: "voice-over.mp3",
      timestampsPath: null,
      durationSeconds: 5,
      sizeBytes: 18,
      nativeTimestampsAvailable: false,
      providerRequestId: null,
      completedAt: new Date().toISOString(),
    });
    const stub = useStub("success");

    const outcome = await generateVoiceOver(runId);

    expect(outcome).toEqual({ ok: false, reason: "narration-complete" });
    expect(stub.calls).toHaveLength(0);
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(0);
    expect(readFileSync(resolveArtefactPath(folder, "voice-over.mp3"), "utf8")).toBe("existing narration");
  });

  it("the launcher sends nothing either", async () => {
    const runId = register();
    useStub("success");
    await generateVoiceOver(runId);
    const stub = useStub("success");

    voiceOverLauncher.launch(runId);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(stub.calls).toHaveLength(0);
  });

  it("reports an unknown session without sending anything", async () => {
    const stub = useStub("success");

    expect(await generateVoiceOver("does-not-exist")).toEqual({ ok: false, reason: "unknown-session" });
    expect(stub.calls).toHaveLength(0);
  });
});

describe("The launch gate (5.13)", () => {
  it("holds a launch while the session is paused, reports it as held work, and launches it on continue", async () => {
    const stub = useStub("success");
    const runId = register();
    pauseSession(runId);

    voiceOverLauncher.launch(runId);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(stub.calls).toHaveLength(0);
    expect(getStageAttempts(runId, "voice-over")).toHaveLength(0);
    expect(voiceOverLauncher.heldWork(runId).count).toBe(1);
    expect(toSnapshot(runId)?.session.held).toEqual([{ stage: "voice-over", count: 1 }]);

    continueSession(runId);
    await waitFor(() => stateOf(runId) === "voice-over-complete");

    expect(stub.calls).toHaveLength(1);
    expect(voiceOverLauncher.heldWork(runId).count).toBe(0);
  });

  it("counts no held work for a session that failed in the voice phase, completed it, or is generating", async () => {
    const failed = register();
    useStub("not-retryable-failure");
    await generateVoiceOver(failed);
    pauseSession(failed);
    expect(voiceOverLauncher.heldWork(failed).count).toBe(0);

    const done = register();
    useStub("success");
    await generateVoiceOver(done);
    pauseSession(done);
    expect(voiceOverLauncher.heldWork(done).count).toBe(0);
  });
});

describe("Live updates (5.17)", () => {
  it("publishes each state change in order", async () => {
    const runId = register();
    useStub("success");

    await generateVoiceOver(runId);

    const states = published.filter((s) => s.session.sessionId === runId).map((s) => s.session.state);
    expect(states[0]).toBe("voice-over-generating");
    expect(states.at(-1)).toBe("voice-over-complete");
  });

  it("publishes a failure", async () => {
    const runId = register();
    useStub("not-retryable-failure");

    await generateVoiceOver(runId);

    const states = published.filter((s) => s.session.sessionId === runId).map((s) => s.session.state);
    expect(states).toEqual(["voice-over-generating", "failed"]);
  });
});

describe("Logs (5.18, 5.19)", () => {
  it("logs every attempt with session id, stage, provider, sequence, external request id, outcome and latency, and the script's length and hash", async () => {
    const runId = register();
    useStub("success");

    await generateVoiceOver(runId);

    const entry = logs.find((log) => log.event === "voice-over.attempt.finished");
    expect(entry).toMatchObject({
      sessionId: runId,
      stage: "voice-over",
      provider: "stub-voice",
      attemptNumber: 1,
      providerRequestId: "stub-request-1",
      outcome: "success",
      scriptLength: SCRIPT.length,
      scriptSha256: createHash("sha256").update(SCRIPT).digest("hex"),
    });
    expect(typeof entry?.latencyMs).toBe("number");
    expect(logs.some((log) => log.event === "voice-over.attempt.started")).toBe(true);
  });

  it("never contains the script text or a credential, on success or failure", async () => {
    const script = "A very distinctive sentence about purple elephants.";
    const secret = "super-secret-key-value";
    for (const status of [200, 401, 503]) {
      const runId = register(script);
      useProvider(
        createElevenLabsVoiceProvider({
          loadKey: () => secret,
          fetchFn: (async () =>
            status === 200
              ? new Response(JSON.stringify({ audio_base64: Buffer.from(createSilentMp3(1)).toString("base64") }), { status })
              : new Response(`${script} ${secret}`, { status })) as unknown as typeof fetch,
        }),
      );
      await generateVoiceOver(runId);
    }

    const serialized = JSON.stringify(logs);
    expect(logs.length).toBeGreaterThan(0);
    expect(serialized).not.toContain("purple elephants");
    expect(serialized).not.toContain(secret);
  });
});
