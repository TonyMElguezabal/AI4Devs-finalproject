import { assemblyGate } from "./assemblyGate.ts";
import { getRun, getScenesForRun, getStageAttempts, requestFinalVideoRebuild } from "./db.ts";
import { admitLaunch } from "./launchGate.ts";
import { assemblyStageLauncher, broadcast } from "./orchestrator.ts";
import { hasPendingPauseEdits } from "./sessionPauses.ts";

// adjust-scene-pause (JOS-190), design Decision 6 — the one command behind "Rebuild final video". A refusal is decided
// entirely from the store; the request is recorded atomically before anything is launched, so two calls cannot both run.

export type RebuildRefusal = "session-not-found" | "no-final-video" | "assembly-in-progress" | "scenes-not-complete" | "nothing-to-rebuild";

export type RebuildResult = { ok: true; held: boolean } | { ok: false; reason: RebuildRefusal };

export function rebuildFinalVideo(sessionId: string): RebuildResult {
  const run = getRun(sessionId);
  if (!run) return { ok: false, reason: "session-not-found" };
  if (!run.finalVideoPath) return { ok: false, reason: "no-final-video" };
  const running = getStageAttempts(sessionId, "assembly").some((attempt) => attempt.outcome === "in-flight");
  if (running || run.rebuildRequestedAt) return { ok: false, reason: "assembly-in-progress" };
  // rebuild-scene (JOS-235), Decision 7 — never assemble while a scene has no clip (a scene is being rebuilt or has failed).
  if (!assemblyGate(getScenesForRun(sessionId)).open) return { ok: false, reason: "scenes-not-complete" };
  if (!run.finalVideoStale && !hasPendingPauseEdits(sessionId)) return { ok: false, reason: "nothing-to-rebuild" };
  // The sole arbiter against a second, truly concurrent call (this function has no `await`, so none can interleave).
  if (!requestFinalVideoRebuild(sessionId)) return { ok: false, reason: "assembly-in-progress" };

  assemblyStageLauncher.launch(sessionId);
  broadcast(sessionId);
  return { ok: true, held: !admitLaunch(sessionId).admitted };
}
