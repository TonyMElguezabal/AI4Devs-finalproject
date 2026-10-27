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
  /** download-final-video (JOS-164) — present only once the final video exists; the page offers the download for exactly this, never derived from `state`. */
  finalVideoUrl?: string;
  /** adjust-scene-pause (JOS-190) — present once the session has a final video; the page never derives the version or "pending" itself. */
  finalVideo?: FinalVideoStatus;
  /** ISO-8601 instant the session was registered (documented in `docs/api-spec.yml`, always present). */
  createdAt: string;
  updatedAt: string;
}

/** The current final video's place in its history, and what a rebuild would change (adjust-scene-pause, JOS-190). */
export interface FinalVideoStatus {
  /** 1 for the original `final-video.mp4`; 2 onwards for each rebuild. */
  version: number;
  /** True when the User's pause edits differ from those the current version was built with. */
  pendingPauseEdits: boolean;
  /** Present only while the latest rebuild attempt ended in failure; the current version is kept. */
  rebuildFailure?: { cause: string };
}

/** What the pause dial may do for one scene, all in seconds (adjust-scene-pause, JOS-190). */
export interface ScenePauseView {
  originalSeconds: number;
  seconds: number;
  minSeconds: number;
  maxSeconds: number;
  /** True when the speed-factor limit, not the 0.2 s floor or the 3.0 s cap, set either bound. */
  limitedBySpeedFactor: boolean;
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
  /** download-scene-results (JOS-163) — present only for the files that actually exist; render a download link for exactly these, never derived from `state`. */
  downloads?: { imageUrl?: string; clipUrl?: string };
  instruction?: string;
  /** PRD §3 `PROMPT`: the fragment of the script this scene narrates (retry-or-correct-image, JOS-157). */
  prompt?: string;
  /** PRD §3 `IMAGE`: the instruction to generate the scene's image. Absent for a skeleton scene created without
   * a decomposition, which corrects the legacy `instruction` field instead. */
  imageInstruction?: string;
  /** PRD §3 `VIDEO`: the instruction to animate the image. */
  videoInstruction?: string;
  /** PRD §7.2: the admitted clip duration requested for this chunk; absent for a scene created without a decomposition (request-admitted-clip-duration, JOS-147). */
  requestedDurationSeconds?: number;
  /** Set only when the interval was narrated longer than the largest admitted duration (§6.1.1). */
  durationWarning?: "exceeds-maximum";
  /** PRD §7.2/AC23: the speed-adjustment factor the requested duration implies, always >= 1 (record-speed-adjustment-factor, JOS-148). */
  speedFactor?: number;
  /** Set only when the factor exceeds the hardcoded acceptable limit. Independent of durationWarning. */
  speedFactorWarning?: "exceeds-limit";
  held?: boolean;
  /** adjust-scene-pause (JOS-190) — present only once the session has a final video and this scene's pause can be derived. */
  pause?: ScenePauseView;
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

/** add-observability-telemetry (JOS-199) — one opt-in toggle per signal; `answered` is false until the user saves once. */
export interface TelemetryChoices {
  errors: boolean;
  providerUsage: boolean;
  productUsage: boolean;
}
export interface TelemetryConsent extends TelemetryChoices {
  answered: boolean;
}

/** `GET /app/update`: a newer build exists on this build's channel. */
export type AppUpdate = { available: false } | { available: true; tag: string; url: string };

/** change-active-provider-from-admin (JOS-171) — one stage's row on `/admin`: `GET /admin/providers`. */
export type ProviderStage = "reasoning" | "voice" | "alignment" | "image" | "video";
export interface ProviderView {
  stage: ProviderStage;
  activeProviderId: string;
  activeLabel: string;
  /** Where the active provider comes from: the settings files, or a choice made on `/admin`. */
  source: "settings" | "admin";
  selectable: Array<{ id: string; label: string }>;
  /** A stored choice this build no longer ships; the settings default is active meanwhile. */
  orphanedChoice: string | null;
}

/** manage-providers-from-admin (JOS-218) — the provider profiles `/admin` manages. */
export interface ParameterFieldInfo {
  path: string[];
  label: string;
  kind: "text" | "number" | "choice";
  required: boolean;
  help?: string;
  choices?: string[];
  /** A text field whose value is a number when it parses as one (the voice speed). */
  acceptsNumber?: boolean;
}
export interface AdapterTypeInfo {
  id: string;
  stage: ProviderStage;
  label: string;
  fields: ParameterFieldInfo[];
  /** test-provider-connection (JOS-220): whether the vendor charges for the check, and what a pass proves. */
  connectionCheck: { charged: boolean; covers: string };
}
export type ConnectionOutcome = "connected" | "key-rejected" | "not-found" | "unreachable" | "unexpected" | "no-key";
export interface ConnectionTestResult {
  outcome: ConnectionOutcome;
  covers: string;
  httpStatus?: number;
}
export interface ProfileProblem {
  field: string;
  message: string;
}
export interface ProfileView {
  id: string;
  stage: ProviderStage;
  adapterType: string;
  label: string;
  parameters: Record<string, unknown>;
  keyStatus: "stored" | "environment" | "missing";
  keyHint: string | null;
  usable: boolean;
  problems: ProfileProblem[];
  active: boolean;
  retired: boolean;
}

/** move-failed-stage-to-active-provider (JOS-172) — one row of `GET /admin/failed-stages`. */
export interface FailedStageRow {
  sessionId: string;
  sessionTitle: string;
  stage: ProviderStage;
  sceneId: string | null;
  sceneNumber: number | null;
  boundProviderId: string;
  boundProviderLabel: string;
  activeProviderId: string;
  activeProviderLabel: string;
  cause: string;
}

/** report-provider-usage (JOS-223): the period of a report, as the ISO instants the backend takes; an absent bound is open. */
export interface ReportPeriod {
  from?: string;
  to?: string;
}

export interface ProviderUsageRow {
  stage: ProviderStage;
  providerId: string;
  providerLabel: string;
  attempts: number;
  successes: number;
  transient: number;
  notRetryable: number;
  timedOut: number;
  successRatePercent: number;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  billedUnits: number;
  unit: string;
}

export interface ProviderUsageReport {
  from: string | null;
  to: string;
  sceneAttemptsFollowCurrentProvider: boolean;
  rows: ProviderUsageRow[];
}

/** admin-visual-style-prompt (JOS-201) — `GET /admin/settings`. The image's file path is never exposed. */
export interface AppSettings {
  visualStylePrompt: string;
  referenceImage: { contentType: string; sizeBytes: number; updatedAt: string } | null;
  updatedAt: string;
}

/** record-phase-instants-and-pipeline-report (JOS-228): `GET /admin/reports/pipeline-time`. `null` seconds is no time; a `null` count is not recorded. */
export type PipelinePhase = "voice-over" | "decomposition" | "scenes" | "assembly";

export interface PipelinePhaseRow {
  phase: PipelinePhase;
  sessions: number;
  medianSeconds: number | null;
  p95Seconds: number | null;
  timedOut: number | null;
  finishedLate: number | null;
  superseded: number | null;
}

export interface PipelineTimeReport {
  from: string | null;
  to: string;
  phases: PipelinePhaseRow[];
  sessions: Array<{ runId: string; title: string; seconds: Record<PipelinePhase, number | null> }>;
}
