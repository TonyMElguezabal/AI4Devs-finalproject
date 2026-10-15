import type { SceneEventPayload, SceneState, SessionState } from "./types";

// redesign-visual-design (JOS-198), design Decision 3 — the one place a wire state becomes words, so a card, a
// header and a pill cannot word it differently. Mirrors `phaseLabels.ts`. The raw state string is never shown;
// colour and icon only reinforce the label (define-visual-design, Decision 3).

export const SCENE_STATE_LABEL: Record<SceneState, string> = {
  submitted: "Queued",
  "image-generating": "Generating image",
  "image-complete": "Image ready",
  "video-generating": "Generating clip",
  "chunk-complete": "Done",
  failed: "Failed",
};

export const SESSION_STATE_LABEL: Record<SessionState, string> = {
  submitted: "Registered",
  "voice-over-generating": "Recording voice-over",
  "voice-over-complete": "Voice-over ready",
  "chunk-decomposing": "Splitting into scenes",
  "chunks-processing": "Generating scenes",
  "final-video-generating": "Assembling final video",
  "final-video": "Final video ready",
  failed: "Needs attention",
};

/** The failed stage of a scene, in the User's words (`image` / `video` are the wire names). */
export const AFFECTED_STAGE_LABEL: Record<NonNullable<SceneEventPayload["affectedStage"]>, string> = {
  image: "Image",
  video: "Clip",
};

// The wire contract's own definitions (types.ts): `durationWarning` is set "only when the interval was narrated
// longer than the largest admitted duration", `speedFactorWarning` "only when the factor exceeds the hardcoded
// acceptable limit". No number is repeated here: the limit lives in the backend.
export const DURATION_WARNING_TEXT = "The narrated interval is longer than the longest clip duration the provider offers.";
export const SPEED_WARNING_TEXT = "The speed adjustment this clip needs is above the acceptable limit.";
