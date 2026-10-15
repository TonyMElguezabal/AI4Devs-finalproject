import { clearScenePauseEdit, getRun, getSceneForRun, getStageAttempts, setScenePauseEdit } from "./db.ts";
import { SPEED_FACTOR_LIMIT } from "./config/providers.ts";
import { broadcast } from "./orchestrator.ts";
import { PAUSE_STEP_SECONDS, isAllowedPause } from "./scenePause.ts";
import { scenePauseViews } from "./sessionPauses.ts";
import type { ScenePauseView } from "./types.ts";

// adjust-scene-pause (JOS-190), design Decision 9 — the one command behind "Pause after scene N". Every refusal is
// decided from the store before anything is written; nothing locked is read for writing.

export type ScenePauseRefusal =
  | "session-not-found"
  | "unknown-scene"
  | "no-final-video"
  | "assembly-in-progress"
  | "no-pause";

export type ScenePauseResult =
  | { ok: true; view: ScenePauseView }
  | { ok: false; reason: ScenePauseRefusal }
  | { ok: false; reason: "out-of-range"; message: string };

const oneDecimal = (seconds: number): string => seconds.toFixed(1);

/** The 422 sentence: what is allowed, and, when the speed-factor limit narrowed it, why. */
function outOfRangeMessage(index: number, seconds: number, view: ScenePauseView): string {
  const range = `The pause after scene ${index} can be ${oneDecimal(view.minSeconds)} s to ${oneDecimal(view.maxSeconds)} s, in steps of ${oneDecimal(PAUSE_STEP_SECONDS)} s`;
  const onGrid = Math.abs(seconds / PAUSE_STEP_SECONDS - Math.round(seconds / PAUSE_STEP_SECONDS)) < 1e-6;
  const why =
    onGrid && view.limitedBySpeedFactor
      ? ` (a pause outside that range would speed or slow this scene's clip past ${oneDecimal(SPEED_FACTOR_LIMIT)}×)`
      : "";
  return `${range}${why}, or its original ${oneDecimal(view.originalSeconds)} s.`;
}

export function setScenePause(sessionId: string, sceneId: string, seconds: number): ScenePauseResult {
  const run = getRun(sessionId);
  if (!run) return { ok: false, reason: "session-not-found" };
  const scene = getSceneForRun(sessionId, sceneId);
  if (!scene) return { ok: false, reason: "unknown-scene" };
  if (!run.finalVideoPath) return { ok: false, reason: "no-final-video" };
  const running = getStageAttempts(sessionId, "assembly").some((attempt) => attempt.outcome === "in-flight");
  if (running || run.rebuildRequestedAt) return { ok: false, reason: "assembly-in-progress" };

  const view = scenePauseViews(sessionId).get(sceneId);
  if (!view) return { ok: false, reason: "no-pause" };
  const range = { originalSeconds: view.originalSeconds, minSeconds: view.minSeconds, maxSeconds: view.maxSeconds, limitedBySpeedFactor: view.limitedBySpeedFactor };
  if (!isAllowedPause(range, seconds)) return { ok: false, reason: "out-of-range", message: outOfRangeMessage(scene.index, seconds, view) };

  // The original pause is stored as no edit at all, so "no row" always means "unchanged" (design Decision 3).
  if (Math.abs(seconds - view.originalSeconds) < 1e-6) clearScenePauseEdit(sceneId);
  else setScenePauseEdit(sessionId, sceneId, Math.round(seconds * 10) / 10); // `n * 0.1` would store 3.3000000000000003

  broadcast(sessionId);
  return { ok: true, view: scenePauseViews(sessionId).get(sceneId)! };
}
