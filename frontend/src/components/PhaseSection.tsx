import type { ReactNode } from "react";
import type { PhaseProgress } from "../types";
import { phaseActions } from "../phaseActions";
import { PHASE_LABEL, PHASE_STATUS_LABEL } from "../phaseLabels";
import { phaseStatusClass } from "../styles/status";
import { PhaseRetryButton } from "./PhaseRetryButton";
import { StatusPill } from "./StatusPill";
import { Icon } from "./Icon";
import { formatStageDiagnostic } from "../stageDiagnostics";

interface Props {
  progress: PhaseProgress;
  /** Starts the phase's retry; rejects with the refusal reason. Required for a phase that offers retry. */
  onRetry?: () => Promise<unknown>;
  children?: ReactNode;
}

/**
 * view-progress-by-phase (JOS-168), Decisions 6 and 7 — one section per
 * phase. Status, held count and failure come from the session read; nothing
 * is derived here. Actions come from `phaseActions`.
 *
 * redesign-visual-design (JOS-198), Decision 4 — a card: the status is a pill, a failure and its retry share
 * one callout, held work is a neutral callout.
 */
export function PhaseSection({ progress, onRetry, children }: Props) {
  const label = PHASE_LABEL[progress.phase];
  const actions = phaseActions(progress);
  const statusClass = phaseStatusClass(progress.status);
  const retryButton = actions.retry && onRetry ? <PhaseRetryButton label={`Retry ${label.toLowerCase()}`} onRetry={onRetry} /> : null;

  return (
    <section aria-label={`${label} phase`} className={`phase-section card pop ${statusClass}`}>
      <div className="phase-head">
        <h2 className="phase-heading">{label}</h2>
        <StatusPill statusClass={statusClass} label={PHASE_STATUS_LABEL[progress.status]} />
      </div>
      {progress.heldCount > 0 && (
        <div className="callout callout-info">
          <Icon name="pause" />
          <p className="phase-held">Waiting for you to continue ({progress.heldCount} held)</p>
        </div>
      )}
      {progress.failure ? (
        <div className="callout callout-failed">
          <Icon name="failed" />
          <div className="callout-body">
            <p role="alert">{progress.failure.cause}</p>
            {retryButton}
          </div>
        </div>
      ) : (
        retryButton
      )}
      {progress.stages.length > 0 && (
        <ul aria-label={`${label} stages`} className="phase-stages">
          {progress.stages.map((diagnostic) => (
            <li key={diagnostic.stage}>{formatStageDiagnostic(diagnostic)}</li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}
