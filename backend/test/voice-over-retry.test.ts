import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createRun, getRun, getStageAttempts, getVoiceOver, insertVoiceOver, resetAll, resolveArtefactPath, setRunFailure } from "../src/db.ts";
import { continueSession, events, pauseSession, toSnapshot } from "../src/orchestrator.ts";
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

// run-session-end-to-end (JOS-195), design Decision 6 — this file tests the voice-over phase alone, so the hand-off to
// decomposition that a stored narration now triggers is disabled here; `narration-handoff-*.test.ts` covers it.
vi.mock("../src/decompositionPhase.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/decompositionPhase.ts")>()),
  launchDecompositionFor: () => undefined,
}));

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

// retry-voice-over (JOS-155), group 3 — design Decisions 4-6: the retry changes nothing about the inputs
// (script, provider) and deletes nothing.

/** Every file under the project folder with its content hash, so a later listing can be compared byte for byte. */
function folderSnapshot(runId: string): Record<string, string> {
  const root = resolveArtefactPath(getRun(runId)!.projectFolder, ".");
  const files: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const full = join(directory, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[full.slice(root.length)] = createHash("sha256").update(readFileSync(full)).digest("hex");
    }
  };
  walk(root);
  return files;
}

describe("Same script (3.1)", () => {
  it("sends text byte-identical to the stored script and to the first attempt, leaving the session inputs unchanged", async () => {
    const runId = register();
    const first = await failRetryably(runId);
    const before = getRun(runId)!;
    const retryStub = useStub("success");

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => stateOf(runId) === "voice-over-complete");

    expect(retryStub.calls).toHaveLength(1);
    expect(retryStub.calls[0]!.text).toBe(SCRIPT);
    expect(retryStub.calls[0]!.text).toBe(first.calls[0]!.text);
    const after = getRun(runId)!;
    expect({ script: after.script, title: after.title, language: after.language }).toEqual({
      script: before.script,
      title: before.title,
      language: before.language,
    });
  });
});

describe("Same provider (3.2)", () => {
  it("sends the retry to the provider bound on the first attempt, even when the default changed", async () => {
    const runId = register();
    await failRetryably(runId);
    expect(getRun(runId)!.voiceProviderId).toBe("stub-voice");
    const bound = createStubVoiceProvider("success");
    const other = createStubVoiceProvider("success");
    setVoiceProviderRegistry({ defaultIdentifier: "other-voice", adapters: { "stub-voice": bound, "other-voice": other } });

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => stateOf(runId) === "voice-over-complete");

    expect(bound.calls).toHaveLength(1);
    expect(other.calls).toHaveLength(0);
    expect(getRun(runId)!.voiceProviderId).toBe("stub-voice");
  });

  it("fails as not retryable, sending nothing, when the bound provider has no adapter", async () => {
    const runId = register();
    await failRetryably(runId);
    const other = createStubVoiceProvider("success");
    setVoiceProviderRegistry({ defaultIdentifier: "other-voice", adapters: { "other-voice": other } });

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getRun(runId)?.failure?.manualRetryAvailable === false);

    expect(other.calls).toHaveLength(0);
    expect(stateOf(runId)).toBe("failed");
    expect(getRun(runId)!.voiceProviderId).toBe("stub-voice");
    expect(getRun(runId)!.failure?.cause).toContain("stub-voice");
  });
});

describe("Nothing is deleted (3.3)", () => {
  it("after a failed retry, leaves every earlier file and record unchanged except the session failure", async () => {
    const runId = register();
    await failRetryably(runId);
    const folderBefore = folderSnapshot(runId);
    const attemptsBefore = getStageAttempts(runId, "voice-over");
    const runBefore = getRun(runId)!;
    useStub("transient-failure");

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => getStageAttempts(runId, "voice-over").some((attempt) => attempt.cycle === 2 && attempt.outcome !== "in-flight"));

    expect(folderSnapshot(runId)).toEqual(folderBefore);
    expect(getVoiceOver(runId)).toBeUndefined();
    const earlier = getStageAttempts(runId, "voice-over").filter((attempt) => attempt.cycle === 1);
    expect(earlier).toEqual(attemptsBefore);
    const runAfter = getRun(runId)!;
    expect({ ...runAfter, failure: null }).toEqual({ ...runBefore, failure: null });
  });

  it("after a successful retry, adds one MP3 and removes nothing", async () => {
    const runId = register();
    await failRetryably(runId);
    const folderBefore = folderSnapshot(runId);
    const attemptsBefore = getStageAttempts(runId, "voice-over");
    useStub("success");

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: false });
    await waitFor(() => stateOf(runId) === "voice-over-complete");

    const folderAfter = folderSnapshot(runId);
    for (const [path, hash] of Object.entries(folderBefore)) expect(folderAfter[path]).toBe(hash);
    const added = Object.keys(folderAfter).filter((path) => !(path in folderBefore));
    expect(added.filter((path) => path.endsWith(".mp3"))).toHaveLength(1);
    expect(getStageAttempts(runId, "voice-over").filter((attempt) => attempt.cycle === 1)).toEqual(attemptsBefore);
    expect(getVoiceOver(runId)).toBeDefined();
  });
});

// retry-voice-over (JOS-155), group 4 — design Decision 7: a retry opens a new cycle, a pause holds it, and the
// session shows progress from the moment the retry is accepted.

function voiceOverPhase(runId: string) {
  return toSnapshot(runId)!.session.phases!.find((phase) => phase.phase === "voice-over")!;
}

describe("A new cycle (4.1)", () => {
  it("fails again after the fourth attempt of the new cycle, with all eight attempts recorded across two cycles", async () => {
    const runId = register();
    await failRetryably(runId);
    useStub("transient-failure");

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: false });
    for (let attempt = 2; attempt <= 4; attempt++) {
      await waitFor(() => getStageAttempts(runId, "voice-over").some((entry) => entry.outcome === "scheduled"));
      await sendScheduledRetry(runId);
    }

    expect(stateOf(runId)).toBe("failed");
    const attempts = getStageAttempts(runId, "voice-over");
    expect(attempts).toHaveLength(8);
    expect(attempts.filter((attempt) => attempt.cycle === 1)).toHaveLength(4);
    expect(attempts.filter((attempt) => attempt.cycle === 2)).toHaveLength(4);
  });
});

describe("A retry during a pause (4.2)", () => {
  it("is accepted as held, sends nothing, counts one held request, and continue sends exactly one", async () => {
    const runId = register();
    await failRetryably(runId);
    const stub = useStub("success");
    pauseSession(runId);

    expect(retryVoiceOver(runId)).toEqual({ ok: true, held: true });

    expect(stub.calls).toHaveLength(0);
    expect(voiceOverPhase(runId).heldCount).toBe(1);

    expect(continueSession(runId).ok).toBe(true);
    await waitFor(() => stateOf(runId) === "voice-over-complete");
    expect(stub.calls).toHaveLength(1);
  });
});

describe("Derived state of an accepted retry (4.3)", () => {
  it("derives voice-over-generating, in progress and without a failure, while the retry is held", async () => {
    const runId = register();
    await failRetryably(runId);
    useStub("success");
    pauseSession(runId);
    retryVoiceOver(runId);

    expect(stateOf(runId)).toBe("voice-over-generating");
    expect(voiceOverPhase(runId)).toMatchObject({ status: "in-progress" });
    expect(voiceOverPhase(runId).failure).toBeUndefined();
  });

  it("derives voice-over-generating while the retry is in flight", async () => {
    const runId = register();
    await failRetryably(runId);
    const stub = useStub("hang");
    retryVoiceOver(runId);
    await waitFor(() => stub.calls.length === 1);

    expect(stateOf(runId)).toBe("voice-over-generating");
    expect(voiceOverPhase(runId)).toMatchObject({ status: "in-progress" });
    expect(voiceOverPhase(runId).failure).toBeUndefined();
    stub.release();
  });
});
