import { assemblyGate } from "./assemblyGate.ts";
import { beginAssemblyRetry, getRun, getScenesForRun } from "./db.ts";
import { admitLaunch } from "./launchGate.ts";
import { assemblyStageLauncher, broadcast } from "./orchestrator.ts";

// retry-final-assembly (JOS-159) Decision 3 — the one command behind the manual assembly retry. A refusal is
// decided entirely from the store; nothing is sent to the assembly tool until `beginAssemblyRetry` has committed.

export type AssemblyRetryRefusal = "session-not-found" | "not-failed-in-assembly" | "scenes-not-complete" | "final-video-already-generated";

export type AssemblyRetryResult = { ok: true; held: boolean } | { ok: false; reason: AssemblyRetryRefusal };

export function retryAssembly(sessionId: string): AssemblyRetryResult {
  const run = getRun(sessionId);
  if (!run) return { ok: false, reason: "session-not-found" };
  if (run.failure?.phase !== "assembly") return { ok: false, reason: "not-failed-in-assembly" };
  if (!assemblyGate(getScenesForRun(sessionId)).open) return { ok: false, reason: "scenes-not-complete" };
  if (run.finalVideoPath) return { ok: false, reason: "final-video-already-generated" };
  // `beginAssemblyRetry` re-reads and clears `run.failure` atomically — the sole arbiter against a second, truly
  // concurrent call: this whole function has no `await`, so two calls can never interleave mid-body in Node's
  // single-threaded event loop, and the loser's re-read here always sees the winner's clear already applied,
  // landing on this same, accurate reason (there is nothing to call pending) as the early check just above.
  if (!beginAssemblyRetry(sessionId)) return { ok: false, reason: "not-failed-in-assembly" };

  assemblyStageLauncher.launch(sessionId);
  broadcast(sessionId);
  return { ok: true, held: !admitLaunch(sessionId).admitted };
}
