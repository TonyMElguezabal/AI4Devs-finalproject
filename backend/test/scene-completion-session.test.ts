import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createRun, db, getRun, getScenesForRun, resetAll } from "../src/db.ts";
import { deriveSessionState } from "../src/orchestrator.ts";
import { registerDecomposition, type SegmentedFragment } from "../src/sceneRegistration.ts";
import type { SceneState } from "../src/types.ts";
import type { VisualInstructionGenerator } from "../src/visualInstructions.ts";

// gate-assembly-on-complete-scenes (JOS-150), group 3 — design Decisions 2-4,
// PRD §8.1 v1.3: the session state derived from its scenes. Scene states that no
// running code produces yet (`video-generating`, `chunk-complete`) are forced
// directly, as scene-registration-session.test.ts already does.

const generator: VisualInstructionGenerator = {
  async generate(texts) {
    return { kind: "success", pairs: texts.map((_, i) => ({ image: `image ${i + 1}`, video: `video ${i + 1}` })) };
  },
};

beforeEach(() => {
  resetAll();
});

/** Registers one scene per status and forces each scene to its status (index 1..n). */
async function runWithScenes(statuses: readonly SceneState[]): Promise<string> {
  const runId = randomUUID();
  const script = statuses.map((_, i) => `Fragment number ${i + 1}.`).join(" ");
  createRun(runId, "Completion test", script, "en");
  const fragments: SegmentedFragment[] = statuses.map((_, i) => ({
    text: `Fragment number ${i + 1}.`,
    narrationInterval: { startSeconds: i * 5, endSeconds: (i + 1) * 5 },
  }));
  await registerDecomposition(runId, fragments, generator, statuses.length * 5);
  getScenesForRun(runId).forEach((scene, i) => {
    db.prepare("UPDATE scenes SET status = ? WHERE id = ?").run(statuses[i] ?? "submitted", scene.id);
  });
  return runId;
}

const derive = (runId: string, hasFinalVideo?: boolean) =>
  deriveSessionState(getScenesForRun(runId), getRun(runId)?.failure, hasFinalVideo === undefined ? {} : { hasFinalVideo });

describe("While any scene is still generating", () => {
  it("derives chunks-processing for a failed scene beside one generating its clip", async () => {
    const runId = await runWithScenes(["failed", "video-generating"]);
    expect(derive(runId)).toEqual({ state: "chunks-processing" });
  });

  it("derives chunks-processing for a failed scene beside one not yet started", async () => {
    const runId = await runWithScenes(["failed", "submitted"]);
    expect(derive(runId)).toEqual({ state: "chunks-processing" });
  });

  it("does not name failed scenes while the session is still processing", async () => {
    const runId = await runWithScenes(["failed", "image-complete", "chunk-complete"]);
    expect(derive(runId).failedSceneIndexes).toBeUndefined();
  });
});

describe("When no scene is still generating and one failed", () => {
  it("derives failed with failed phase scenes and the failed scene indexes", async () => {
    const runId = await runWithScenes(["chunk-complete", "failed", "chunk-complete"]);
    expect(derive(runId)).toEqual({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [2] });
  });

  it("lists several failed scenes in ascending order", async () => {
    const runId = await runWithScenes(["failed", "chunk-complete", "chunk-complete", "failed"]);
    expect(derive(runId)).toEqual({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [1, 4] });
  });

  it("derives failed when every scene failed", async () => {
    const runId = await runWithScenes(["failed", "failed"]);
    expect(derive(runId)).toEqual({ state: "failed", failedPhase: "scenes", failedSceneIndexes: [1, 2] });
  });
});

describe("When every scene is complete", () => {
  it("derives final-video-generating, not final-video, while no final video exists", async () => {
    const runId = await runWithScenes(["chunk-complete", "chunk-complete"]);
    expect(derive(runId)).toEqual({ state: "final-video-generating" });
    expect(derive(runId, false)).toEqual({ state: "final-video-generating" });
  });

  it("derives final-video once a final video exists", async () => {
    const runId = await runWithScenes(["chunk-complete", "chunk-complete"]);
    expect(derive(runId, true)).toEqual({ state: "final-video" });
  });
});

describe("A session without scenes", () => {
  it("keeps a decomposition failure as is, without failed scene indexes", () => {
    const runId = randomUUID();
    createRun(runId, "No scenes", "Some script.", "en");
    const failure = { phase: "decomposition", cause: "refused", retryable: false, occurredAt: new Date().toISOString() } as const;
    const derived = deriveSessionState([], failure);
    expect(derived).toEqual({ state: "failed", failedPhase: "decomposition" });
    expect(derived.failedSceneIndexes).toBeUndefined();
  });
});
