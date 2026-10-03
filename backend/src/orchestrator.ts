import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import {
  ArtefactAlreadyExistsError,
  bindSceneImageProvider,
  bindSceneVideoProvider,
  commitSceneResult,
  commitSceneVideoResult,
  db,
  getAllInFlightScenes,
  getAllVideoGeneratingScenes,
  getImageCompleteScenesForRun,
  getProviderRequest,
  getNarrationTimestamps,
  getRun,
  getScene,
  getScenesForRun,
  getStageAttempts,
  getSubmittedScenesForRun,
  getVoiceOver,
  insertProviderRequest,
  markChunkComplete,
  markImageComplete,
  markProviderRequestResolved,
  markSceneFailed,
  markSceneInFlight,
  markScenePendingRetry,
  markSceneVideoRetry,
  markVideoGenerating,
  resetAttemptsForVideoStart,
  resolveArtefactPath,
  sceneCurrentRequestId,
  setRunPaused,
  setSceneInstruction,
  writeArtefact,
  writeArtefactOnce,
} from "./db.ts";
import * as concurrency from "./concurrency.ts";
import { admitLaunch, launchHeldWork, registerStageLauncher, sessionHeldWork, type StageLauncher } from "./launchGate.ts";
import { assemblyGate } from "./assemblyGate.ts";
import * as provider from "./provider.ts";
import { PER_PHASE_MAX_TIME_SECONDS } from "./config/providers.ts";
import { isAcceptedImageSize, readImageDimensions, sniffImageExtension } from "./imageOutputCheck.ts";
import { downloadGeneratedImage, getImageProviderRegistry, type ImageGenerationResult } from "./imageProvider.ts";
import {
  downloadGeneratedClip,
  getVideoProviderRegistry,
  type VideoGenerationResult,
  type VideoSubmitResult,
} from "./videoProvider.ts";
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

const VIDEO_STAGE = "video";
/** Provisional cap — JOS-167 replaces this (design Decision 2). */
export const PROVISIONAL_VIDEO_CONCURRENCY = 3;
concurrency.setLimit(VIDEO_STAGE, PROVISIONAL_VIDEO_CONCURRENCY);

/** Poll interval between checks of the video provider (Decision 3). */
let videoPollIntervalMs = 10_000;
export function setVideoPollIntervalMs(ms: number): void {
  videoPollIntervalMs = ms;
}
export function resetVideoPollIntervalMs(): void {
  videoPollIntervalMs = 10_000;
}

/**
 * How long `runVideoAttempt` waits (as a deferred setTimeout) before making
 * any DB writes. 0 in production. Set to a large value in tests that only
 * care about the image stage so the video stage never starts during the test.
 */
let videoStageStartDelayMs = 0;
export function setVideoStageStartDelayMs(ms: number): void {
  videoStageStartDelayMs = ms;
}
export function resetVideoStageStartDelayMs(): void {
  videoStageStartDelayMs = 0;
}

export const events = new EventEmitter();

// Test-only hook: fires synchronously after admission and before the in-flight
// mark, to prove no pause can land between them (design Decision 2).
let _postAdmitHook: ((runId: string) => void) | undefined;
export function setPostAdmitHook(hook: ((runId: string) => void) | undefined): void {
  _postAdmitHook = hook;
}

// ---- Wire contract helpers (define-live-updates, JOS-183 Decisions 2/4/8) ----

function sceneToPayload(scene: Scene): SceneEventPayload {
  return {
    type: "scene",
    sessionId: scene.runId,
    sceneId: scene.id,
    index: scene.index,
    state: scene.status,
    // Decision 6 (JOS-146) — derived: a failed scene with a stored image path failed at the video stage.
    affectedStage: scene.status === "failed" ? (scene.result ? "video" : "image") : undefined,
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
  /** A final video exists (US-16b records it). Defaults to false: all scenes complete is `final-video-generating`, not `final-video`. */
  hasFinalVideo?: boolean;
}

export interface DerivedSessionState {
  state: SessionState;
  failedPhase?: string;
  /** Present only when `failedPhase` is `"scenes"`: the failed scenes' indexes, ascending. */
  failedSceneIndexes?: number[];
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
): DerivedSessionState {
  if (scenes.length === 0) {
    if (failure) return { state: "failed", failedPhase: failure.phase };
    if (progress.timestampsStarted) return { state: "chunk-decomposing" };
    if (progress.hasVoiceOver) return { state: "voice-over-complete" };
    return { state: "submitted" };
  }
  // gate-assembly-on-complete-scenes (JOS-150), design Decisions 2-4 — PRD §8.1
  // v1.3: a scene still generating (anything but chunk-complete or failed) keeps
  // the session in `chunks-processing`, even beside a failed scene.
  const gate = assemblyGate(scenes);
  if (gate.open) return { state: progress.hasFinalVideo ? "final-video" : "final-video-generating" };
  if (gate.processingSceneIndexes.length > 0) return { state: "chunks-processing" };
  return { state: "failed", failedPhase: "scenes", failedSceneIndexes: gate.failedSceneIndexes };
}

export function toSnapshot(runId: string): SessionSnapshot | undefined {
  const run = getRun(runId);
  if (!run) return undefined;
  const scenes = getScenesForRun(runId);
  const { state, failedPhase, failedSceneIndexes } = deriveSessionState(scenes, run.failure, {
    hasVoiceOver: getVoiceOver(runId) !== undefined,
    timestampsStarted: getStageAttempts(runId, "timestamps").length > 0 || getNarrationTimestamps(runId) !== undefined,
  });
  const heldWork = sessionHeldWork(runId);
  const heldSceneIds = heldWork.sceneIds;
  const session: SessionEventPayload = {
    type: "session",
    sessionId: run.id,
    title: run.title,
    script: run.script,
    language: run.language,
    state,
    paused: run.paused,
    held: heldWork.stages.map((s) => ({ stage: s.stage, count: s.count })),
    failedPhase,
    failedSceneIndexes,
    createdAt: run.createdAt,
    updatedAt: new Date().toISOString(),
  };
  return {
    session,
    scenes: scenes.map((s) => ({ ...sceneToPayload(s), held: heldSceneIds.has(s.id) || undefined })),
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

/** Same idempotency guard for the video stage (JOS-146). */
const nextVideoStageLaunches = new Map<string, number>();
export function nextVideoStageLaunchCount(sceneId: string): number {
  return nextVideoStageLaunches.get(sceneId) ?? 0;
}

/** Dispatches to the real image stage or the stub stage depending on whether the scene has an IMAGE instruction. */
function launchSceneStage(sceneId: string): void {
  const scene = getScene(sceneId);
  if (scene?.imageInstruction) {
    launchImageStage(sceneId);
  } else {
    launchScene(sceneId);
  }
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
  if (!admitLaunch(scene.runId).admitted) return; // held; continueSession() launches it later

  concurrency.acquire(STAGE, () => {
    const fresh = getScene(sceneId);
    if (!fresh || fresh.status !== "submitted") return;
    if (!admitLaunch(fresh.runId).admitted) {
      // Paused while queued: give the slot to the next waiter without
      // sending anything. No attempt is consumed (design Decision 2).
      concurrency.release(STAGE);
      return;
    }
    _postAdmitHook?.(fresh.runId);
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
  if (!admitLaunch(scene.runId).admitted) return; // held; continueSession() launches it later

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

// ---- Video stage (generate-chunk-video, JOS-146) ----

function isMp4(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
}

function applyVideoFailureOutcome(
  sceneId: string,
  outcome: { kind: "failed_transient" | "failed_not_retryable"; reason: string },
  attemptNumber: number,
): void {
  if (outcome.kind === "failed_not_retryable") {
    markSceneFailed(sceneId, outcome.reason);
    return;
  }
  if (attemptNumber >= 1 + RETRY_BUDGET) {
    markSceneFailed(sceneId, `${outcome.reason} (video retry budget exhausted after ${attemptNumber} attempts)`);
    return;
  }
  markSceneVideoRetry(sceneId, outcome.reason);
  launchVideoStage(sceneId);
}

function completeVideoStage(sceneId: string, relativePath: string): void {
  const committed = commitSceneVideoResult(sceneId, relativePath);
  if (committed) {
    markChunkComplete(sceneId, relativePath);
    nextVideoStageLaunches.set(sceneId, (nextVideoStageLaunches.get(sceneId) ?? 0) + 1);
  }
}

async function pollVideoRequestOnce(
  sceneId: string,
  requestId: string,
  attemptNumber: number,
  sentAtMs: number,
): Promise<void> {
  const fresh = getScene(sceneId);
  if (!fresh || fresh.status !== "video-generating") {
    concurrency.release(VIDEO_STAGE);
    return;
  }
  if (!fresh.videoProvider) {
    concurrency.release(VIDEO_STAGE);
    return;
  }
  const adapter = getVideoProviderRegistry().adapters[fresh.videoProvider];
  if (!adapter) {
    insertProviderRequest(requestId, sceneId, 0, "not_retryable_failure", attemptNumber, "video");
    markProviderRequestResolved(requestId);
    concurrency.release(VIDEO_STAGE);
    applyVideoFailureOutcome(sceneId, { kind: "failed_not_retryable", reason: `no adapter for the bound video provider '${fresh.videoProvider}'` }, attemptNumber);
    broadcast(fresh.runId);
    return;
  }

  const elapsed = Date.now() - sentAtMs;
  if (elapsed > PER_PHASE_MAX_TIME_SECONDS.video * 1000) {
    insertProviderRequest(requestId, sceneId, elapsed, "transient_failure", attemptNumber, "video");
    markProviderRequestResolved(requestId);
    concurrency.release(VIDEO_STAGE);
    applyVideoFailureOutcome(sceneId, { kind: "failed_transient", reason: `the clip request exceeded the ${PER_PHASE_MAX_TIME_SECONDS.video} s phase limit` }, attemptNumber);
    broadcast(fresh.runId);
    return;
  }

  let pollResult: VideoGenerationResult;
  try {
    pollResult = await adapter.poll(requestId);
  } catch (err) {
    pollResult = { kind: "failed_transient", reason: "the video provider threw during polling" };
  }

  if (pollResult.kind === "pending") {
    const timer = setTimeout(() => { void pollVideoRequestOnce(sceneId, requestId, attemptNumber, sentAtMs); }, videoPollIntervalMs);
    if (typeof timer === "object" && timer !== null && "unref" in timer) (timer as NodeJS.Timeout).unref();
    return;
  }

  const latencyMs = Date.now() - sentAtMs;

  if (pollResult.kind === "not_found" || pollResult.kind === "failed_transient" || pollResult.kind === "failed_not_retryable") {
    const isNotRetryable = pollResult.kind === "failed_not_retryable";
    const mode = isNotRetryable ? "not_retryable_failure" : "transient_failure";
    const reason = pollResult.kind === "not_found" ? "the video provider no longer holds the request" : pollResult.reason;
    const kind: "failed_not_retryable" | "failed_transient" = isNotRetryable ? "failed_not_retryable" : "failed_transient";
    insertProviderRequest(requestId, sceneId, latencyMs, mode, attemptNumber, "video");
    markProviderRequestResolved(requestId);
    concurrency.release(VIDEO_STAGE);
    applyVideoFailureOutcome(sceneId, { kind, reason }, attemptNumber);
    broadcast(fresh.runId);
    return;
  }

  // success
  const clip = pollResult.clip;
  let clipBytes: Buffer;
  if (clip.source === "bytes") {
    clipBytes = clip.bytes;
  } else {
    const downloaded = await downloadGeneratedClip(clip.url);
    if (!downloaded.ok) {
      insertProviderRequest(requestId, sceneId, latencyMs, "transient_failure", attemptNumber, "video");
      markProviderRequestResolved(requestId);
      concurrency.release(VIDEO_STAGE);
      applyVideoFailureOutcome(sceneId, { kind: "failed_transient", reason: downloaded.reason }, attemptNumber);
      broadcast(fresh.runId);
      return;
    }
    clipBytes = downloaded.bytes;
  }

  if (!isMp4(clipBytes)) {
    insertProviderRequest(requestId, sceneId, latencyMs, "transient_failure", attemptNumber, "video");
    markProviderRequestResolved(requestId);
    concurrency.release(VIDEO_STAGE);
    applyVideoFailureOutcome(sceneId, { kind: "failed_transient", reason: "the downloaded file is not an MP4" }, attemptNumber);
    broadcast(fresh.runId);
    return;
  }

  const run = getRun(fresh.runId)!;
  let relativePath: string;
  try {
    relativePath = writeArtefactOnce(run.projectFolder, `scene-${fresh.index}.mp4`, clipBytes);
  } catch (err) {
    if (err instanceof ArtefactAlreadyExistsError) {
      // Duplicate success — already committed; release and return
      insertProviderRequest(requestId, sceneId, latencyMs, "success", attemptNumber, "video");
      markProviderRequestResolved(requestId);
      concurrency.release(VIDEO_STAGE);
      return;
    }
    insertProviderRequest(requestId, sceneId, latencyMs, "transient_failure", attemptNumber, "video");
    markProviderRequestResolved(requestId);
    concurrency.release(VIDEO_STAGE);
    applyVideoFailureOutcome(sceneId, { kind: "failed_transient", reason: err instanceof Error ? err.message : "failed to write the clip file" }, attemptNumber);
    broadcast(fresh.runId);
    return;
  }

  insertProviderRequest(requestId, sceneId, latencyMs, "success", attemptNumber, "video");
  markProviderRequestResolved(requestId);
  concurrency.release(VIDEO_STAGE);
  completeVideoStage(sceneId, relativePath);
  broadcast(fresh.runId);
}

async function runVideoAttempt(sceneId: string): Promise<void> {
  // Yield before any DB writes so that image-complete observers (e.g. 5ms
  // waitFor polls in tests) can fire before we transition to video-generating.
  // videoStageStartDelayMs is 0 in production; tests that only test the image
  // stage set it to a large value so the video stage never starts during them.
  if (videoStageStartDelayMs > 0) {
    await new Promise<void>(resolve => {
      const t = setTimeout(resolve, videoStageStartDelayMs);
      if (typeof t === "object" && t !== null && "unref" in t) (t as NodeJS.Timeout).unref();
    });
  }

  const fresh = getScene(sceneId);
  if (!fresh || fresh.status !== "image-complete") {
    concurrency.release(VIDEO_STAGE);
    return;
  }
  const freshRun = getRun(fresh.runId);
  if (!freshRun || !admitLaunch(fresh.runId).admitted) {
    concurrency.release(VIDEO_STAGE);
    return;
  }

  // Decision 4 — need stored requested duration
  if (fresh.requestedDurationSeconds === null) {
    if (fresh.videoProvider === null) resetAttemptsForVideoStart(sceneId);
    concurrency.release(VIDEO_STAGE);
    markSceneFailed(sceneId, "no requested duration is stored for this chunk (not retryable)");
    broadcast(fresh.runId);
    return;
  }

  // Decision 1 — need a readable image file
  if (!fresh.result) {
    if (fresh.videoProvider === null) resetAttemptsForVideoStart(sceneId);
    concurrency.release(VIDEO_STAGE);
    markSceneFailed(sceneId, "no image path is stored for this chunk (not retryable)");
    broadcast(fresh.runId);
    return;
  }

  let imageBytes: Buffer;
  try {
    imageBytes = readFileSync(resolveArtefactPath(freshRun.projectFolder, fresh.result));
  } catch {
    if (fresh.videoProvider === null) resetAttemptsForVideoStart(sceneId);
    concurrency.release(VIDEO_STAGE);
    markSceneFailed(sceneId, `the image file '${fresh.result}' could not be read (not retryable)`);
    broadcast(fresh.runId);
    return;
  }

  // Bind on first attempt (Decision 5); reset per-stage attempt counter
  const isFirstAttempt = fresh.videoProvider === null;
  const registry = getVideoProviderRegistry();
  if (isFirstAttempt) {
    bindSceneVideoProvider(sceneId, registry.defaultIdentifier);
    resetAttemptsForVideoStart(sceneId);
  }
  const reread = getScene(sceneId)!;
  const boundId = reread.videoProvider ?? registry.defaultIdentifier;
  const adapter = registry.adapters[boundId];

  const attemptNumber = (isFirstAttempt ? 0 : reread.attempts) + 1;
  const localId = randomUUID();
  markVideoGenerating(sceneId, localId, attemptNumber);
  broadcast(fresh.runId);

  if (!adapter) {
    insertProviderRequest(localId, sceneId, 0, "not_retryable_failure", attemptNumber, "video");
    markProviderRequestResolved(localId);
    concurrency.release(VIDEO_STAGE);
    applyVideoFailureOutcome(sceneId, { kind: "failed_not_retryable", reason: `no adapter is configured for the bound video provider '${boundId}'` }, attemptNumber);
    broadcast(fresh.runId);
    return;
  }

  const sentAtMs = Date.now();
  let submitResult: VideoSubmitResult;
  try {
    submitResult = await adapter.submit({
      imageBytes,
      instruction: fresh.videoInstruction,
      durationSeconds: fresh.requestedDurationSeconds,
    });
  } catch (err) {
    submitResult = {
      kind: "failed_transient",
      reason: err instanceof Error ? `video provider submit threw: ${err.message}` : "video provider submit threw",
    };
  }

  if (submitResult.kind !== "submitted") {
    const latencyMs = Date.now() - sentAtMs;
    const mode = submitResult.kind === "failed_not_retryable" ? "not_retryable_failure" : "transient_failure";
    insertProviderRequest(localId, sceneId, latencyMs, mode, attemptNumber, "video");
    markProviderRequestResolved(localId);
    concurrency.release(VIDEO_STAGE);
    applyVideoFailureOutcome(sceneId, submitResult, attemptNumber);
    broadcast(fresh.runId);
    return;
  }

  // Update current_request_id to the provider's taskId for restart reconciliation
  db.prepare("UPDATE scenes SET current_request_id = ? WHERE id = ?").run(submitResult.requestId, sceneId);

  await pollVideoRequestOnce(sceneId, submitResult.requestId, attemptNumber, sentAtMs);
}

export function launchVideoStage(sceneId: string): void {
  const scene = getScene(sceneId);
  if (!scene || scene.status !== "image-complete") return;
  if (!admitLaunch(scene.runId).admitted) return;

  concurrency.acquire(VIDEO_STAGE, () => {
    void runVideoAttempt(sceneId);
  });
}

export function launchVideoStageForRun(runId: string): void {
  for (const scene of getImageCompleteScenesForRun(runId).filter((item) => item.requestedDurationSeconds !== null)) {
    launchVideoStage(scene.id);
  }
}

export const imageStageLauncher: StageLauncher = {
  stage: "image",
  heldWork: (sessionId: string) => {
    const scenes = getSubmittedScenesForRun(sessionId);
    return { count: scenes.length, sceneIds: scenes.map((s) => s.id) };
  },
  launch: (sessionId: string) => {
    for (const scene of getSubmittedScenesForRun(sessionId)) {
      launchSceneStage(scene.id);
    }
  },
};

registerStageLauncher(imageStageLauncher);

export const videoStageLauncher: StageLauncher = {
  stage: "video",
  heldWork: (sessionId: string) => {
    const scenes = getImageCompleteScenesForRun(sessionId).filter((scene) => scene.requestedDurationSeconds !== null);
    return { count: scenes.length, sceneIds: scenes.map((s) => s.id) };
  },
  launch: launchVideoStageForRun,
};

registerStageLauncher(videoStageLauncher);

async function runImageAttempt(sceneId: string): Promise<void> {
  const fresh = getScene(sceneId);
  if (!fresh || fresh.status !== "submitted") {
    concurrency.release(STAGE);
    return;
  }
  if (!admitLaunch(fresh.runId).admitted) {
    // Paused while queued: give the slot to the next waiter without
    // sending anything. No attempt is consumed (design Decision 2).
    // An unknown session (missing run) is also not admitted.
    concurrency.release(STAGE);
    return;
  }
  const freshRun = getRun(fresh.runId)!;

  // design Decision 3 — bound once, atomically, and only if still unbound.
  const registry = getImageProviderRegistry();
  bindSceneImageProvider(fresh.id, registry.defaultIdentifier);
  const boundIdentifier = getScene(fresh.id)!.provider;
  const adapter = registry.adapters[boundIdentifier];

  _postAdmitHook?.(fresh.runId);
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
  const changed = setRunPaused(runId, true);
  if (changed) broadcast(runId);
  return { ok: true };
}

/** Continuing removes the marker and leaves state unchanged, then launches
 * everything that was held. Only sweeps when the pause marker was actually set. */
export function continueSession(runId: string): { ok: boolean; reason?: string } {
  const run = getRun(runId);
  if (!run) return { ok: false, reason: "unknown session" };
  const changed = setRunPaused(runId, false);
  broadcast(runId);
  if (changed) launchHeldWork(runId);
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
    // Only launch video stage for real registered chunks (not createScene skeletons).
    const scene = getScene(sceneId);
    if (scene?.requestedDurationSeconds != null) {
      launchVideoStage(sceneId); // JOS-146 Decision 2 — launch video stage after image complete
    }
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
  applyFailureOutcome(scene.id, outcome, attemptNumber, () => launchSceneStage(scene.id));
}

/**
 * A manual retry, per PRD §10.2: only valid from `failed`, starts a fresh
 * cycle of up to RETRY_BUDGET automatic retries.
 */
export function manualRetry(sceneId: string): { ok: boolean; reason?: string } {
  const scene = getScene(sceneId);
  if (!scene) return { ok: false, reason: "unknown scene" };
  if (scene.status !== "failed") return { ok: false, reason: `cannot retry a scene in status '${scene.status}'` };
  // Decision 7 (JOS-146) — video-stage failures are not retryable manually until JOS-158.
  if (scene.result !== null) {
    return { ok: false, reason: "retrying a failed clip is not available yet" };
  }
  markScenePendingRetry(sceneId, scene.lastError ?? "manual retry");
  // A manual retry starts a fresh cycle: reset the attempt counter so the
  // scene gets a full 1 + RETRY_BUDGET budget again, per PRD §10.2.
  resetAttemptsForManualRetry(sceneId);
  launchSceneStage(sceneId);
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
  // Decision 7 (JOS-146) — video-stage failures are not correctable until JOS-158.
  if (scene.result !== null) {
    return { ok: false, reason: "retrying a failed clip is not available yet" };
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

  // JOS-146 Decision 9 — reconcile video-generating scenes through the bound adapter.
  for (const scene of getAllVideoGeneratingScenes()) {
    if (!scene.videoProvider) {
      // No bound provider — treat as a lost attempt
      applyVideoFailureOutcome(
        scene.id,
        { kind: "failed_transient", reason: "the video request was interrupted by a restart (no bound provider)" },
        scene.attempts,
      );
      broadcast(scene.runId);
      recordedFailedAttempt++;
      continue;
    }

    const requestId = sceneCurrentRequestId(scene.id);
    if (!requestId) {
      applyVideoFailureOutcome(
        scene.id,
        { kind: "failed_transient", reason: "the video request id was lost on restart" },
        scene.attempts,
      );
      broadcast(scene.runId);
      recordedFailedAttempt++;
      continue;
    }

    // Re-acquire a slot and resume polling from now (gives the full phase window after restart).
    const capturedId = scene.id;
    const capturedReqId = requestId;
    const capturedAttempt = scene.attempts;
    const sentAtMs = Date.now();
    concurrency.acquire(VIDEO_STAGE, () => {
      void pollVideoRequestOnce(capturedId, capturedReqId, capturedAttempt, sentAtMs);
    });
    stillPending++;
  }

  return { resumed, recordedFailedAttempt, stillPending };
}
