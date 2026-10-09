import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createScene, db, getScenesForRun, markImageComplete, markSceneFailed, resetAll } from "../src/db.ts";
import { toSnapshot } from "../src/orchestrator.ts";
import { registerDecomposition } from "../src/sceneRegistration.ts";
import { buildApp } from "../src/server.ts";
import { ulid } from "../src/util/ulid.ts";
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
    // "decomposition" (the manual-retry route) contains "position" and is not a chunk operation.
    expect(routes.replace(/decomposition/gi, "")).not.toMatch(/split|merge|reorder|move|order|position|renumber/i);
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
    // retry-or-correct-image (JOS-157), design Decision 4 — a real chunk (non-empty imageInstruction,
    // which this fixture's generator sets) has IMAGE corrected, never the legacy `instruction` field.
    expect(getScenesForRun(sessionId).find((s) => s.id === target)?.imageInstruction).toBe("a corrected image instruction");
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

// retry-or-correct-image (JOS-157), design Decision 1 — both recovery routes are scoped by
// (sessionId, sceneId); a scene of another session is indistinguishable from an unknown one.
describe("Image recovery routes are scoped by session (JOS-157, design Decision 1)", () => {
  it("answers 404 for a retry at another session's URL and leaves the scene unchanged", async () => {
    const owner = await sessionWithChunks();
    const other = await sessionWithChunks();
    const target = owner.sceneIds[0]!;
    markSceneFailed(target, "the provider failed");
    const before = getScenesForRun(owner.sessionId).find((s) => s.id === target);

    const res = await app.inject({ method: "POST", url: `/sessions/${other.sessionId}/scenes/${target}/retry` });

    expect(res.statusCode).toBe(404);
    expect(getScenesForRun(owner.sessionId).find((s) => s.id === target)).toEqual(before);
  });

  it("answers 404 for a correction at another session's URL and leaves IMAGE unchanged", async () => {
    const owner = await sessionWithChunks();
    const other = await sessionWithChunks();
    const target = owner.sceneIds[0]!;
    markSceneFailed(target, "the provider failed");
    const before = getScenesForRun(owner.sessionId).find((s) => s.id === target);

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${other.sessionId}/scenes/${target}/correct`,
      payload: { instruction: "hijacked instruction" },
    });

    expect(res.statusCode).toBe(404);
    expect(getScenesForRun(owner.sessionId).find((s) => s.id === target)).toEqual(before);
  });

  it("answers 404 for retry and correct on an unknown session, same as an unknown scene", async () => {
    const unknownSession = ulid();
    const unknownScene = randomUUID();

    const retryRes = await app.inject({ method: "POST", url: `/sessions/${unknownSession}/scenes/${unknownScene}/retry` });
    expect(retryRes.statusCode).toBe(404);

    const correctRes = await app.inject({
      method: "POST",
      url: `/sessions/${unknownSession}/scenes/${unknownScene}/correct`,
      payload: { instruction: "anything" },
    });
    expect(correctRes.statusCode).toBe(404);
  });

  it("answers 404 for an unknown scene within a real session", async () => {
    const { sessionId } = await sessionWithChunks();
    const unknownScene = randomUUID();

    const res = await app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${unknownScene}/retry` });

    expect(res.statusCode).toBe(404);
  });
});

// retry-or-correct-image (JOS-157), design Decision 2 — refusals carry a reason code, not free text.
describe("Image recovery refusals carry reason codes (JOS-157, design Decision 2)", () => {
  it("answers 409 not-failed for retry and correct on a scene that has not failed", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!; // still `submitted`

    const retryRes = await app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${target}/retry` });
    expect(retryRes.statusCode).toBe(409);
    expect(retryRes.json()).toMatchObject({ reason: "not-failed" });

    const correctRes = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: { instruction: "too early" },
    });
    expect(correctRes.statusCode).toBe(409);
    expect(correctRes.json()).toMatchObject({ reason: "not-failed" });
  });

  it("answers 409 image-already-generated for retry and correct on a scene whose clip failed", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markImageComplete(target, "scene-image.png"); // image stage succeeded, result stored
    markSceneFailed(target, "the clip provider failed");
    const before = getScenesForRun(sessionId).find((s) => s.id === target);

    const retryRes = await app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${target}/retry` });
    expect(retryRes.statusCode).toBe(409);
    expect(retryRes.json()).toMatchObject({ reason: "image-already-generated" });

    const correctRes = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: { instruction: "too late" },
    });
    expect(correctRes.statusCode).toBe(409);
    expect(correctRes.json()).toMatchObject({ reason: "image-already-generated" });

    expect(getScenesForRun(sessionId).find((s) => s.id === target)).toEqual(before);
  });

  it("gives exactly one 200 and one 409 not-failed for two concurrent retries of the same scene", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");

    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${target}/retry` }),
      app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${target}/retry` }),
    ]);
    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = first.statusCode === 409 ? first : second;
    expect(loser.json()).toMatchObject({ reason: "not-failed" });
  });

  it("gives exactly one 200 and one 409 not-failed for a retry racing a correction of the same scene", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");

    const [retry, correct] = await Promise.all([
      app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${target}/retry` }),
      app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/scenes/${target}/correct`,
        payload: { instruction: "racing correction" },
      }),
    ]);
    const statuses = [retry.statusCode, correct.statusCode].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = retry.statusCode === 409 ? retry : correct;
    expect(loser.json()).toMatchObject({ reason: "not-failed" });
  });
});

// retry-or-correct-image (JOS-157), design Decisions 3-5 — a correction changes exactly IMAGE.
describe("A correction changes only IMAGE (JOS-157, design Decisions 3-5)", () => {
  it("sets image_instruction to the trimmed value on a real chunk, and the legacy instruction is untouched", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");
    const before = getScenesForRun(sessionId).find((s) => s.id === target)!;

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: { instruction: "  a trimmed instruction  " },
    });

    expect(res.statusCode).toBe(200);
    const after = getScenesForRun(sessionId).find((s) => s.id === target)!;
    expect(after.imageInstruction).toBe("a trimmed instruction");
    expect(after.instruction).toBe(before.instruction);
  });

  it("corrects the legacy instruction, never image_instruction, for a skeleton scene with no IMAGE", async () => {
    const { sessionId } = await sessionWithChunks();
    const skeletonSceneId = randomUUID();
    createScene(skeletonSceneId, sessionId, 9, "success", 10, "original skeleton instruction");
    markSceneFailed(skeletonSceneId, "the provider failed");

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${skeletonSceneId}/correct`,
      payload: { instruction: "corrected skeleton instruction" },
    });

    expect(res.statusCode).toBe(200);
    const after = getScenesForRun(sessionId).find((s) => s.id === skeletonSceneId)!;
    expect(after.instruction).toBe("corrected skeleton instruction");
    expect(after.imageInstruction).toBe("");
  });

  it("changes only image_instruction, status, attempts and updated_at on the corrected scene, and nothing on other scenes", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");
    db.prepare("UPDATE scenes SET attempts = 3 WHERE id = ?").run(target); // nonzero, so the reset on correction is visible in the diff
    const beforeAll = getScenesForRun(sessionId);

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: { instruction: "a snapshot-checked instruction" },
    });
    expect(res.statusCode).toBe(200);

    const afterAll = getScenesForRun(sessionId);
    for (const after of afterAll) {
      const before = beforeAll.find((s) => s.id === after.id)!;
      if (after.id !== target) {
        expect(after).toEqual(before);
        continue;
      }
      const changedKeys = (Object.keys(after) as Array<keyof typeof after>).filter(
        (key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]),
      );
      expect(changedKeys.sort()).toEqual(["attempts", "imageInstruction", "status", "updatedAt"].sort());
    }
  });

  it.each([{ instruction: "" }, { instruction: "   " }])(
    "answers 400 for a blank or whitespace-only correction body %j and leaves the scene unchanged",
    async (payload) => {
      const { sessionId, sceneIds } = await sessionWithChunks();
      const target = sceneIds[0]!;
      markSceneFailed(target, "the provider failed");
      const before = getScenesForRun(sessionId).find((s) => s.id === target);

      const res = await app.inject({ method: "POST", url: `/sessions/${sessionId}/scenes/${target}/correct`, payload });

      expect(res.statusCode).toBe(400);
      expect(getScenesForRun(sessionId).find((s) => s.id === target)).toEqual(before);
    },
  );

  // An extra field is read nowhere and so changes nothing — the same "ignores locked fields" convention
  // every other chunk-mutating route follows (consult-session AC1), not a 400 (see routes.ts's correctBodySchema).
  it("ignores an extra field in the correction body rather than rejecting it", async () => {
    const { sessionId, sceneIds } = await sessionWithChunks();
    const target = sceneIds[0]!;
    markSceneFailed(target, "the provider failed");

    const res = await app.inject({
      method: "POST",
      url: `/sessions/${sessionId}/scenes/${target}/correct`,
      payload: { instruction: "ok", extra: "not allowed" },
    });

    expect(res.statusCode).toBe(200);
    expect(getScenesForRun(sessionId).find((s) => s.id === target)?.imageInstruction).toBe("ok");
  });
});
