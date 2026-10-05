import type { PhaseProgress } from "./types";

export interface PhaseActions {
  retry: boolean;
}

/**
 * view-progress-by-phase (JOS-168), Decision 7 — the one place phase actions
 * are derived, mirroring `sceneActions`. No manual-retry endpoint exists for the
 * voice-over, decomposition or assembly phase yet, and the scenes phase acts
 * per scene, so nothing is offered. US-23 to US-27 extend this when they add
 * their endpoints; the page must never offer an action the backend rejects.
 */
export function phaseActions(_phase: PhaseProgress): PhaseActions {
  return { retry: false };
}
