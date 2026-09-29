import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AlignmentProvider, AlignmentResult } from "../src/alignmentProvider.ts";
import {
  countScenesForRun,
  createRun,
  getNarrationTimestamps,
  getRun,
  getScenesForRun,
  getStageAttempts,
  getVoiceOver,
  insertVoiceOver,
  resetAll,
  writeArtefactOnce,
} from "../src/db.ts";
import { obtainNarrationTimestamps } from "../src/narrationTimestampsPhase.ts";
import { deriveSessionState, events } from "../src/orchestrator.ts";
import { buildApp } from "../src/server.ts";
import type { SessionSnapshot } from "../src/types.ts";

// obtain-narration-timestamps (JOS-139), group 5 — design Decision 8 and AC1:
// the session derives `voice-over-complete` and `chunk-decomposing` from the
// records it already keeps, and `failed` in the decomposition phase when the
// timestamps could not be obtained.

const SCRIPT = "Hi there. Bye now.";
const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04]);

let app: FastifyInstance;
const received: SessionSnapshot[] = [];
const onState = (snapshot: SessionSnapshot) => received.push(snapshot);

beforeEach(async () => {
  resetAll();
  received.length = 0;
  events.on("state", onState);
  app = await buildApp();
});

afterEach(async () => {
  events.off("state", onState);
  await app.close();
});

function aligned(text = SCRIPT) {
  return [...text].map((character, i) => ({ text: character, start: 0.1 + i * 0.1, end: 0.2 + i * 0.1 }));
}

const okProvider: AlignmentProvider = { align: async () => ({ kind: "success", characters: aligned() }) };

/** A session created through the API, so the session read has something to show, with a stored narration without native timestamps. */
async function narratedSessionViaApi(): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "State test", script: SCRIPT, language: "en" } });
  const runId = res.json().session.sessionId as string;
  const run = getRun(runId)!;
  writeArtefactOnce(run.projectFolder, "voice-over.mp3", MP3);
  insertVoiceOver({
    runId,
    audioPath: "voice-over.mp3",
    timestampsPath: null,
    durationSeconds: SCRIPT.length * 0.1 + 0.2,
    sizeBytes: MP3.length,
    nativeTimestampsAvailable: false,
    providerRequestId: null,
    completedAt: "2026-09-28T10:00:00.000Z",
  });
  return runId;
}

const readState = async (runId: string) => (await app.inject({ method: "GET", url: `/sessions/${runId}` })).json().session;

function derived(runId: string) {
  return deriveSessionState(getScenesForRun(runId), getRun(runId)?.failure ?? null, {
    hasVoiceOver: getVoiceOver(runId) !== undefined,
    timestampsStarted: getStageAttempts(runId, "timestamps").length > 0 || getNarrationTimestamps(runId) !== undefined,
  });
}

describe("The derived session state with no chunks (Decision 8)", () => {
  it("is submitted with nothing", () => {
    expect(deriveSessionState([], null, {})).toEqual({ state: "submitted" });
  });

  it("is voice-over-complete with a voice-over and no timestamps attempt", () => {
    expect(deriveSessionState([], null, { hasVoiceOver: true })).toEqual({ state: "voice-over-complete" });
  });

  it("is chunk-decomposing once the timestamps stage has started", () => {
    expect(deriveSessionState([], null, { hasVoiceOver: true, timestampsStarted: true })).toEqual({ state: "chunk-decomposing" });
  });

  it("is failed with the failure's phase when the session carries a failure, whatever else it has", () => {
    const failure = { phase: "decomposition" as const, cause: "x", retryable: true, occurredAt: "now" };
    expect(deriveSessionState([], failure, { hasVoiceOver: true, timestampsStarted: true })).toEqual({
      state: "failed",
      failedPhase: "decomposition",
    });
  });

  it("keeps working for callers that pass only the scenes or the scenes and a failure", () => {
    expect(deriveSessionState([])).toEqual({ state: "submitted" });
    expect(deriveSessionState([], null)).toEqual({ state: "submitted" });
  });
});

describe("The session read follows the phase (AC1, AC4)", () => {
  it("shows voice-over-complete before the timestamps are obtained", async () => {
    const runId = await narratedSessionViaApi();
    expect((await readState(runId)).state).toBe("voice-over-complete");
  });

  it("shows chunk-decomposing while the timestamps are being obtained", async () => {
    const runId = await narratedSessionViaApi();
    let release!: (result: AlignmentResult) => void;
    const pending = new Promise<AlignmentResult>((resolve) => (release = resolve));

    const running = obtainNarrationTimestamps(runId, { align: () => pending });
    // The attempt is recorded, and the provider called, before the first await.
    expect(getStageAttempts(runId, "timestamps")).toHaveLength(1);
    expect((await readState(runId)).state).toBe("chunk-decomposing");

    release({ kind: "success", characters: aligned() });
    await running;
  });

  it("shows chunk-decomposing after the timestamps are stored and before any chunk exists", async () => {
    const runId = await narratedSessionViaApi();
    await obtainNarrationTimestamps(runId, okProvider);
    expect(countScenesForRun(runId)).toBe(0);
    expect((await readState(runId)).state).toBe("chunk-decomposing");
    expect(derived(runId)).toEqual({ state: "chunk-decomposing" });
  });

  it("shows failed with failed phase decomposition when the timestamps could not be obtained", async () => {
    const runId = await narratedSessionViaApi();
    await obtainNarrationTimestamps(runId, { align: async () => ({ kind: "failed_transient", reason: "the alignment provider answered HTTP 503" }) });
    expect(await readState(runId)).toMatchObject({ state: "failed", failedPhase: "decomposition" });
  });

  it("returns to chunk-decomposing when a later attempt succeeds", async () => {
    const runId = await narratedSessionViaApi();
    await obtainNarrationTimestamps(runId, { align: async () => ({ kind: "failed_transient", reason: "x" }) });
    await obtainNarrationTimestamps(runId, okProvider);
    const session = await readState(runId);
    expect(session.state).toBe("chunk-decomposing");
    expect(session.failedPhase).toBeUndefined();
  });
});

describe("Live updates", () => {
  it("publishes chunk-decomposing after the timestamps are stored", async () => {
    const runId = await narratedSessionViaApi();
    await obtainNarrationTimestamps(runId, okProvider);
    expect(received.filter((s) => s.session.sessionId === runId).at(-1)?.session.state).toBe("chunk-decomposing");
  });

  it("publishes the decomposition failure", async () => {
    const runId = await narratedSessionViaApi();
    await obtainNarrationTimestamps(runId, { align: async () => ({ kind: "failed_transient", reason: "x" }) });
    expect(received.filter((s) => s.session.sessionId === runId).at(-1)?.session).toMatchObject({ state: "failed", failedPhase: "decomposition" });
  });
});
