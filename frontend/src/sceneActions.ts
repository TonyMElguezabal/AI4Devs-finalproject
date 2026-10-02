import type { SceneEventPayload } from "./types";

export interface SceneActions {
  retry: boolean;
  correctImage: boolean;
}

/**
 * show-scene-results-and-actions (JOS-151), Decision 4 — the one place scene
 * actions are derived, from state and affected stage, never from a stored
 * flag (PRD §10.3). A clip failure offers nothing until clip retry and
 * correction exist (JOS-158), which extends this helper.
 */
export function sceneActions(scene: SceneEventPayload): SceneActions {
  const imageFailed = scene.state === "failed" && scene.affectedStage === "image";
  return { retry: imageFailed, correctImage: imageFailed };
}
