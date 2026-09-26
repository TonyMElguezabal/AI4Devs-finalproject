import { EventEmitter } from "node:events";
import {
  commitSceneResult,
  db,
  getAllInFlightScenes,
  getProviderRequest,
  getRun,
  getScene,
  getScenesForRun,
  getSubmittedScenesForRun,
  markProviderRequestResolved,
  markSceneComplete,
  markSceneFailed,
  markSceneInFlight,
  markScenePendingRetry,
  sceneCurrentRequestId,
  setRunPaused,
  setSceneInstruction,
  writeArtefact,
} from "./db.ts";
import * as concurrency from "./concurrency.ts";
import * as provider from "./provider.ts";
import {
  STAGE,
  type ProviderOutcome,
  type Scene,
  type SceneEventPayload,
  type SessionEventPayload,
  type SessionSnapshot,
  type SessionState,
} from "./types.ts";

/** 1 initial attempt + this many automatic retries, per PRD §10.1 (C2). */
export const RETRY_BUDGET = 3;

export const events = new EventEmitter();

// ---- Wire contract helpers (define-live-updates, JOS-183 Decisions 2/4/8) ----

function sceneToPayload(scene: Scene): SceneEventPayload {
  return {
    type: "scene",
    sessionId: scene.runId,
    sceneId: scene.id,
    index: scene.index,
    state: scene.status,
    affectedStage: scene.status === "failed" ? "image" : undefined,
    errorCause: scene.status === "failed" ? scene.lastError : undefined,
    provider: scene.provider,
    attempts: scene.attempts,
    result: scene.result ? { imageUrl: scene.result } : undefined,
    instruction: scene.instruction,
    updatedAt: scene.updatedAt,
  };
}

/** Derives the session state from its scenes — PRD §8.1, applied to the
 * subset of states this single-stage skeleton can actually reach (no
 * voice-over or decomposition phases are modelled). */
export function deriveSessionState(scenes: Scene[]): { state: SessionState; failedPhase?: string } {
  if (scenes.length === 0) return { state: "submitted" };
  const anyGenerating = scenes.some((s) => s.status === "submitted" || s.status === "image-generating");
  if (anyGenerating) return { state: "chunks-processing" };
  const anyFailed = scenes.some((s) => s.status === "failed");
  if (anyFailed) return { state: "failed", failedPhase: "image" };
  return { state: "final-video" };
}

export function toSnapshot(runId: string): SessionSnapshot | undefined {
  const run = getRun(runId);
  if (!run) return undefined;
  const scenes = getScenesForRun(runId);
  const { state, failedPhase } = deriveSessionState(scenes);
  const session: SessionEventPayload = {
    type: "session",
    sessionId: run.id,
    title: run.title,
    script: run.script,
    language: run.language,
    state,
    paused: run.paused,
    failedPhase,
    createdAt: run.createdAt,
    updatedAt: new Date().toISOString(),
  };
  return {
    session,
    scenes: scenes.map(sceneToPayload),
  };
}

function broadcast(runId: string): void {
  const snapshot = toSnapshot(runId);
  if (snapshot) events.emit("state", snapshot);
}

/** In-memory only, for the idempotency experiment/test: counts how many times
 * a scene's success has triggered "the next stage" (here, just a counter —
 * the skeleton has one stage). A duplicate provider delivery must never move
 * this past 1. */
const nextStageLaunches = new Map<string, number>();
export function nextStageLaunchCount(sceneId: string): number {
  return nextStageLaunches.get(sceneId) ?? 0;
}

/**
 * Launches a scene's next attempt, honouring a session-wide pause (PRD §9):
 * a not-yet-launched generation is held until `continueSession` is called.
 * Already-sent requests are unaffected by pause — this function is simply
 * never called for them again until they resolve.
 */
export function launchScene(sceneId: string): void {
  const scene = getScene(sceneId);
  if (!scene || scene.status !== "submitted") return;
  const run = getRun(scene.runId);
  if (run?.paused) return; // held; continueSession() launches it later

  concurrency.acquire(STAGE, () => {
    const fresh = getScene(sceneId);
    if (!fresh || fresh.status !== "submitted") return;
    const freshRun = getRun(fresh.runId);
    if (freshRun?.paused) {
      // Paused while queued: give the slot to the next waiter without
      // sending anything. No attempt is consumed.
      concurrency.release(STAGE);
      return;
    }
    const attemptNumber = fresh.attempts + 1;
    const requestId = provider.send(
      fresh.id,
      attemptNumber,
      fresh.providerMode,
      fresh.providerLatencyMs,
      (reqId) => handleProviderResult(reqId),
    );
    markSceneInFlight(fresh.id, requestId, attemptNumber);
    broadcast(fresh.runId);
  });
}

/** PRD §9 — pause holds every not-yet-launched generation and retry; requests
 * already sent run to completion. There is no per-scene pause. */
export function pauseSession(runId: string): { ok: boolean; reason?: string } {
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown session" };
  setRunPaused(runId, true);
  broadcast(runId);
  return { ok: true };
}

/** Continuing removes the marker and leaves state unchanged, then launches
 * everything that was held. */
export function continueSession(runId: string): { ok: boolean; reason?: string } {
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown session" };
  setRunPaused(runId, false);
  broadcast(runId);
  for (const scene of getSubmittedScenesForRun(runId)) {
    launchScene(scene.id);
  }
  return { ok: true };
}

/**
 * Applies a (possibly duplicate) provider delivery idempotently — proves C7.
 * Safe to call twice with the same requestId: the second call is a no-op.
 */
export function handleProviderResult(requestId: string): { applied: boolean; note: string } {
  const req = getProviderRequest(requestId);
  if (!req) return { applied: false, note: "unknown request id" };
  if (req.resolved) return { applied: false, note: "duplicate delivery ignored (request already resolved)" };

  const scene = getScene(req.sceneId);
  if (!scene) return { applied: false, note: "scene not found" };

  if (sceneCurrentRequestId(scene.id) !== requestId) {
    // Defensive: this scene has already moved past this request (should not
    // occur in this skeleton, since attempts are strictly sequential).
    markProviderRequestResolved(requestId);
    return { applied: false, note: "stale request ignored (scene has moved on)" };
  }

  const poll = provider.pollResult(requestId);
  if (poll.status !== "resolved") {
    return { applied: false, note: `provider result not ready (${poll.status})` };
  }

  markProviderRequestResolved(requestId);
  concurrency.release(STAGE);
  applyOutcome(scene, poll.outcome, req.attemptNumber);
  broadcast(scene.runId);
  return { applied: true, note: "applied" };
}

function applyOutcome(scene: Scene, outcome: ProviderOutcome, attemptNumber: number): void {
  if (outcome.kind === "success") {
    // Decision 3 (define-persistence, JOS-181) — the store, not this
    // function, decides whether this delivery is the one that gets to
    // "complete" the scene. `markSceneComplete` below is an idempotent
    // UPDATE (safe to repeat), but the next-stage launch is gated on the
    // store's own uniqueness constraint, not on any flag this code checked
    // beforehand — that is what makes it correct even if two deliveries for
    // the same scene ever raced each other.
    const run = getRun(scene.runId);
    const relativePath = run
      ? writeArtefact(run.projectFolder, `scene-${scene.index}.png`, `stub image for scene ${scene.index}: ${outcome.result}`)
      : outcome.result;
    const committed = commitSceneResult(scene.id, relativePath);
    markSceneComplete(scene.id, relativePath);
    if (committed) {
      nextStageLaunches.set(scene.id, (nextStageLaunches.get(scene.id) ?? 0) + 1);
    }
    return;
  }
  if (outcome.kind === "failed_not_retryable") {
    // Not-retryable failures skip automatic retries entirely (PRD §10.1).
    markSceneFailed(scene.id, outcome.reason);
    return;
  }
  // failed_transient
  if (attemptNumber >= 1 + RETRY_BUDGET) {
    markSceneFailed(scene.id, `${outcome.reason} (retry budget exhausted after ${attemptNumber} attempts)`);
    return;
  }
  markScenePendingRetry(scene.id, outcome.reason);
  launchScene(scene.id); // automatic retry (held automatically if the session is paused)
}

/**
 * A manual retry, per PRD §10.2: only valid from `failed`, starts a fresh
 * cycle of up to RETRY_BUDGET automatic retries.
 */
export function manualRetry(sceneId: string): { ok: boolean; reason?: string } {
  const scene = getScene(sceneId);
  if (!scene) return { ok: false, reason: "unknown scene" };
  if (scene.status !== "failed") return { ok: false, reason: `cannot retry a scene in status '${scene.status}'` };
  markScenePendingRetry(sceneId, scene.lastError ?? "manual retry");
  // A manual retry starts a fresh cycle: reset the attempt counter so the
  // scene gets a full 1 + RETRY_BUDGET budget again, per PRD §10.2.
  resetAttemptsForManualRetry(sceneId);
  launchScene(sceneId);
  return { ok: true };
}

/**
 * PRD §10.3 — the one visual-correction exception: only offered on a failed
 * stage, and it is a retry with a corrected instruction, never a rewrite of
 * `ID`, `PROMPT`-as-narration or scene order.
 */
export function correctAndRetry(sceneId: string, instruction: string): { ok: boolean; reason?: string } {
  const scene = getScene(sceneId);
  if (!scene) return { ok: false, reason: "unknown scene" };
  if (scene.status !== "failed") {
    return { ok: false, reason: `correction is only offered on a failed stage, not '${scene.status}'` };
  }
  setSceneInstruction(sceneId, instruction);
  return manualRetry(sceneId);
}

// Kept local and explicit (rather than a generic db setter) so it is obvious
// this is the one place attempts are ever reset, and only for a manual retry.
function resetAttemptsForManualRetry(sceneId: string): void {
  db.prepare("UPDATE scenes SET attempts = 0 WHERE id = ?").run(sceneId);
}

/**
 * Reconciliation on boot — proves C6 (restart-safe resumption). For every
 * scene left `image-generating` when the process died:
 *  - if the provider still holds a resolved result, apply it (resumed);
 *  - if the provider no longer holds the request, record exactly one failed
 *    attempt and apply the normal retry/failed rule (PRD §12.1);
 *  - if it is still genuinely pending, re-arm a delivery watcher for the
 *    remaining latency instead of polling forever.
 */
export function reconcileOnBoot(): { resumed: number; recordedFailedAttempt: number; stillPending: number } {
  let resumed = 0;
  let recordedFailedAttempt = 0;
  let stillPending = 0;

  for (const scene of getAllInFlightScenes()) {
    const requestId = sceneCurrentRequestId(scene.id);
    if (!requestId) continue;
    const poll = provider.pollResult(requestId);

    if (poll.status === "resolved") {
      markProviderRequestResolved(requestId);
      applyOutcome(scene, poll.outcome, scene.attempts);
      broadcast(scene.runId);
      resumed++;
      continue;
    }

    if (poll.status === "not_found") {
      markProviderRequestResolved(requestId);
      applyOutcome(
        scene,
        { kind: "failed_transient", reason: "stub: provider no longer holds this request after restart" },
        scene.attempts,
      );
      broadcast(scene.runId);
      recordedFailedAttempt++;
      continue;
    }

    // Still pending: re-arm delivery for the remaining latency.
    const req = getProviderRequest(requestId);
    if (req) {
      const remainingMs = Math.max(0, new Date(req.sentAt).getTime() + req.latencyMs - Date.now());
      const timer = setTimeout(() => handleProviderResult(requestId), remainingMs);
      timer.unref();
    }
    stillPending++;
  }

  return { resumed, recordedFailedAttempt, stillPending };
}
