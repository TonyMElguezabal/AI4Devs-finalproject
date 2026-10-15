import type { PhaseProgress } from "../types";
import { PHASE_LABEL, PHASE_STATUS_LABEL } from "../phaseLabels";
import { phaseStatusClass, statusIcon } from "../styles/status";
import { Icon } from "./Icon";

interface Props {
  phases: PhaseProgress[];
}

/**
 * redesign-visual-design (JOS-198), design Decision 4 — the four phases at a glance. Read from `session.phases`
 * only; it derives nothing. A group of plain elements, not a list: scene rows are the page's list items.
 */
export function PhaseStepper({ phases }: Props) {
  return (
    <div role="group" aria-label="Pipeline progress" className="phase-stepper">
      {phases.map((progress) => {
        const statusClass = phaseStatusClass(progress.status);
        return (
          <div key={progress.phase} className={`phase-step pop ${statusClass}`}>
            <span className="phase-step-top">
              <Icon name={statusIcon(statusClass)} />
              <span className="phase-step-name">{PHASE_LABEL[progress.phase]}</span>
            </span>
            <span className="phase-step-status">{PHASE_STATUS_LABEL[progress.status]}</span>
          </div>
        );
      })}
    </div>
  );
}
