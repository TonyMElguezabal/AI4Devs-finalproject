import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  bindSceneImageProvider,
  commitSceneResult,
  db,
  getAllInFlightScenes,
  getProviderRequest,
  getNarrationTimestamps,
  getRun,
  getScene,
  getScenesForRun,
  getStageAttempts,
  getSubmittedScenesForRun,
  getVoiceOver,
  insertProviderRequest,
  markImageComplete,
  markProviderRequestResolved,
  markSceneFailed,
  markSceneInFlight,
  markScenePendingRetry,
  sceneCurrentRequestId,
  setRunPaused,
  setSceneInstruction,
  writeArtefact,
  writeArtefactOnce,
} from "./db.ts";
import * as concurrency from "./concurrency.ts";
import * as provider from "./provider.ts";
import { isAcceptedImageSize, readImageDimensions, sniffImageExtension } from "./imageOutputCheck.ts";
import { downloadGeneratedImage, getImageProviderRegistry, type ImageGenerationResult } from "./imageProvider.ts";
import {
  STAGE,
  STUB_PROVIDER_NAME,
  type ProviderOutcome,
  type Scene,
  type SceneEventPayload,
  type SessionFailure,
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
    // show-scene-results-and-actions (JOS-151), Decision 3 — the route path,
    // relative to the API base; the stored file path stays internal.
    result: scene.result ? { imageUrl: `/sessions/${scene.runId}/scenes/${scene.id}/image` } : undefined,
    instruction: scene.instruction,
    prompt: scene.prompt,
    imageInstruction: scene.imageInstruction,
    videoInstruction: scene.videoInstruction,
    narrationInterval: scene.narrationInterval ?? undefined,
    requestedDurationSeconds: scene.requestedDurationSeconds ?? undefined,
    durationWarning: scene.durationWarning ?? undefined,
    speedFactor: scene.speedFactor ?? undefined,
    speedFactorWarning: scene.speedFactorWarning ?? undefined,
    updatedAt: scene.updatedAt,
  };
}

/** What the session's records say about the phases before its chunks exist
 * (obtain-narration-timestamps, JOS-139, Decision 8): state is derived from the
 * records, never stored. JOS-136 (task 5.15) adds `voice-over-generating`. */
export interface SessionProgress {
  hasVoiceOver?: boolean;
  /** A `timestamps` attempt was recorded, or the timestamps are stored. */
  timestampsStarted?: boolean;
}

/** Derives the session state from its scenes, its recorded failure and its
 * progress — PRD §8.1. A session with no chunks and a failure (a refused
 * decomposition, assign-scene-identifiers Decision 6) is `failed` in that phase;
 * without a failure, the timestamps stage means `chunk-decomposing` and a
 * completed narration `voice-over-complete`. */
export function deriveSessionState(
  scenes: Scene[],
  failure: SessionFailure | null = null,
  progress: SessionProgress = {},
): { state: SessionState; failedPhase?: string } {
  if (scenes.length === 0) {
    if (failure) return { state: "failed", failedPhase: failure.phase };
    if (progress.timestampsStarted) return { state: "chunk-decomposing" };
    if (progress.hasVoiceOver) return { state: "voice-over-complete" };
    return { state: "submitted" };
  }
  // generate-chunk-image (JOS-145), design Decision 4 — `image-complete`
  // is not final until JOS-146 adds the video stage; a session made only of
  // image-complete chunks is still processing, never `final-video`.
  const anyProcessing = scenes.some(
    (s) => s.status === "submitted" || s.status === "image-generating" || s.status === "image-complete",
  );
  if (anyProcessing) return { state: "chunks-processing" };
  const anyFailed = scenes.some((s) => s.status === "failed");
  if (anyFailed) return { state: "failed", failedPhase: "image" };
  return { state: "final-video" };
}

export function toSnapshot(runId: string): SessionSnapshot | undefined {
  const run = getRun(runId);
  if (!run) return undefined;
  const scenes = getScenesForRun(runId);
  const { state, failedPhase } = deriveSessionState(scenes, run.failure, {
    hasVoiceOver: getVoiceOver(runId) !== undefined,
    timestampsStarted: getStageAttempts(runId, "timestamps").length > 0 || getNarrationTimestamps(runId) !== undefined,
  });
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

export function broadcast(runId: string): void {
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

/**
 * generate-chunk-image (JOS-145), design Decision 6 — the real image stage.
 * Shares `launchScene`'s guards and pause handling, but calls the bound
 * adapter with a single `await`: Fal.ai's call has nothing to poll after it
 * returns, unlike `provider.ts`'s stub simulation. Not awaited by its own
 * callers (design Decision 7): a caller observes progress through
 * `broadcast`, the same as every other launch in this module.
 */
export function launchImageStage(sceneId: string): void {
  const scene = getScene(sceneId);
  if (!scene || scene.status !== "submitted") return;
  const run = getRun(scene.runId);
  if (run?.paused) return; // held; continueSession() launches it later

  concurrency.acquire(STAGE, () => {
    void runImageAttempt(sceneId);
  });
}

/** Launches every chunk a run's decomposition just registered (AC1) — `continueSession`'s loop, at registration time. */
export function launchImageStageForRun(runId: string): void {
  for (const scene of getSubmittedScenesForRun(runId)) {
    launchImageStage(scene.id);
  }
}

async function runImageAttempt(sceneId: string): Promise<void> {
  const fresh = getScene(sceneId);
  if (!fresh || fresh.status !== "submitted") {
    concurrency.release(STAGE);
    return;
  }
  const freshRun = getRun(fresh.runId);
  if (!freshRun || freshRun.paused) {
    // Paused while queued: give the slot to the next waiter without
    // sending anything. No attempt is consumed. A missing run is defensive;
    // a scene always belongs to one.
    concurrency.release(STAGE);
    return;
  }

  // design Decision 3 — bound once, atomically, and only if still unbound.
  const registry = getImageProviderRegistry();
  bindSceneImageProvider(fresh.id, registry.defaultIdentifier);
  const boundIdentifier = getScene(fresh.id)!.provider;
  const adapter = registry.adapters[boundIdentifier];

  const attemptNumber = fresh.attempts + 1;
  const requestId = randomUUID();
  markSceneInFlight(fresh.id, requestId, attemptNumber);
  broadcast(fresh.runId);

  const recordAndRelease = (mode: "success" | "transient_failure" | "not_retryable_failure", latencyMs: number) => {
    concurrency.release(STAGE);
    // design Decision 6 — inserted already resolved: the call has already
    // finished by the time it is recorded, so there is nothing left to poll.
    insertProviderRequest(requestId, fresh.id, latencyMs, mode, attemptNumber);
    markProviderRequestResolved(requestId);
  };

  if (!adapter) {
    recordAndRelease("not_retryable_failure", 0);
    applyFailureOutcome(
      fresh.id,
      { kind: "failed_not_retryable", reason: `no adapter is configured for the bound provider '${boundIdentifier}'` },
      attemptNumber,
      () => launchImageStage(fresh.id),
    );
    broadcast(fresh.runId);
    return;
  }

  const sentAt = Date.now();
  let outcome: ImageGenerationResult;
  try {
    outcome = await adapter.generate(fresh.imageInstruction);
  } catch (err) {
    outcome = {
      kind: "failed_transient",
      reason: err instanceof Error ? `the image provider threw: ${err.message}` : "the image provider threw an unexpected error",
    };
  }
  const latencyMs = Date.now() - sentAt;

  if (outcome.kind !== "success") {
    recordAndRelease(outcome.kind === "failed_not_retryable" ? "not_retryable_failure" : "transient_failure", latencyMs);
    applyFailureOutcome(fresh.id, outcome, attemptNumber, () => launchImageStage(fresh.id));
    broadcast(fresh.runId);
    return;
  }

  let bytes: Buffer;
  let contentType: string;
  if (outcome.image.source === "bytes") {
    bytes = outcome.image.bytes;
    contentType = outcome.image.contentType;
  } else {
    // §12.2 — no expiring links: resolved to a local file before success.
    const downloaded = await downloadGeneratedImage(outcome.image.url);
    if (!downloaded.ok) {
      recordAndRelease("transient_failure", latencyMs);
      applyFailureOutcome(fresh.id, { kind: "failed_transient", reason: downloaded.reason }, attemptNumber, () =>
        launchImageStage(fresh.id),
      );
      broadcast(fresh.runId);
      return;
    }
    bytes = downloaded.bytes;
    contentType = downloaded.contentType;
  }

  // design Decision 1 — measured from the bytes actually held, never from
  // provider-reported metadata (contentType is only ever used for the
  // stored filename's extension, not for acceptance).
  const dimensions = readImageDimensions(bytes);
  if (!dimensions || !isAcceptedImageSize(dimensions.width, dimensions.height)) {
    recordAndRelease("transient_failure", latencyMs);
    const reason = dimensions
      ? `the generated image is ${dimensions.width}x${dimensions.height}, not an accepted horizontal 16:9 size`
      : "the generated image's dimensions could not be read";
    applyFailureOutcome(fresh.id, { kind: "failed_transient", reason }, attemptNumber, () => launchImageStage(fresh.id));
    broadcast(fresh.runId);
    return;
  }

  const extension = sniffImageExtension(bytes) ?? (contentType.includes("png") ? "png" : "jpg");
  const relativePath = writeArtefactOnce(freshRun.projectFolder, `scene-${fresh.index}-attempt-${attemptNumber}.${extension}`, bytes);
  recordAndRelease("success", latencyMs);
  completeImageStage(fresh.id, relativePath);
  broadcast(fresh.runId);
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
    // A registered chunk always has a non-empty IMAGE instruction (JOS-144's
    // registration validation); the skeleton's test-only `createScene()`
    // never sets one. That distinguishes a real held chunk, resumed through
    // the real image stage, from the generic stub scenes orchestrator.test.ts
    // still exercises through `launchScene`/`provider.ts`.
    if (scene.imageInstruction) {
      launchImageStage(scene.id);
    } else {
      launchScene(scene.id);
    }
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

/** Records a delivered success once, idempotently, and marks the image stage complete. */
function completeImageStage(sceneId: string, relativePath: string): void {
  // Decision 3 (define-persistence, JOS-181) — the store, not this
  // function, decides whether this delivery is the one that gets to
  // "complete" the scene. `commitSceneResult` is the idempotent guard (a
  // second insert for the same scene is refused by its own primary key);
  // the next-stage launch is gated on that store-level uniqueness, not on
  // any flag this code checked beforehand — that is what makes it correct
  // even if two deliveries for the same scene ever raced each other.
  const committed = commitSceneResult(sceneId, relativePath);
  markImageComplete(sceneId, relativePath);
  if (committed) {
    nextStageLaunches.set(sceneId, (nextStageLaunches.get(sceneId) ?? 0) + 1);
  }
}

/** The retry/budget rule shared by every stage's failure handling (PRD §10.1) — not the success path, which each stage owns itself. */
function applyFailureOutcome(
  sceneId: string,
  outcome: { kind: "failed_transient" | "failed_not_retryable"; reason: string },
  attemptNumber: number,
  retryLaunch: () => void,
): void {
  if (outcome.kind === "failed_not_retryable") {
    // Not-retryable failures skip automatic retries entirely (PRD §10.1).
    markSceneFailed(sceneId, outcome.reason);
    return;
  }
  if (attemptNumber >= 1 + RETRY_BUDGET) {
    markSceneFailed(sceneId, `${outcome.reason} (retry budget exhausted after ${attemptNumber} attempts)`);
    return;
  }
  markScenePendingRetry(sceneId, outcome.reason);
  retryLaunch(); // automatic retry (held automatically if the session is paused)
}

function applyOutcome(scene: Scene, outcome: ProviderOutcome, attemptNumber: number): void {
  if (outcome.kind === "success") {
    const run = getRun(scene.runId);
    const relativePath = run
      ? writeArtefact(run.projectFolder, `scene-${scene.index}.png`, `stub image for scene ${scene.index}: ${outcome.result}`)
      : outcome.result;
    completeImageStage(scene.id, relativePath);
    return;
  }
  applyFailureOutcome(scene.id, outcome, attemptNumber, () => launchScene(scene.id));
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
    // generate-chunk-image (JOS-145), design Decision 6 — a real image
    // attempt is bound (scenes.provider is no longer the sentinel) by the
    // time it is in flight; there is no live Fal.ai job to poll after a
    // restart, so it is always treated as lost, unlike the generic stub
    // scenes below (still at the sentinel, resolved through `provider.ts`).
    if (scene.provider !== STUB_PROVIDER_NAME) {
      applyFailureOutcome(
        scene.id,
        { kind: "failed_transient", reason: "the image request was interrupted by a restart" },
        scene.attempts,
        () => launchImageStage(scene.id),
      );
      broadcast(scene.runId);
      recordedFailedAttempt++;
      continue;
    }

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
