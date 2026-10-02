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
  /** PRD §4.2/D10 — write-once from registration onward (start-video-project, JOS-134, Decision 2). Stored exactly as submitted, never trimmed (Decision 1). */
  script: string;
  createdAt: string;
  /** PRD §9 — a marker on top of the current state, never a state itself. */
  paused: boolean;
  /** PRD §4.1 — selected from the hardcoded supported list; no provider is called before it's set. */
  language: string;
  /** PRD §12.2 — the real per-project folder name under `PROJECTS_ROOT`, derived from title + creation time to the minute. */
  projectFolder: string;
  /** PRD §11.2 — the voice provider bound on the first voice attempt; write-once (generate-voice-over, JOS-136, Decision 3). */
  voiceProviderId: string | null;
  /** The phase failure the session carries when it is `failed` (generate-voice-over, JOS-136, Decision 9; assign-scene-identifiers, JOS-144, Decision 6). */
  failure: SessionFailure | null;
}

/** Design Decision 9 (generate-voice-over, JOS-136) — what the session carries when the voice-over failed. */
/** assign-scene-identifiers (JOS-144) Decision 6 — an invalid system-generated decomposition (PRD §6, §6.1), attributed to the system, never to the User's script. */
export interface DecompositionFailure {
  phase: "decomposition";
  /** Written for a person; never blames the script, never contains credentials or raw provider payloads. */
  cause: string;
  retryable: boolean;
  /** ISO-8601 instant. */
  occurredAt: string;
}

export type SessionFailure = VoiceOverFailure | DecompositionFailure;

export interface VoiceOverFailure {
  phase: "voice-over";
  /** Written for a person; never contains credentials or the script text. */
  cause: string;
  retryable: boolean;
  /** ISO-8601 instant. */
  occurredAt: string;
}

/** The session's single narration (generate-voice-over, JOS-136, Decisions 6 and 8). Paths are relative to the session's project folder (§12.2). */
export interface VoiceOverInput {
  runId: string;
  audioPath: string;
  /** The provider's native timestamps, stored raw and uninterpreted; null when it returned none. */
  timestampsPath: string | null;
  /** Measured from the stored MP3, not the provider's claim (Decision 7). */
  durationSeconds: number;
  sizeBytes: number;
  nativeTimestampsAvailable: boolean;
  providerRequestId: string | null;
  completedAt: string;
}

export type VoiceOver = VoiceOverInput;

/** The stages that record attempts at session level (`timestamps`: obtain-narration-timestamps, JOS-139). Later stories add their own. */
export type AttemptStage = "voice-over" | "timestamps";

/** How the narration timestamps were obtained (PRD §11.1). */
export type TimestampMechanism = "native" | "alignment";

/** The narration timestamps of a session, stored once (obtain-narration-timestamps, JOS-139, Decision 7). `path` is relative to the project folder. */
export interface NarrationTimestampsInput {
  runId: string;
  mechanism: TimestampMechanism;
  path: string;
  characterCount: number;
  obtainedAt: string;
}

export type NarrationTimestamps = NarrationTimestampsInput;

export const STAGE_ATTEMPT_OUTCOMES = ["in-flight", "success", "transient", "not-retryable"] as const;
export type StageAttemptOutcome = (typeof STAGE_ATTEMPT_OUTCOMES)[number];

/** One provider call, written before the request is sent (Decision 2) and never rewritten except to record its outcome. */
export interface StageAttempt {
  id: string;
  runId: string;
  stage: AttemptStage;
  providerId: string;
  /** Sequence within the session's stage, from 1. */
  attemptNumber: number;
  queuedAt: string;
  sentAt: string;
  outcome: StageAttemptOutcome;
  finishedAt: string | null;
  externalRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

/** PRD §3 narration interval: where a chunk sits in the voice-over, in seconds. */
export interface NarrationInterval {
  startSeconds: number;
  endSeconds: number;
}

/** request-admitted-clip-duration (JOS-147) — the one duration-warning value ever recorded; §6.1.1's unsplittable-sentence case. */
export type DurationWarning = "exceeds-maximum";

/** record-speed-adjustment-factor (JOS-148) — the one speed-factor-warning value ever recorded; the factor exceeds `SPEED_FACTOR_LIMIT` (§7.2). */
export type SpeedFactorWarning = "exceeds-limit";

export interface Scene {
  id: string;
  runId: string;
  index: number;
  status: SceneState;
  attempts: number;
  lastError: string | null;
  result: string | null;
  updatedAt: string;
  /** The skeleton image stage's input, correctable only while the affected stage is `failed` (PRD §10.3). Registration sets it to `imageInstruction`; JOS-145 retires it (assign-scene-identifiers, JOS-144, Decision 3). */
  instruction: string;
  /** PRD §3 `PROMPT`: the fragment of the script this scene narrates, unchanged. Locked once registered. */
  prompt: string;
  /** PRD §3 `IMAGE`: the instruction to generate the scene's image. */
  imageInstruction: string;
  /** PRD §3 `VIDEO`: the instruction to animate the image. */
  videoInstruction: string;
  /** PRD §3 narration interval, in seconds; null for a scene created without a decomposition. Locked once registered (assign-narration-intervals, JOS-143). */
  narrationInterval: NarrationInterval | null;
  /** The admitted clip duration requested for this chunk (PRD §7.2); null for a scene created without a decomposition. Locked once registered (request-admitted-clip-duration, JOS-147). */
  requestedDurationSeconds: number | null;
  /** Set only when the interval was narrated longer than the largest admitted duration (§6.1.1). Locked once registered. */
  durationWarning: DurationWarning | null;
  /** The speed-adjustment factor the requested duration implies (PRD §7.2); null for a scene created without a decomposition. Locked once registered (record-speed-adjustment-factor, JOS-148). */
  speedFactor: number | null;
  /** Set only when the factor exceeds the hardcoded `SPEED_FACTOR_LIMIT`. Locked once registered. */
  speedFactorWarning: SpeedFactorWarning | null;
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
  /** Exposed here because start-video-project (JOS-134) needs the write-once
   * guarantee (AC03) externally verifiable through this same read/resync
   * endpoint (consult-session, JOS-135, Decision 1: one representation for
   * both). consult-session owns formalising the rest of the read contract. */
  script: string;
  language: string;
  state: SessionState;
  paused: boolean; // Decision 8 — always its own field, never folded into `state`
  failedPhase?: string;
  /** gate-assembly-on-complete-scenes (JOS-150): the failed scenes' indexes, ascending; present only when `failedPhase` is `"scenes"`. Derived, never stored. */
  failedSceneIndexes?: number[];
  /** PRD §12.2 — the project-folder name derives from this instant, and
   * consult-session (JOS-135) task 3.1 requires it in the session read. */
  createdAt: string;
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
  /** PRD §3 `PROMPT` (assign-scene-identifiers, JOS-144). */
  prompt?: string;
  /** PRD §3 `IMAGE`. */
  imageInstruction?: string;
  /** PRD §3 `VIDEO`. */
  videoInstruction?: string;
  /** PRD §3 narration interval; absent for a scene created without a decomposition. Immutable (assign-narration-intervals, JOS-143). */
  narrationInterval?: NarrationInterval;
  /** The admitted clip duration requested for this chunk (PRD §7.2); absent for a scene created without a decomposition. Immutable (request-admitted-clip-duration, JOS-147). */
  requestedDurationSeconds?: number;
  /** Set only when the interval was narrated longer than the largest admitted duration (§6.1.1). Immutable. */
  durationWarning?: DurationWarning;
  /** The speed-adjustment factor the requested duration implies (PRD §7.2); absent for a scene created without a decomposition. Immutable (record-speed-adjustment-factor, JOS-148). */
  speedFactor?: number;
  /** Set only when the factor exceeds the hardcoded `SPEED_FACTOR_LIMIT`. Immutable. */
  speedFactorWarning?: SpeedFactorWarning;
  updatedAt: string;
}

export interface SessionSnapshot {
  session: SessionEventPayload;
  scenes: SceneEventPayload[];
}
