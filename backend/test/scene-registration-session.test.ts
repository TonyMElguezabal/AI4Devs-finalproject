import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createRun, db, getRun, getScenesForRun, resetAll } from "../src/db.ts";
import { deriveSessionState, events } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import type { SessionSnapshot } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// assign-scene-identifiers (JOS-144), group 5 — design Decision 6 and AC5: the
// session derives to `chunks-processing` right after a registration, and to
// `failed` with failed phase `decomposition` when one was refused; the session
// read and the live updates carry PROMPT, IMAGE and VIDEO.

const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";
const FRAGMENTS: SegmentedFragment[] = [
  { text: "The harbor is quiet at dusk.", narrationInterval: { startSeconds: 0, endSeconds: 6 } },
  { text: "Fishing boats return with the tide.", narrationInterval: { startSeconds: 6, endSeconds: 15 } },
];

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

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

function newRunId(): string {
  const runId = randomUUID();
  createRun(runId, "Session state test", SCRIPT, "en");
  return runId;
}

describe("The derived session state (Decision 6, AC5)", () => {
  it("is chunks-processing right after a successful registration", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, generator, 15);
    expect(deriveSessionState(getScenesForRun(runId), getRun(runId)?.failure)).toEqual({ state: "chunks-processing" });
  });

  it("is failed with failed phase decomposition when a registration was refused", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, [], generator, 15);
    expect(deriveSessionState(getScenesForRun(runId), getRun(runId)?.failure)).toEqual({
      state: "failed",
      failedPhase: "decomposition",
    });
  });

  it("is still submitted for a session with neither chunks nor a failure", () => {
    const runId = newRunId();
    expect(deriveSessionState(getScenesForRun(runId), getRun(runId)?.failure)).toEqual({ state: "submitted" });
  });

  it("keeps working for callers that pass only the scenes", () => {
    expect(deriveSessionState([])).toEqual({ state: "submitted" });
  });

  it("is final-video-generating once every chunk has reached chunk-complete, until a final video exists (JOS-150, PRD §8.1 v1.3)", async () => {
    // No code path in this story ever produces a real chunk-complete scene
    // (generate-chunk-video, JOS-146, owns the video stage that does); the
    // status is forced directly to exercise deriveSessionState's own truth
    // table completely.
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, generator, 15);
    for (const scene of getScenesForRun(runId)) {
      db.prepare("UPDATE scenes SET status = 'chunk-complete' WHERE id = ?").run(scene.id);
    }
    expect(deriveSessionState(getScenesForRun(runId), getRun(runId)?.failure)).toEqual({ state: "final-video-generating" });
  });
});

describe("The session read (GET /sessions/:id)", () => {
  it("lists the chunks in ascending order with their prompt, image and video instructions", async () => {
    const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Read test", script: SCRIPT, language: "en" } });
    const sessionId = res.json().session.sessionId as string;
    await registerDecomposition(sessionId, FRAGMENTS, generator, 15);

    const body = (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json();

    expect(body.session.state).toBe("chunks-processing");
    expect(
      body.scenes.map((s: Record<string, unknown>) => ({
        index: s.index,
        state: s.state,
        prompt: s.prompt,
        imageInstruction: s.imageInstruction,
        videoInstruction: s.videoInstruction,
      })),
    ).toEqual([
      { index: 1, state: "submitted", prompt: "The harbor is quiet at dusk.", imageInstruction: "image 1", videoInstruction: "video 1" },
      { index: 2, state: "submitted", prompt: "Fishing boats return with the tide.", imageInstruction: "image 2", videoInstruction: "video 2" },
    ]);
  });

  it("shows failed with failed phase decomposition and no scenes after a refused registration", async () => {
    const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Read test", script: SCRIPT, language: "en" } });
    const sessionId = res.json().session.sessionId as string;
    await registerDecomposition(sessionId, [], generator, 15);

    const body = (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json();

    expect(body.session).toMatchObject({ state: "failed", failedPhase: "decomposition" });
    expect(body.scenes).toEqual([]);
  });
});

describe("Live updates (define-live-updates)", () => {
  it("publishes the session's state after a successful registration", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, FRAGMENTS, generator, 15);
    const last = received.filter((s) => s.session.sessionId === runId).at(-1);
    expect(last?.session.state).toBe("chunks-processing");
    expect(last?.scenes.map((s) => s.prompt)).toEqual(FRAGMENTS.map((f) => f.text));
  });

  it("publishes the failure after a refused registration", async () => {
    const runId = newRunId();
    await registerDecomposition(runId, [], generator, 15);
    const last = received.filter((s) => s.session.sessionId === runId).at(-1);
    expect(last?.session).toMatchObject({ state: "failed", failedPhase: "decomposition" });
  });

  it("publishes nothing for an unknown session", async () => {
    await registerDecomposition("no-such-session", FRAGMENTS, generator, 15);
    expect(received).toEqual([]);
  });
});
