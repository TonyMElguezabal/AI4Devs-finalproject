import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ulid } from "../src/util/ulid.ts";
import { createRun, db, getRun, getScenesForRun, recordStageAttempt, resetAll, setRunFailure, setRunPaused } from "../src/db.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import type { SceneState } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// view-progress-by-phase (JOS-168), tasks 3.1 and 3.2 — design Decision 5: a
// retried phase returns the session to that phase's in-progress state (§8.1).

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

const readSession = async (sessionId: string) => (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json().session;

describe("A voice-over retry in flight (3.1)", () => {
  it("reads voice-over-generating while the failure stays recorded", async () => {
    const sessionId = ulid();
    createRun(sessionId, "Voice test", "A short script.", "en");
    const failure = {
      phase: "voice-over" as const,
      cause: "The voice provider is not reachable.",
      retryable: true,
      manualRetryAvailable: true,
      cycle: 1,
      attemptsInCycle: 1,
      occurredAt: "2026-10-05T10:00:00.000Z",
    };
    setRunFailure(sessionId, failure);
    recordStageAttempt({ runId: sessionId, stage: "voice-over", providerId: "voice", queuedAt: "2026-10-05T10:00:05.000Z", sentAt: "2026-10-05T10:00:05.000Z" });

    const session = await readSession(sessionId);

    expect(session.state).toBe("voice-over-generating");
    expect(session.phases[0]).toMatchObject({ phase: "voice-over", status: "in-progress" });
    expect(session.phases[0].failure).toBeUndefined();
    expect(getRun(sessionId)?.failure).toEqual(failure);
  });
});

describe("A scene retry (3.2) — pins existing behaviour", () => {
  it("returns a failed session to chunks-processing, with the scenes phase in progress", async () => {
    const sessionId = ulid();
    createRun(sessionId, "Scene retry", "Fragment number 1. Fragment number 2.", "en");
    const fragments: SegmentedFragment[] = [0, 1].map((i) => ({ text: `Fragment number ${i + 1}.`, narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 } }));
    await registerDecomposition(sessionId, fragments, generator, 10);
    const statuses: SceneState[] = ["failed", "chunk-complete"] as const;
    const scenes = getScenesForRun(sessionId);
    scenes.forEach((scene, i) => db.prepare("UPDATE scenes SET status = ? WHERE id = ?").run(statuses[i] ?? "submitted", scene.id));
    // Paused, so the retry is held and no stage runs a provider call.
    setRunPaused(sessionId, true);
    expect(await readSession(sessionId)).toMatchObject({ state: "failed", failedPhase: "scenes" });

    const retry = await app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${scenes[0]?.id}/retry` });

    expect(retry.statusCode).toBe(200);
    const session = await readSession(sessionId);
    expect(session.state).toBe("chunks-processing");
    expect(session.phases[2]).toMatchObject({ phase: "scenes", status: "in-progress" });
  });
});
