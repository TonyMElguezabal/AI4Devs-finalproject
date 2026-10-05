import type { Phase, PhaseStatus } from "./types";

/** The text label of each phase status; colour only adds to it (define-visual-design, Decision 3). */
export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  pending: "Not started",
  "in-progress": "In progress",
  complete: "Complete",
  failed: "Failed",
};

/** The phase names; the section's accessible name is `{label} phase` (frontend-standards.md). */
export const PHASE_LABEL: Record<Phase, string> = {
  "voice-over": "Voice-over",
  decomposition: "Decomposition",
  scenes: "Scenes",
  assembly: "Final video",
};
