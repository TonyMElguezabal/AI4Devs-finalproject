import { readFileSync } from "node:fs";
import { getFinalVideoBuilds, getNarrationTimestamps, getRun, getScenePauseEdits, getScenesForRun, getVoiceOver, resolveArtefactPath } from "./db.ts";
import type { TimestampCharacter } from "./narrationTimestamps.ts";
import { derivePauses, pauseRange, type PauseEditedScene } from "./scenePause.ts";
import type { ScenePauseView } from "./types.ts";

// adjust-scene-pause (JOS-190) — the store-reading half of `scenePause.ts`: everything a session's pauses are derived
// from (its scenes, its stored character timestamps, its voice-over), gathered once so the session read, the pause route
// and the rebuild all see the same answer.

/** A scene as the pause dial sees it. `originalPauseSeconds` is null when no pause can be derived (no PROMPT, unmatched timestamps). */
export interface PauseSceneState extends Omit<PauseEditedScene, "originalPauseSeconds"> {
  originalPauseSeconds: number | null;
  /** The clip's requested duration (C in the range rule); null for a scene registered without one. */
  requestedDurationSeconds: number | null;
}

export interface SessionPauses {
  voiceOverDurationSeconds: number;
  /** Every scene of the session, in index order (a scene without a derivable pause still shifts when an earlier one changes). */
  scenes: PauseSceneState[];
}

function readStoredCharacters(projectFolder: string, relativePath: string): TimestampCharacter[] | null {
  try {
    const parsed = JSON.parse(readFileSync(resolveArtefactPath(projectFolder, relativePath), "utf8")) as { characters?: unknown };
    if (!Array.isArray(parsed.characters)) return null;
    const characters: TimestampCharacter[] = [];
    for (const entry of parsed.characters as unknown[]) {
      const candidate = entry as { text?: unknown; start?: unknown; end?: unknown };
      if (typeof candidate.text !== "string" || typeof candidate.start !== "number" || typeof candidate.end !== "number") return null;
      characters.push({ text: candidate.text, start: candidate.start, end: candidate.end });
    }
    return characters;
  } catch {
    return null;
  }
}

/** The session's scenes with their derived pauses, or null when the session has no voice-over or no readable timestamps. */
export function loadSessionPauses(runId: string): SessionPauses | null {
  const run = getRun(runId);
  const voiceOver = getVoiceOver(runId);
  const timestamps = getNarrationTimestamps(runId);
  if (!run || !voiceOver || !timestamps) return null;
  const characters = readStoredCharacters(run.projectFolder, timestamps.path);
  if (!characters) return null;

  const scenes = getScenesForRun(runId).sort((a, b) => a.index - b.index);
  const pauses = derivePauses(
    run.script,
    scenes.map((scene) => ({ id: scene.id, index: scene.index, prompt: scene.prompt, narrationInterval: scene.narrationInterval })),
    characters,
  );
  return {
    voiceOverDurationSeconds: voiceOver.durationSeconds,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      index: scene.index,
      narrationInterval: scene.narrationInterval,
      originalPauseSeconds: pauses.get(scene.id) ?? null,
      requestedDurationSeconds: scene.requestedDurationSeconds,
    })),
  };
}

/** The pause edits the current final video was built with: none for the original file (version 1), the latest build's for a rebuild. */
function appliedPauses(runId: string): Record<string, number> {
  return getFinalVideoBuilds(runId).at(-1)?.pauses ?? {};
}

/** True when the stored edits differ from those the current final video was built with. */
export function hasPendingPauseEdits(runId: string): boolean {
  const current = getScenePauseEdits(runId);
  const applied = appliedPauses(runId);
  if (current.size !== Object.keys(applied).length) return true;
  for (const [sceneId, seconds] of current) {
    const was = applied[sceneId];
    if (was === undefined || Math.abs(was - seconds) > 1e-6) return true;
  }
  return false;
}

/** Each editable scene's dial: its original and current pause and the range it may move within (Decision 2). */
export function scenePauseViews(runId: string): Map<string, ScenePauseView> {
  const session = loadSessionPauses(runId);
  const views = new Map<string, ScenePauseView>();
  if (!session) return views;
  const edits = getScenePauseEdits(runId);
  for (const scene of session.scenes) {
    const original = scene.originalPauseSeconds;
    const interval = scene.narrationInterval;
    if (original === null || interval === null || scene.requestedDurationSeconds === null) continue;
    const range = pauseRange({
      clipSeconds: scene.requestedDurationSeconds,
      speechSeconds: interval.endSeconds - interval.startSeconds - original,
      originalSeconds: original,
    });
    views.set(scene.id, { ...range, seconds: edits.get(scene.id) ?? original });
  }
  return views;
}
