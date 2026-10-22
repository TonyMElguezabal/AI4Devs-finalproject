import { activeProviderId, labelOf, type ProviderStage } from "./activeProvider.ts";
import { countScenesForRun, getNarrationTimestamps, getRun, getScenesForRun, getStageInstanceAttempts, listRunIds, stageInstanceKeyOf } from "./db.ts";
import { resolveProfileId } from "./keyStore.ts";
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
