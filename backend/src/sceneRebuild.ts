import { getRun, getSceneForRun, getStageAttempts, markSceneForRebuild } from "./db.ts";
import { admitLaunch } from "./launchGate.ts";
import { broadcast, launchSceneStage } from "./orchestrator.ts";

// rebuild-scene (JOS-235), design Decision 2 — the one command behind "Rebuild scene". A refusal is decided entirely from
// the store; the write is conditional and the function has no `await`, so two calls cannot both be accepted.

export type SceneRebuildRefusal = "unknown-scene" | "scene-not-ready" | "assembly-in-progress";

export type SceneRebuildResult = { ok: true; held: boolean } | { ok: false; reason: SceneRebuildRefusal };

export function rebuildScene(
  sessionId: string,
  sceneId: string,
  instructions: { imageInstruction?: string; videoInstruction?: string },
): SceneRebuildResult {
  const run = getRun(sessionId);
  if (!run || !getSceneForRun(sessionId, sceneId)) return { ok: false, reason: "unknown-scene" };
  const assemblyRunning = getStageAttempts(sessionId, "assembly").some((attempt) => attempt.outcome === "in-flight");
  if (assemblyRunning || run.rebuildRequestedAt) return { ok: false, reason: "assembly-in-progress" };
  if (!markSceneForRebuild(sessionId, sceneId, instructions)) return { ok: false, reason: "scene-not-ready" };

  launchSceneStage(sceneId);
  broadcast(sessionId);
  return { ok: true, held: !admitLaunch(sessionId).admitted };
}
