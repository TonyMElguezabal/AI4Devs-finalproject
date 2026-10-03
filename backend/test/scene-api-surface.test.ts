import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createScene, getScenesForRun, markSceneFailed, resetAll } from "../src/db.ts";
import { toSnapshot } from "../src/orchestrator.ts";
import { registerDecomposition } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// assign-scene-identifiers (JOS-144), group 6 — AC4, PRD §6: once
// established, chunks cannot be split, merged, deleted or reordered. No route
// is added; these tests prove the absence, and that the one route that takes a
// scene body (the correction) never moves a chunk or changes its PROMPT.

const SCRIPT = "The harbor is quiet at dusk. Fishing boats return with the tide.";

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

let app: FastifyInstance;

beforeEach(async () => {
  resetAll();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

async function sessionWithChunks(): Promise<{ sessionId: string; sceneIds: string[] }> {
  const res = await app.inject({ method: "POST", url: "/sessions", payload: { title: "Surface test", script: SCRIPT, language: "en" } });
  const sessionId = res.json().session.sessionId as string;
  // Held: a paused session launches nothing, so no provider timer outlives the test.
  await app.inject({ method: "POST", url: `/sessions/${sessionId}/pause` });
  const result = await registerDecomposition(
    sessionId,
    [
      { text: "The harbor is quiet at dusk.", narrationInterval: { startSeconds: 0, endSeconds: 6 } },
      { text: "Fishing boats return with the tide.", narrationInterval: { startSeconds: 6, endSeconds: 15 } },
    ],
    generator,
    15,
  );
  if (!result.ok) throw new Error("registration failed in the test setup");
  return { sessionId, sceneIds: result.sceneIds };
}

function chunkShape(sessionId: string) {
  return getScenesForRun(sessionId).map((s) => ({ id: s.id, index: s.index, prompt: s.prompt, runId: s.runId }));
}

describe("No operation splits, merges, deletes or reorders chunks (AC4)", () => {
  it("offers no route whose path names such an action", () => {
    const routes = app.printRoutes({ commonPrefix: false });
    expect(routes).toContain("scenes"); // positive control: the listing sees the scene routes
    expect(routes).not.toMatch(/split|merge|reorder|move|order|position|renumber/i);
  });

  it.each([
    ["DELETE", ""],
    ["PUT", ""],
    ["PATCH", ""],
    ["POST", "/split"],
    ["POST", "/merge"],
    ["POST", "/reorder"],
    ["POST", "/move"],
  ] as const)("answers %s /sessions/:id/scenes/:sceneId%s with not found, and changes nothing", async (method, suffix) => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const before = chunkShape(sessionId);

    const res = await app.inject({
      method,
      url: `/sessions/${sessionId}/scenes/${sceneIds[0]}${suffix}`,
      payload: { index: 2, prompt: "changed" },
    });

    expect(res.statusCode).toBe(404);
    expect(chunkShape(sessionId)).toEqual(before);
  });

  it.each(["DELETE", "PUT", "PATCH"] as const)("answers %s on the scene collection with not found", async (method) => {
    const { sessionId } = await sessionWithChunks();
    const before = chunkShape(sessionId);
    const res = await app.inject({ method, url: `/sessions/${sessionId}/scenes`, payload: {} });
    expect(res.statusCode).toBe(404);
    expect(chunkShape(sessionId)).toEqual(before);
  });

  it("leaves a chunk's number, prompt and session unchanged when a correction body names them", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");
    const before = chunkShape(sessionId);

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: { instruction: "a corrected image instruction", index: 2, idx: 2, prompt: "changed", runId: "another" },
    });

    expect(res.statusCode).toBe(200);
    expect(chunkShape(sessionId)).toEqual(before);
    expect(getScenesForRun(sessionId).find((s) => s.id === target)?.instruction).toBe("a corrected image instruction");
  });
});

// assign-narration-intervals (JOS-143), group 6 — design Decision 5, PRD §3
// ("No permitida"): the interval is readable, never writable.
describe("A chunk's narration interval is readable and never writable (JOS-143)", () => {
  it("is carried by every scene of the session read", async () => {
    const { sessionId } = await sessionWithChunks();

    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().scenes.map((scene: { narrationInterval: unknown }) => scene.narrationInterval)).toEqual([
      { startSeconds: 0, endSeconds: 6 },
      { startSeconds: 6, endSeconds: 15 },
    ]);
  });

  it("is carried by the snapshot entries the live updates resync from", async () => {
    const { sessionId } = await sessionWithChunks();

    const scenes = toSnapshot(sessionId)?.scenes ?? [];

    expect(scenes.map((scene) => scene.narrationInterval)).toEqual([
      { startSeconds: 0, endSeconds: 6 },
      { startSeconds: 6, endSeconds: 15 },
    ]);
  });

  it("is omitted for a scene created without a decomposition", async () => {
    const { sessionId } = await sessionWithChunks();
    const skeletonSceneId = "skeleton-scene";
    createScene(skeletonSceneId, sessionId, 3, "success", 10);

    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });

    const skeleton = res.json().scenes.find((scene: { sceneId: string }) => scene.sceneId === skeletonSceneId);
    expect(skeleton).toBeDefined();
    expect("narrationInterval" in skeleton).toBe(false);
  });

  it("is unchanged when a correction body names it", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");
    const before = getScenesForRun(sessionId).map((scene) => scene.narrationInterval);

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: {
        instruction: "a corrected image instruction",
        narrationInterval: { startSeconds: 1, endSeconds: 2 },
        narrationStartSeconds: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(getScenesForRun(sessionId).map((scene) => scene.narrationInterval)).toEqual(before);
  });

  it("is documented on the scene response and on no request body", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const document = res.json() as { paths: Record<string, Record<string, { requestBody?: unknown }>> };

    expect(JSON.stringify(document)).toContain("narrationInterval");
    for (const operations of Object.values(document.paths)) {
      for (const operation of Object.values(operations)) {
        expect(JSON.stringify(operation.requestBody ?? null)).not.toMatch(/narration/i);
      }
    }
  });
});

// request-admitted-clip-duration (JOS-147), group 5 — design Decision 4: the
// requested duration and its over-maximum warning are readable, never
// writable, exactly as the interval they are derived from.
describe("A chunk's requested duration is readable and never writable (JOS-147)", () => {
  it("is carried by every scene of the session read", async () => {
    const { sessionId } = await sessionWithChunks();

    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });

    // 6 s interval -> 6 s (exact admitted match); 9 s interval -> 9 s (exact admitted match). Neither warns.
    expect(res.json().scenes.map((scene: { requestedDurationSeconds: unknown; durationWarning: unknown }) => ({
      requestedDurationSeconds: scene.requestedDurationSeconds,
      durationWarning: scene.durationWarning,
    }))).toEqual([
      { requestedDurationSeconds: 6, durationWarning: undefined },
      { requestedDurationSeconds: 9, durationWarning: undefined },
    ]);
  });

  it("is carried by the snapshot entries the live updates resync from", async () => {
    const { sessionId } = await sessionWithChunks();

    const scenes = toSnapshot(sessionId)?.scenes ?? [];

    expect(scenes.map((scene) => scene.requestedDurationSeconds)).toEqual([6, 9]);
  });

  it("is omitted for a scene created without a decomposition", async () => {
    const { sessionId } = await sessionWithChunks();
    const skeletonSceneId = "skeleton-scene-duration";
    createScene(skeletonSceneId, sessionId, 4, "success", 10);

    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });

    const skeleton = res.json().scenes.find((scene: { sceneId: string }) => scene.sceneId === skeletonSceneId);
    expect(skeleton).toBeDefined();
    expect("requestedDurationSeconds" in skeleton).toBe(false);
    expect("durationWarning" in skeleton).toBe(false);
  });

  it("is unchanged when a correction body names it", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");
    const before = getScenesForRun(sessionId).map((scene) => ({
      requestedDurationSeconds: scene.requestedDurationSeconds,
      durationWarning: scene.durationWarning,
    }));

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: { instruction: "a corrected image instruction", requestedDurationSeconds: 999, durationWarning: "exceeds-maximum" },
    });

    expect(res.statusCode).toBe(200);
    expect(
      getScenesForRun(sessionId).map((scene) => ({
        requestedDurationSeconds: scene.requestedDurationSeconds,
        durationWarning: scene.durationWarning,
      })),
    ).toEqual(before);
  });

  it("is documented on the scene response and on no request body", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const document = res.json() as { paths: Record<string, Record<string, { requestBody?: unknown }>> };

    expect(JSON.stringify(document)).toContain("requestedDurationSeconds");
    expect(JSON.stringify(document)).toContain("durationWarning");
    for (const operations of Object.values(document.paths)) {
      for (const operation of Object.values(operations)) {
        expect(JSON.stringify(operation.requestBody ?? null)).not.toMatch(/requestedDuration|durationWarning/i);
      }
    }
  });
});

// record-speed-adjustment-factor (JOS-148), group 5 — the speed factor and
// its limit warning are readable, never writable, exactly as the requested
// duration they are derived from.
describe("A chunk's speed factor is readable and never writable (JOS-148)", () => {
  it("is carried by every scene of the session read", async () => {
    const { sessionId } = await sessionWithChunks();

    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });

    // 6 s interval -> 6 s admitted (factor 1); 9 s interval -> 9 s admitted (factor 1). Neither warns.
    expect(res.json().scenes.map((scene: { speedFactor: unknown; speedFactorWarning: unknown }) => ({
      speedFactor: scene.speedFactor,
      speedFactorWarning: scene.speedFactorWarning,
    }))).toEqual([
      { speedFactor: 1, speedFactorWarning: undefined },
      { speedFactor: 1, speedFactorWarning: undefined },
    ]);
  });

  it("is carried by the snapshot entries the live updates resync from", async () => {
    const { sessionId } = await sessionWithChunks();

    const scenes = toSnapshot(sessionId)?.scenes ?? [];

    expect(scenes.map((scene) => scene.speedFactor)).toEqual([1, 1]);
  });

  it("is omitted for a scene created without a decomposition", async () => {
    const { sessionId } = await sessionWithChunks();
    const skeletonSceneId = "skeleton-scene-speed-factor";
    createScene(skeletonSceneId, sessionId, 4, "success", 10);

    const res = await app.inject({ method: "GET", url: `/sessions/${sessionId}` });

    const skeleton = res.json().scenes.find((scene: { sceneId: string }) => scene.sceneId === skeletonSceneId);
    expect(skeleton).toBeDefined();
    expect("speedFactor" in skeleton).toBe(false);
    expect("speedFactorWarning" in skeleton).toBe(false);
  });

  it("is unchanged when a correction body names it", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");
    const before = getScenesForRun(sessionId).map((scene) => ({
      speedFactor: scene.speedFactor,
      speedFactorWarning: scene.speedFactorWarning,
    }));

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: { instruction: "a corrected image instruction", speedFactor: 999, speedFactorWarning: "exceeds-limit" },
    });

    expect(res.statusCode).toBe(200);
    expect(
      getScenesForRun(sessionId).map((scene) => ({
        speedFactor: scene.speedFactor,
        speedFactorWarning: scene.speedFactorWarning,
      })),
    ).toEqual(before);
  });

  it("is documented on the scene response and on no request body", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const document = res.json() as { paths: Record<string, Record<string, { requestBody?: unknown }>> };

    expect(JSON.stringify(document)).toContain("speedFactor");
    expect(JSON.stringify(document)).toContain("speedFactorWarning");
    for (const operations of Object.values(document.paths)) {
      for (const operation of Object.values(operations)) {
        expect(JSON.stringify(operation.requestBody ?? null)).not.toMatch(/speedFactor/i);
      }
    }
  });
});
