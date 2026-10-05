import type { PhaseStatus, SceneState, SessionState } from "../types";

/**
 * The one shared status-to-style mapping every component draws from
 * (design.md Decision 2). A component derives its status class from
 * `scene.state` / `session.state` at render time here — never a locally
 * stored flag, and never a hardcoded color literal in the component itself.
 */
export type StatusClass = "status-complete" | "status-progress" | "status-failed" | "status-queued";

const SCENE_STATE_TO_CLASS: Record<SceneState, StatusClass> = {
  submitted: "status-queued",
  "image-generating": "status-progress",
  "image-complete": "status-progress",
  "video-generating": "status-progress",
  "chunk-complete": "status-complete",
  failed: "status-failed",
};

const SESSION_STATE_TO_CLASS: Record<SessionState, StatusClass> = {
  submitted: "status-queued",
  "voice-over-generating": "status-progress",
  "voice-over-complete": "status-progress",
  "chunk-decomposing": "status-progress",
  "chunks-processing": "status-progress",
  "final-video-generating": "status-progress",
  "final-video": "status-complete",
  failed: "status-failed",
};

const PHASE_STATUS_TO_CLASS: Record<PhaseStatus, StatusClass> = {
  pending: "status-queued",
  "in-progress": "status-progress",
  complete: "status-complete",
  failed: "status-failed",
};

export function phaseStatusClass(status: PhaseStatus): StatusClass {
  return PHASE_STATUS_TO_CLASS[status];
}

export function sceneStatusClass(state: SceneState): StatusClass {
  return SCENE_STATE_TO_CLASS[state];
}

export function sessionStatusClass(state: SessionState): StatusClass {
  return SESSION_STATE_TO_CLASS[state];
}
