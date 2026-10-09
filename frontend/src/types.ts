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

/** view-progress-by-phase (JOS-168) — the four processing phases, in pipeline order. */
export type Phase = "voice-over" | "decomposition" | "scenes" | "assembly";
export type PhaseStatus = "pending" | "in-progress" | "complete" | "failed";

/** see-provider-and-attempts (JOS-166) — what one stage used and how often it ran; nothing else of an attempt reaches the page. */
export type DiagnosticStage = "image" | "video" | "voice-over" | "timestamps" | "instructions" | "assembly";
export interface StageDiagnostic {
  stage: DiagnosticStage;
  provider: { name: string; model: string | null };
  /** Attempts across every retry cycle, including one still in flight. */
  attempts: number;
}

export interface PhaseProgress {
  phase: Phase;
  status: PhaseStatus;
  /** Work units a pause is holding for this phase; 0 when not paused. */
  heldCount: number;
  /** Only on a failed voice-over, decomposition or assembly entry. */
  failure?: { cause: string; retryable: boolean };
  /** JOS-166 — the session-level stages of this phase that have run, in pipeline order. */
  stages: StageDiagnostic[];
}

export interface SessionEventPayload {
  type: "session";
  sessionId: string;
  title: string;
  /** PRD §4.2/D10 — write-once from registration onward (start-video-project, JOS-134). */
  script: string;
  language: string;
  state: SessionState;
  paused: boolean;
  held: Array<{ stage: string; count: number }>;
  /** JOS-153 — stages with work actually in flight, computed whether or not the session is paused. */
  running: Array<{ stage: string; count: number }>;
  failedPhase?: string;
  /** JOS-150 — the failed scenes' indexes, ascending; present only when `failedPhase` is "scenes". */
  failedSceneIndexes?: number[];
  /** JOS-168 — always the four phases in pipeline order; the page derives no phase status of its own. */
  phases: PhaseProgress[];
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
  /** JOS-166 — per stage; a key is present once that stage has at least one attempt. */
  stages: { image?: StageDiagnostic; video?: StageDiagnostic };
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
  held?: boolean;
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
