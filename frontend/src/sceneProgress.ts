import { SCENE_STATE_LABEL } from "./statusLabels";
import type { SceneEventPayload } from "./types";

// summarise-scene-progress (JOS-234), design Decisions 1, 3 and 5 — the project panel's scene summary. A pure
// derivation from each scene's `state`, `index` and `affectedStage`, which the page already receives; nothing is
// stored or fetched, so a live snapshot recomputes it for free.

type SceneInput = Pick<SceneEventPayload, "index" | "state" | "affectedStage">;

export interface SceneProgressLine {
  key: string;
  label: string;
  count: number;
  /** Only the Done line: the session's scene count, shown as "N of total". */
  total?: number;
  /** Scene numbers as ranges ("3–5, 8"); present only on the in-progress and failed lines. */
  numbers?: string;
}

/** Scene numbers, ascending, with two or more consecutive ones collapsed into a range ("3–5, 8, 12"). */
export function formatSceneNumbers(indexes: readonly number[]): string {
  const sorted = [...indexes].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let start = 0; start < sorted.length; ) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end]! + 1) end += 1;
    parts.push(end > start ? `${sorted[start]}–${sorted[end]}` : String(sorted[start]));
    start = end + 1;
  }
  return parts.join(", ");
}

function indexesOf(scenes: readonly SceneInput[], matches: (scene: SceneInput) => boolean): number[] {
  return scenes.filter(matches).map((scene) => scene.index);
}

/** The summary lines, in display order; an empty list when there are no scenes. */
export function summariseSceneProgress(scenes: readonly SceneInput[]): SceneProgressLine[] {
  if (scenes.length === 0) return [];

  const done = indexesOf(scenes, (scene) => scene.state === "chunk-complete");
  const queued = indexesOf(scenes, (scene) => scene.state === "submitted");
  const generatingImage = indexesOf(scenes, (scene) => scene.state === "image-generating");
  const imageReady = indexesOf(scenes, (scene) => scene.state === "image-complete");
  const generatingClip = indexesOf(scenes, (scene) => scene.state === "video-generating");
  // A failed scene with no named stage has no clip to blame: it counts at the image, as a scene with no stored image does.
  const failedClip = indexesOf(scenes, (scene) => scene.state === "failed" && scene.affectedStage === "video");
  const failedImage = indexesOf(scenes, (scene) => scene.state === "failed" && scene.affectedStage !== "video");

  const withNumbers = (key: string, label: string, indexes: number[]): SceneProgressLine => ({
    key,
    label,
    count: indexes.length,
    numbers: formatSceneNumbers(indexes),
  });

  const lines: Array<SceneProgressLine | null> = [
    { key: "done", label: SCENE_STATE_LABEL["chunk-complete"], count: done.length, total: scenes.length },
    queued.length > 0 ? { key: "queued", label: `${SCENE_STATE_LABEL.submitted} for image`, count: queued.length } : null,
    generatingImage.length > 0 ? withNumbers("generating-image", SCENE_STATE_LABEL["image-generating"], generatingImage) : null,
    imageReady.length > 0 ? withNumbers("image-ready", `${SCENE_STATE_LABEL["image-complete"]}, waiting for a clip slot`, imageReady) : null,
    generatingClip.length > 0 ? withNumbers("generating-clip", SCENE_STATE_LABEL["video-generating"], generatingClip) : null,
    failedImage.length > 0 ? withNumbers("failed-image", `${SCENE_STATE_LABEL.failed} at image`, failedImage) : null,
    failedClip.length > 0 ? withNumbers("failed-clip", `${SCENE_STATE_LABEL.failed} at clip`, failedClip) : null,
  ];

  const imagesLeft = queued.length + generatingImage.length + failedImage.length;
  const clipsLeft = scenes.length - done.length;
  if (imagesLeft > 0) lines.push({ key: "images-left", label: "Images left", count: imagesLeft });
  if (clipsLeft > 0) lines.push({ key: "clips-left", label: "Clips left", count: clipsLeft });

  return lines.filter((line): line is SceneProgressLine => line !== null);
}
