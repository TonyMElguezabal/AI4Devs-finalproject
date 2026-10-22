import { activeProviderId, labelOf, type ProviderStage } from "./activeProvider.ts";
import { requestedClipDuration } from "./admittedDurations.ts";
import { SPEED_FACTOR_LIMIT } from "./config/providers.ts";
import {
  countScenesForRun,
  getNarrationTimestamps,
  getRun,
  getSceneForRun,
  getScenesForRun,
  getStageInstanceAttempts,
  inTransaction,
  listRunIds,
  rebindFailedClip,
  rebindSceneImageProvider,
  rebindSessionStage,
  stageInstanceKeyOf,
} from "./db.ts";
import { resolveProfileId } from "./keyStore.ts";
import { broadcast } from "./orchestrator.ts";
import { profileProblems } from "./providerAdmin.ts";
import { getProfile } from "./providerProfiles.ts";
import { activeVideoDurations } from "./videoDurations.ts";
import { STUB_PROVIDER_NAME } from "./types.ts";

// move-failed-stage-to-active-provider (JOS-172), design Decisions 2 and 3 — the failed stages `/admin` lists: those bound
// to a provider other than the active one of their stage type, and for which a retry exists after a move.

export interface FailedStage {
  sessionId: string;
  sessionTitle: string;
  stage: ProviderStage;
  /** Present for image and video only. */
  sceneId: string | null;
  sceneNumber: number | null;
  boundProviderId: string;
  boundProviderLabel: string;
  activeProviderId: string;
  activeProviderLabel: string;
  cause: string;
}

export interface FailedStageRef {
  sessionId: string;
  stage: ProviderStage;
  sceneId?: string;
}

/** Whether a retry of this session-level stage is scheduled or in flight: the gate that makes a move refuse. */
export function hasPendingSessionAttempt(sessionId: string, stage: "voice" | "alignment" | "reasoning"): boolean {
  const key = stageInstanceKeyOf(sessionId, stage === "voice" ? "voice-over" : "decomposition");
  const latest = getStageInstanceAttempts(key).at(-1);
  return latest !== undefined && (latest.outcome === "scheduled" || latest.outcome === "in-flight");
}

function row(sessionId: string, title: string, stage: ProviderStage, bound: string, cause: string, scene?: { id: string; index: number }): FailedStage | undefined {
  const active = activeProviderId(stage);
  if (resolveProfileId(stage, bound) === active) return undefined;
  return {
    sessionId,
    sessionTitle: title,
    stage,
    sceneId: scene?.id ?? null,
    sceneNumber: scene?.index ?? null,
    boundProviderId: bound,
    boundProviderLabel: labelOf(stage, bound),
    activeProviderId: active,
    activeProviderLabel: labelOf(stage, active),
    cause,
  };
}

/** The failed stages of one session that are bound to a provider other than the active one. */
export function failedStagesOfRun(sessionId: string): FailedStage[] {
  const run = getRun(sessionId);
  if (!run) return [];
  const found: Array<FailedStage | undefined> = [];

  const failure = run.failure;
  if (failure?.manualRetryAvailable) {
    if (failure.phase === "voice-over" && run.voiceProviderId) found.push(row(sessionId, run.title, "voice", run.voiceProviderId, failure.cause));
    if (failure.phase === "decomposition" && countScenesForRun(sessionId) === 0) {
      // The retry picks the step the same way: the alignment step until the timestamps are stored, then the reasoning step.
      if (!getNarrationTimestamps(sessionId)) {
        if (run.alignmentProviderId) found.push(row(sessionId, run.title, "alignment", run.alignmentProviderId, failure.cause));
      } else if (run.decompositionProviderId) {
        found.push(row(sessionId, run.title, "reasoning", run.decompositionProviderId, failure.cause));
      }
    }
  }

  for (const scene of getScenesForRun(sessionId)) {
    if (scene.status !== "failed") continue;
    const cause = scene.lastError ?? "the stage failed";
    if (scene.result === null) {
      if (scene.provider !== STUB_PROVIDER_NAME) found.push(row(sessionId, run.title, "image", scene.provider, cause, scene));
    } else if (scene.videoResult === null && scene.videoProvider) {
      found.push(row(sessionId, run.title, "video", scene.videoProvider, cause, scene));
    }
  }
  return found.filter((stage): stage is FailedStage => stage !== undefined);
}

export function listFailedStages(): FailedStage[] {
  return listRunIds().flatMap(failedStagesOfRun);
}

export type MoveRefusal = "not-found" | "not-failed" | "already-on-active" | "retry-in-progress" | "not-retryable" | "not-usable";

export type MoveResult =
  | {
      ok: true;
      moved: { sessionId: string; stage: ProviderStage; sceneId: string | null; providerId: string; providerLabel: string; requestedDurationSeconds: number | null };
    }
  | { ok: false; reason: MoveRefusal };

const refuse = (reason: MoveRefusal): MoveResult => ({ ok: false, reason });

/**
 * Design Decision 1 — binds one failed stage instance to the provider that is active now. It writes the binding (and, for a
 * clip, the duration values of Decision 4) and nothing else: no request, no attempt, no state change. Every guard and the
 * write run in one transaction with conditional updates, so a stale page or a race changes nothing.
 */
export function moveFailedStage(ref: FailedStageRef): MoveResult {
  const moved = inTransaction((): MoveResult => {
    const run = getRun(ref.sessionId);
    if (!run) return refuse("not-found");
    const isScene = ref.stage === "image" || ref.stage === "video";
    const scene = isScene ? getSceneForRun(ref.sessionId, ref.sceneId ?? "") : undefined;
    if (isScene && !scene) return refuse("not-found");

    // 1. The stage is failed, bound, and (for a session stage) a retry exists after the move.
    let bound: string | null | undefined;
    if (ref.stage === "voice") {
      if (run.failure?.phase !== "voice-over") return refuse("not-failed");
      bound = run.voiceProviderId;
    } else if (ref.stage === "alignment" || ref.stage === "reasoning") {
      const alignmentStep = !getNarrationTimestamps(ref.sessionId);
      if (run.failure?.phase !== "decomposition" || countScenesForRun(ref.sessionId) > 0 || alignmentStep !== (ref.stage === "alignment")) return refuse("not-failed");
      bound = ref.stage === "alignment" ? run.alignmentProviderId : run.decompositionProviderId;
    } else if (ref.stage === "image") {
      if (scene!.status !== "failed" || scene!.result !== null) return refuse("not-failed");
      bound = scene!.provider === STUB_PROVIDER_NAME ? null : scene!.provider;
    } else {
      if (scene!.status !== "failed" || scene!.result === null || scene!.videoResult !== null) return refuse("not-failed");
      bound = scene!.videoProvider;
    }
    if (!bound) return refuse("not-failed");
    if (!isScene) {
      if (!run.failure?.manualRetryAvailable) return refuse("not-retryable");
      if (hasPendingSessionAttempt(ref.sessionId, ref.stage as "voice" | "alignment" | "reasoning")) return refuse("retry-in-progress");
    }

    // 2. The active provider differs and can be used.
    const active = activeProviderId(ref.stage);
    if (resolveProfileId(ref.stage, bound) === active) return refuse("already-on-active");
    const profile = getProfile(active);
    if (profile && profileProblems(profile).length > 0) return refuse("not-usable");

    // 3. The write, conditional on the binding that was read.
    let requestedDurationSeconds: number | null = null;
    if (ref.stage === "voice" || ref.stage === "alignment" || ref.stage === "reasoning") {
      if (!rebindSessionStage(ref.sessionId, ref.stage, bound, active)) return refuse("not-failed");
    } else if (ref.stage === "image") {
      if (!rebindSceneImageProvider(scene!.id, bound, active)) return refuse("not-failed");
    } else {
      if (!scene!.narrationInterval) return refuse("not-failed"); // a registered chunk always has one
      const { seconds, warning, factor } = requestedClipDuration(scene!.narrationInterval, activeVideoDurations().durations);
      const values = { requestedDurationSeconds: seconds, durationWarning: warning, speedFactor: factor, speedFactorWarning: factor > SPEED_FACTOR_LIMIT ? ("exceeds-limit" as const) : null };
      if (!rebindFailedClip(scene!.id, bound, active, values)) return refuse("not-failed");
      requestedDurationSeconds = seconds;
    }
    return { ok: true, moved: { sessionId: ref.sessionId, stage: ref.stage, sceneId: scene?.id ?? null, providerId: active, providerLabel: labelOf(ref.stage, active), requestedDurationSeconds } };
  });
  if (moved.ok) broadcast(ref.sessionId);
  return moved;
}
