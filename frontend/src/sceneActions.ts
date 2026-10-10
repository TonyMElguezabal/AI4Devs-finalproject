import type { SceneEventPayload } from "./types";

export interface SceneActions {
  retry: boolean;
  correctImage: boolean;
  correctVideo: boolean;
}

/**
 * show-scene-results-and-actions (JOS-151), Decision 4 — the one place scene
 * actions are derived, from state and affected stage, never from a stored
 * flag (PRD §10.3). JOS-158 adds the same actions for a failed video stage,
 * with correction remaining limited to that stage's instruction.
 */
export function sceneActions(scene: SceneEventPayload): SceneActions {
  const imageFailed = scene.state === "failed" && scene.affectedStage === "image";
  const videoFailed = scene.state === "failed" && scene.affectedStage === "video";
  return { retry: imageFailed || videoFailed, correctImage: imageFailed, correctVideo: videoFailed };
}
