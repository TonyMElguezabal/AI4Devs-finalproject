// Mirrors the wire contract defined in `define-live-updates` (JOS-183) and
// implemented in the `define-backend-stack` skeleton
// (`openspec/changes/define-backend-stack/skeleton/src/types.ts`). No
// generated client exists yet (design.md § Execution Record §1, task 1.3),
// so these are hand-written for the prototype; keep them in sync by hand
// until that question is settled.

export type SceneState =
  | "submitted"
  | "image-generating"
  | "image-complete"
  | "video-generating"
  | "chunk-complete"
  | "failed";

export type SessionState =
  | "submitted"
  | "voice-over-generating"
  | "voice-over-complete"
  | "chunk-decomposing"
  | "chunks-processing"
  | "final-video-generating"
  | "final-video"
  | "failed";

export interface SessionEventPayload {
  type: "session";
  sessionId: string;
  title: string;
  /** PRD §4.2/D10 — write-once from registration onward (start-video-project, JOS-134). */
  script: string;
  language: string;
  state: SessionState;
  paused: boolean;
  failedPhase?: string;
  updatedAt: string;
}

export interface SceneEventPayload {
  type: "scene";
  sessionId: string;
  sceneId: string;
  index: number;
  state: SceneState;
  affectedStage?: "image" | "video";
  errorCause?: string | null;
  provider?: string;
  attempts?: number;
  result?: { imageUrl?: string; videoUrl?: string };
  instruction?: string;
  /** PRD §7.2: the admitted clip duration requested for this chunk; absent for a scene created without a decomposition (request-admitted-clip-duration, JOS-147). */
  requestedDurationSeconds?: number;
  /** Set only when the interval was narrated longer than the largest admitted duration (§6.1.1). */
  durationWarning?: "exceeds-maximum";
  /** PRD §7.2/AC23: the speed-adjustment factor the requested duration implies, always >= 1 (record-speed-adjustment-factor, JOS-148). */
  speedFactor?: number;
  /** Set only when the factor exceeds the hardcoded acceptable limit. Independent of durationWarning. */
  speedFactorWarning?: "exceeds-limit";
  updatedAt: string;
}

export interface SessionSnapshot {
  session: SessionEventPayload;
  scenes: SceneEventPayload[];
}

// The supported-language list is no longer hardcoded here (start-video-project,
// JOS-134, Decision 5): it is fetched from the backend's `GET /languages` at
// runtime (src/api/client.ts's `fetchLanguages`), which is itself provisional
// pending `define-provider-configuration` (US-33, JOS-165) — see
// backend/src/config/languages.ts for that note. One source, not two.
