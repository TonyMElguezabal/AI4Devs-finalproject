import { getFinalVideoBuilds, getRun, getScenePauseEdits, getStageAttempts, requestFinalVideoRebuild } from "./db.ts";
import { admitLaunch } from "./launchGate.ts";
import { assemblyStageLauncher, broadcast } from "./orchestrator.ts";

// adjust-scene-pause (JOS-190), design Decision 6 — the one command behind "Rebuild final video". A refusal is decided
// entirely from the store; the request is recorded atomically before anything is launched, so two calls cannot both run.

export type RebuildRefusal = "session-not-found" | "no-final-video" | "assembly-in-progress" | "nothing-to-rebuild";

export type RebuildResult = { ok: true; held: boolean } | { ok: false; reason: RebuildRefusal };

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

export function rebuildFinalVideo(sessionId: string): RebuildResult {
  const run = getRun(sessionId);
  if (!run) return { ok: false, reason: "session-not-found" };
  if (!run.finalVideoPath) return { ok: false, reason: "no-final-video" };
  const running = getStageAttempts(sessionId, "assembly").some((attempt) => attempt.outcome === "in-flight");
  if (running || run.rebuildRequestedAt) return { ok: false, reason: "assembly-in-progress" };
  if (!hasPendingPauseEdits(sessionId)) return { ok: false, reason: "nothing-to-rebuild" };
  // The sole arbiter against a second, truly concurrent call (this function has no `await`, so none can interleave).
  if (!requestFinalVideoRebuild(sessionId)) return { ok: false, reason: "assembly-in-progress" };

  assemblyStageLauncher.launch(sessionId);
  broadcast(sessionId);
  return { ok: true, held: !admitLaunch(sessionId).admitted };
}
