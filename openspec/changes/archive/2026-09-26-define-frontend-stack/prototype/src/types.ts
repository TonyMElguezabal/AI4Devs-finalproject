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
  updatedAt: string;
}

export interface SessionSnapshot {
  session: SessionEventPayload;
  scenes: SceneEventPayload[];
}

/**
 * Placeholder pending `define-provider-configuration` (US-33, JOS-165),
 * which owns the real hardcoded supported-language list (PRD §11, D09).
 * This prototype only needs *a* hardcoded list to prove "no session
 * startable without a language" (task 2.1, AC01) — these are not a product
 * decision.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
] as const;
