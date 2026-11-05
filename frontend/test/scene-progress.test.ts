import { describe, expect, it } from "vitest";
import { formatSceneNumbers, summariseSceneProgress } from "../src/sceneProgress";
import type { SceneEventPayload } from "../src/types";

// summarise-scene-progress (JOS-234), design Decisions 1, 3 and 5 — the project panel's counts and scene numbers,
// derived from each scene's state alone.

describe("formatSceneNumbers", () => {
  it("is empty for no scenes", () => {
    expect(formatSceneNumbers([])).toBe("");
  });

  it("shows a single scene as its number", () => {
    expect(formatSceneNumbers([7])).toBe("7");
  });

  it("collapses consecutive numbers into a range", () => {
    expect(formatSceneNumbers([3, 4, 5])).toBe("3–5");
  });

  it("collapses two consecutive numbers too", () => {
    expect(formatSceneNumbers([4, 5])).toBe("4–5");
  });

  it("separates ranges and single numbers with commas", () => {
    expect(formatSceneNumbers([3, 4, 5, 8, 12])).toBe("3–5, 8, 12");
  });

  it("sorts its input ascending", () => {
    expect(formatSceneNumbers([9, 2, 3])).toBe("2–3, 9");
  });
});

type SceneInput = Pick<SceneEventPayload, "index" | "state" | "affectedStage">;

function scenes(states: Array<[SceneEventPayload["state"], number, SceneEventPayload["affectedStage"]?]>): SceneInput[] {
  return states.map(([state, index, affectedStage]) => ({ state, index, affectedStage }));
}

function lineOf(summary: ReturnType<typeof summariseSceneProgress>, key: string) {
  return summary.find((line) => line.key === key);
}

describe("summariseSceneProgress", () => {
  // The spec's ten-scene example: 3 done, 2 queued, 1 generating an image, 2 image ready, 1 generating a clip, 1 failed at image.
  const mixed = scenes([
    ["chunk-complete", 1],
    ["chunk-complete", 2],
    ["chunk-complete", 3],
    ["submitted", 4],
    ["submitted", 5],
    ["image-generating", 6],
    ["image-complete", 7],
    ["image-complete", 8],
    ["video-generating", 9],
    ["failed", 10, "image"],
  ]);

  it("counts every stage for a session in several stages", () => {
    const summary = summariseSceneProgress(mixed);

    expect(summary.map((line) => [line.key, line.count])).toEqual([
      ["done", 3],
      ["queued", 2],
      ["generating-image", 1],
      ["image-ready", 2],
      ["generating-clip", 1],
      ["failed-image", 1],
      ["images-left", 4],
      ["clips-left", 7],
    ]);
  });

  it("carries the total on the Done line only", () => {
    const summary = summariseSceneProgress(mixed);

    expect(lineOf(summary, "done")?.total).toBe(10);
    expect(summary.filter((line) => line.total !== undefined)).toHaveLength(1);
  });

  it("lists scene numbers on the in-progress and failed lines only", () => {
    const summary = summariseSceneProgress(mixed);

    expect(lineOf(summary, "generating-image")?.numbers).toBe("6");
    expect(lineOf(summary, "image-ready")?.numbers).toBe("7–8");
    expect(lineOf(summary, "generating-clip")?.numbers).toBe("9");
    expect(lineOf(summary, "failed-image")?.numbers).toBe("10");
    for (const key of ["done", "queued", "images-left", "clips-left"]) {
      expect(lineOf(summary, key)?.numbers).toBeUndefined();
    }
  });

  it("omits a line whose count is zero, except Done", () => {
    const summary = summariseSceneProgress(scenes([["image-generating", 1], ["submitted", 2]]));

    expect(summary.map((line) => line.key)).toEqual(["done", "queued", "generating-image", "images-left", "clips-left"]);
    expect(lineOf(summary, "done")?.count).toBe(0);
  });

  it("splits failed scenes by the stage that failed", () => {
    const summary = summariseSceneProgress(scenes([["failed", 3, "image"], ["failed", 5, "video"], ["failed", 6, "video"]]));

    expect(lineOf(summary, "failed-image")).toMatchObject({ count: 1, numbers: "3" });
    expect(lineOf(summary, "failed-clip")).toMatchObject({ count: 2, numbers: "5–6" });
    // A scene failed at clip has its image; only the one failed at image is still owed one.
    expect(lineOf(summary, "images-left")?.count).toBe(1);
    expect(lineOf(summary, "clips-left")?.count).toBe(3);
  });

  it("counts a failed scene with no named stage as failed at image", () => {
    const summary = summariseSceneProgress(scenes([["failed", 2]]));

    expect(lineOf(summary, "failed-image")?.count).toBe(1);
    expect(lineOf(summary, "failed-clip")).toBeUndefined();
  });

  it("sorts scene numbers ascending whatever order the scenes arrive in", () => {
    const summary = summariseSceneProgress(scenes([["video-generating", 9], ["video-generating", 2], ["video-generating", 3]]));

    expect(lineOf(summary, "generating-clip")?.numbers).toBe("2–3, 9");
  });

  it("shows only Done when every scene is done", () => {
    const summary = summariseSceneProgress(scenes([["chunk-complete", 1], ["chunk-complete", 2]]));

    expect(summary).toEqual([expect.objectContaining({ key: "done", count: 2, total: 2 })]);
  });

  it("is empty when there are no scenes", () => {
    expect(summariseSceneProgress([])).toEqual([]);
  });

  it("words the lines like the scene cards", () => {
    const summary = summariseSceneProgress(mixed);

    expect(lineOf(summary, "generating-image")?.label).toBe("Generating image");
    expect(lineOf(summary, "generating-clip")?.label).toBe("Generating clip");
    expect(lineOf(summary, "done")?.label).toBe("Done");
    expect(lineOf(summary, "image-ready")?.label).toBe("Image ready, waiting for a clip slot");
    expect(lineOf(summary, "queued")?.label).toBe("Queued for image");
    expect(lineOf(summary, "failed-image")?.label).toBe("Failed at image");
  });
});
