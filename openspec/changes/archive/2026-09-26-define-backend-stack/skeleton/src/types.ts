// Domain types for the walking skeleton. Deliberately narrow: one generic
// provider-backed stage ("IMAGE") stands in for the PRD's five stages, since
// the experiments prove mechanisms (retry, concurrency, resumption,
// idempotency, live push, pause/continue, correction, session/scene state
// shape), not the full five-stage product state machine.
//
// State names below are the REAL PRD vocabulary (§8.1, §8.2), not
// skeleton-invented labels, so the event contract this change (JOS-183) and
// the frontend (JOS-180) build against is the real one. Only the subset of
// values a single generic stage can actually reach is ever produced:
// SceneState never reaches "video-generating" (there is no second real
// stage), and SessionState never reaches the voice/decomposition phases
// (those aren't modelled either). This is recorded as an explicit
// simplification, not silently passed off as the full model.

export const STAGE = "image" as const;
export type Stage = typeof STAGE;

/** PRD §8.2 — the six chunk states. This skeleton only ever produces
 * "submitted", "image-generating", "chunk-complete" and "failed". */
export type SceneState =
  | "submitted"
  | "image-generating"
  | "image-complete"
  | "video-generating"
  | "chunk-complete"
  | "failed";

/** PRD §8.1 — the eight session states. This skeleton only ever produces
 * "chunks-processing", "final-video" and "failed" (no voice/decomposition
 * phases are modelled). */
export type SessionState =
  | "submitted"
  | "voice-over-generating"
  | "voice-over-complete"
  | "chunk-decomposing"
  | "chunks-processing"
  | "final-video-generating"
  | "final-video"
  | "failed";

export interface Run {
  id: string;
  title: string;
  createdAt: string;
  /** PRD §9 — a marker on top of the current state, never a state itself. */
  paused: boolean;
  /** PRD §4.1 — selected from the hardcoded supported list; no provider is called before it's set. */
  language: string;
  /** PRD §12.2 — the real per-project folder name under `PROJECTS_ROOT`, derived from title + creation time to the minute. */
  projectFolder: string;
}

export interface Scene {
  id: string;
  runId: string;
  index: number;
  status: SceneState;
  attempts: number;
  lastError: string | null;
  result: string | null;
  updatedAt: string;
  /** The visual instruction, correctable only while the affected stage is `failed` (PRD §10.3). */
  instruction: string;
  provider: string;
  /** Configured at scene creation so automatic retries can reuse the same behaviour. */
  providerMode: ProviderOutcomeMode;
  providerLatencyMs: number;
}

/**
 * Outcome the stubbed provider can be configured to produce for a given
 * request. "flaky" fails transiently on the first attempt(s) and then
 * succeeds, to exercise the retry budget without exhausting it.
 */
export const PROVIDER_OUTCOME_MODES = [
  "success",
  "transient_failure",
  "not_retryable_failure",
  "unrecoverable", // the provider loses the request entirely (simulates it not holding a result after our restart)
  "flaky",
] as const;

export type ProviderOutcomeMode = (typeof PROVIDER_OUTCOME_MODES)[number];

export const STUB_PROVIDER_NAME = "stub-image-provider";

export type ProviderOutcome =
  | { kind: "success"; result: string }
  | { kind: "failed_transient"; reason: string }
  | { kind: "failed_not_retryable"; reason: string };

export interface ProviderRequestRow {
  id: string;
  sceneId: string;
  sentAt: string;
  latencyMs: number;
  mode: ProviderOutcomeMode;
  attemptNumber: number;
  resolved: 0 | 1;
}

// ---- Wire contract (define-live-updates, JOS-183, Decisions 2/4/8) ----

/** Session event / snapshot field — carries CURRENT state, never a delta. */
export interface SessionEventPayload {
  type: "session";
  sessionId: string;
  title: string;
  language: string;
  state: SessionState;
  paused: boolean; // Decision 8 — always its own field, never folded into `state`
  failedPhase?: string;
  updatedAt: string;
}

/** Scene event / snapshot entry — carries CURRENT state, never a delta. */
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
