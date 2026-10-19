import type { PhaseProgress } from "./types";

export interface PhaseActions {
  retry: boolean;
}

/**
 * view-progress-by-phase (JOS-168), Decision 7 — the one place phase actions
 * are derived, mirroring `sceneActions`. Retry is offered for a failed
 * decomposition whose failure is retryable (retry-decomposition, JOS-156,
 * Decision 8), and for a failed assembly whatever `retryable` is
 * (retry-final-assembly, JOS-159, Decision 7 — nothing generated is ever
 * lost, so a retry costs nothing extra to offer even after a failure the
 * backend itself won't retry automatically), and for a failed voice-over
 * whose failure is retryable (retry-voice-over, JOS-155, Decision 8 — the
 * backend refuses a not-retryable one). The scenes phase acts per scene; the
 * page must never offer an action the backend rejects.
 */
export function phaseActions(phase: PhaseProgress): PhaseActions {
  if (phase.status !== "failed") return { retry: false };
  if (phase.phase === "voice-over") return { retry: phase.failure?.retryable === true };
  if (phase.phase === "decomposition") return { retry: phase.failure?.retryable === true };
  if (phase.phase === "assembly") return { retry: true };
  return { retry: false };
}
