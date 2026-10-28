import type { SceneEventPayload, SessionState } from "./types";

export interface SceneActions {
  retry: boolean;
  correctImage: boolean;
  correctVideo: boolean;
  /** rebuild-scene (JOS-235) — regenerate a generated scene's image and clip. */
  rebuild: boolean;
}

/**
 * show-scene-results-and-actions (JOS-151), Decision 4 — the one place scene
 * actions are derived, from state and affected stage, never from a stored
 * flag (PRD §10.3). JOS-158 adds the same actions for a failed video stage,
 * with correction remaining limited to that stage's instruction.
 *
 * rebuild-scene (JOS-235), Decision 9 — "Rebuild scene" is offered for a scene that has its image (`image-complete`, before
 * its clip request is sent) or is complete, except while the session is assembling its final video. Any other state has
 * work in flight (never cancelled, PRD §2.3) or keeps the failure actions above.
 */
export function sceneActions(scene: SceneEventPayload, sessionState?: SessionState): SceneActions {
  const imageFailed = scene.state === "failed" && scene.affectedStage === "image";
  const videoFailed = scene.state === "failed" && scene.affectedStage === "video";
  const generated = scene.state === "image-complete" || scene.state === "chunk-complete";
  return {
    retry: imageFailed || videoFailed,
    correctImage: imageFailed,
    correctVideo: videoFailed,
    rebuild: generated && sessionState !== "final-video-generating",
  };
}
