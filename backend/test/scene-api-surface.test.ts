import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { getScenesForRun, markSceneFailed, resetAll } from "../src/db.ts";
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
      { text: "The harbor is quiet at dusk.", narratedDurationSeconds: 6 },
      { text: "Fishing boats return with the tide.", narratedDurationSeconds: 9 },
    ],
    generator,
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
