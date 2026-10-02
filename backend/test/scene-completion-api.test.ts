import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { db, getScenesForRun, markImageComplete, markSceneFailed, resetAll } from "../src/db.ts";
import { broadcast, events } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import type { SceneState, SessionSnapshot } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// gate-assembly-on-complete-scenes (JOS-150), group 5 — the session read, the
// live updates and the downloads once the session state follows PRD §8.1 v1.3:
// failed scenes are named, results survive a failure, and no final video exists
// until a file does. Scene states no running code produces yet are forced
// directly, as scene-registration-session.test.ts does.

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
  await app.ready();
});

afterEach(async () => {
  events.off("state", onState);
  await app.close();
});

/** A session with one scene per status (indexes 1..n), each forced to its status. */
async function sessionWithScenes(statuses: readonly SceneState[]): Promise<{ sessionId: string; sceneIds: string[] }> {
  const fragments: SegmentedFragment[] = statuses.map((_, i) => ({
    text: `Fragment number ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
  const res = await app.inject({
    method: "POST",
    url: "/sessions",
    payload: { title: "Completion test", script: fragments.map((f) => f.text).join(" "), language: "en" },
  });
  const sessionId = res.json().session.sessionId as string;
  // Held: a paused session launches nothing, so no provider timer outlives the test.
  await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
  const result = await registerDecomposition(sessionId, fragments, generator, statuses.length * 5);
  if (!result.ok) throw new Error("registration failed in the test setup");
  const sceneIds = getScenesForRun(sessionId).map((scene) => scene.id);
  setStatuses(sceneIds, statuses);
  return { sessionId, sceneIds };
}

function setStatuses(sceneIds: readonly string[], statuses: readonly SceneState[]): void {
  statuses.forEach((status, i) => {
    db.prepare("UPDATE scenes SET status = ?, result = ? WHERE id = ?").run(
      status,
      status === "chunk-complete" ? `scene-${i + 1}.png` : null,
      sceneIds[i] ?? "",
    );
  });
}

const read = async (sessionId: string) => (await app.inject({ method: "GET", url: `/sessions/${sessionId}` })).json();

describe("The session read names the failed scenes (JOS-150)", () => {
  it("carries failedSceneIndexes only on a scene-failed session", async () => {
    const { sessionId } = await sessionWithScenes(["chunk-complete", "failed", "chunk-complete", "failed"]);

    const body = await read(sessionId);

    expect(body.session).toMatchObject({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [2, 4] });
  });

  it("carries no failedSceneIndexes while a scene is still processing, or on a session with no failed scene", async () => {
    const processing = await sessionWithScenes(["failed", "video-generating"]);
    const complete = await sessionWithScenes(["chunk-complete", "chunk-complete"]);

    const processingBody = await read(processing.sessionId);
    const completeBody = await read(complete.sessionId);

    expect(processingBody.session.state).toBe("chunks-processing");
    expect(processingBody.session).not.toHaveProperty("failedSceneIndexes");
    expect(completeBody.session).not.toHaveProperty("failedSceneIndexes");
  });

  it("carries no failedSceneIndexes on a session that failed in an earlier phase", async () => {
    const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Early failure", script: "A short script.", language: "en" } });
    const sessionId = res.json().session.sessionId as string;
    await registerDecomposition(sessionId, [], generator, 15);

    const body = await read(sessionId);

    expect(body.session).toMatchObject({ state: "failed", failedPhase: "decomposition" });
    expect(body.session).not.toHaveProperty("failedSceneIndexes");
  });

  it("carries the same failedSceneIndexes on the snapshot the live updates resync from", async () => {
    const { sessionId } = await sessionWithScenes(["failed", "chunk-complete"]);
    received.length = 0;

    broadcast(sessionId);

    expect(received.at(-1)?.session).toMatchObject({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [1] });
  });

  it("is documented on responses and on no request body", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const document = res.json() as { paths: Record<string, Record<string, { requestBody?: unknown }>> };

    expect(JSON.stringify(document)).toContain("failedSceneIndexes");
    for (const operations of Object.values(document.paths)) {
      for (const operation of Object.values(operations)) {
        expect(JSON.stringify(operation.requestBody ?? null)).not.toMatch(/failedSceneIndexes/);
      }
    }
  });
});

describe("The session turns failed only once its siblings settle (JOS-150)", () => {
  it("reads chunks-processing while a sibling generates, then failed once it completes", async () => {
    const { sessionId, sceneIds } = await sessionWithScenes(["chunk-complete", "failed", "image-generating"]);

    expect((await read(sessionId)).session.state).toBe("chunks-processing");

    setStatuses(sceneIds, ["chunk-complete", "failed", "chunk-complete"]);
    received.length = 0;
    broadcast(sessionId);

    expect(received.at(-1)?.session).toMatchObject({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [2] });
  });
});

describe("Successful results stay available after a failure (JOS-150, AC10)", () => {
  it("still serves a chunk-complete sibling's image and video in a failed session", async () => {
    const { sessionId, sceneIds } = await sessionWithScenes(["chunk-complete", "failed"]);
    const [completeSceneId = ""] = sceneIds;
    expect((await read(sessionId)).session.state).toBe("failed");

    for (const kind of ["image", "video"]) {
      const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}/scenes/${completeSceneId}/download/${kind}` });
      expect(res.statusCode).toBe(200);
    }
  });

  it("still carries the stored result of a scene that failed after storing its image", async () => {
    const { sessionId, sceneIds } = await sessionWithScenes(["image-generating", "chunk-complete"]);
    const [firstSceneId = ""] = sceneIds;
    markImageComplete(firstSceneId, "scene-1-image.png");
    markSceneFailed(firstSceneId, "the clip could not be generated");

    const body = await read(sessionId);

    expect(body.scenes[0]).toMatchObject({ state: "failed", result: { imageUrl: "scene-1-image.png" } });
  });
});

describe("The final video is refused until it exists (JOS-150, AC12)", () => {
  it("answers 409 for the final-video download when every scene is chunk-complete", async () => {
    const { sessionId } = await sessionWithScenes(["chunk-complete", "chunk-complete"]);
    expect((await read(sessionId)).session.state).toBe("final-video-generating");

    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}/download/final-video` });

    expect(res.statusCode).toBe(409);
  });

  it("answers 404 for the final-video download of an unknown session", async () => {
    const res = await app.inject({ method: "GET", url: "/sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV/download/final-video" });

    expect(res.statusCode).toBe(404);
  });
});
