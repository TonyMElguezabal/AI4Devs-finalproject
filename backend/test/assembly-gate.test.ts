import { describe, expect, it } from "vitest";
import { assemblyGate, isSceneSettled } from "../src/assemblyGate.ts";
import type { SceneState } from "../src/types.ts";

// gate-assembly-on-complete-scenes (JOS-150), group 2 — design Decisions 1 and
// 2, PRD §7.3, AC10 and AC12: assembly may start only when there is at least
// one scene and every scene is `chunk-complete`; otherwise the gate stays
// closed and names the scenes still processing and the scenes that failed.

const scene = (index: number, status: SceneState) => ({ index, status });

const NON_FINAL_STATES: readonly SceneState[] = [
  "submitted",
  "image-generating",
  "image-complete",
  "video-generating",
];

describe("isSceneSettled", () => {
  it.each(["chunk-complete", "failed"] as const)("treats %s as settled", (status) => {
    expect(isSceneSettled(status)).toBe(true);
  });

  it.each(NON_FINAL_STATES)("treats %s as still generating", (status) => {
    expect(isSceneSettled(status)).toBe(false);
  });
});

describe("assemblyGate", () => {
  it("is open when every scene is chunk-complete", () => {
    expect(assemblyGate([scene(1, "chunk-complete"), scene(2, "chunk-complete")])).toEqual({ open: true });
  });

  it("is closed for an empty scene list", () => {
    expect(assemblyGate([])).toEqual({ open: false, processingSceneIndexes: [], failedSceneIndexes: [] });
  });

  it("is closed and reports the failed scene when one scene failed", () => {
    expect(assemblyGate([scene(1, "chunk-complete"), scene(2, "failed"), scene(3, "chunk-complete")])).toEqual({
      open: false,
      processingSceneIndexes: [],
      failedSceneIndexes: [2],
    });
  });

  it.each(NON_FINAL_STATES)("is closed and reports a scene that is %s as still processing", (status) => {
    expect(assemblyGate([scene(1, "chunk-complete"), scene(2, "chunk-complete"), scene(3, status)])).toEqual({
      open: false,
      processingSceneIndexes: [3],
      failedSceneIndexes: [],
    });
  });

  it("reports both lists when a scene failed and another is still processing", () => {
    expect(assemblyGate([scene(1, "failed"), scene(2, "video-generating")])).toEqual({
      open: false,
      processingSceneIndexes: [2],
      failedSceneIndexes: [1],
    });
  });

  it("reports both lists in ascending order when the scenes are given out of order", () => {
    const result = assemblyGate([
      scene(5, "failed"),
      scene(3, "submitted"),
      scene(1, "failed"),
      scene(4, "video-generating"),
      scene(2, "chunk-complete"),
    ]);
    expect(result).toEqual({ open: false, processingSceneIndexes: [3, 4], failedSceneIndexes: [1, 5] });
  });
});
