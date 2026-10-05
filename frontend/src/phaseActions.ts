import type { PhaseProgress } from "./types";

export interface PhaseActions {
  retry: boolean;
}

/**
 * view-progress-by-phase (JOS-168), Decision 7 — the one place phase actions
 * are derived, mirroring `sceneActions`. Retry is offered for a failed
 * decomposition whose failure is retryable (retry-decomposition, JOS-156,
 * Decision 8). The voice-over and assembly phases offer nothing until their
 * stories add endpoints, and the scenes phase acts per scene; the page must
 * never offer an action the backend rejects.
 */
export function phaseActions(phase: PhaseProgress): PhaseActions {
  return { retry: phase.phase === "decomposition" && phase.status === "failed" && phase.failure?.retryable === true };
}
