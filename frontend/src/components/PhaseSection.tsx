import type { ReactNode } from "react";
import type { PhaseProgress } from "../types";
import { phaseActions } from "../phaseActions";
import { PHASE_LABEL, PHASE_STATUS_LABEL } from "../phaseLabels";
import { phaseStatusClass } from "../styles/status";

interface Props {
  progress: PhaseProgress;
  children?: ReactNode;
}

/**
 * view-progress-by-phase (JOS-168), Decisions 6 and 7 — one section per
 * phase. Status, held count and failure come from the session read; nothing
 * is derived here. Actions come from `phaseActions` (none today).
 */
export function PhaseSection({ progress, children }: Props) {
  const label = PHASE_LABEL[progress.phase];
  const actions = phaseActions(progress);

  return (
    <section aria-label={`${label} phase`} className={`phase-section ${phaseStatusClass(progress.status)}`}>
      <h2 className="phase-heading">
        {label} <span className="phase-status">{PHASE_STATUS_LABEL[progress.status]}</span>
      </h2>
      {progress.heldCount > 0 && <p className="phase-held">Waiting for you to continue ({progress.heldCount} held)</p>}
      {progress.failure && <p role="alert">{progress.failure.cause}</p>}
      {actions.retry && <button type="button">Retry {label.toLowerCase()}</button>}
      {children}
    </section>
  );
}
