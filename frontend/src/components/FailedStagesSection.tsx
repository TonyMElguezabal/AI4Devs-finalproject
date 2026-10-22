import { useEffect, useState } from "react";
import { getFailedStages, moveFailedStage, type MoveRefusalReason } from "../api/client";
import type { FailedStageRow, ProviderStage } from "../types";

const STAGE_LABELS: Record<ProviderStage, string> = { reasoning: "Reasoning", voice: "Voice", alignment: "Alignment", image: "Image", video: "Video" };

const REFUSALS: Record<MoveRefusalReason, string> = {
  "not-found": "This session or scene no longer exists.",
  "not-failed": "This stage is no longer failed.",
  "already-on-active": "This stage is already on the active provider.",
  "retry-in-progress": "A retry of this stage is in progress.",
  "not-retryable": "This failure cannot be retried, so there is nothing to move.",
  "not-usable": "The active provider has no usable API key. Enter its key under Providers first.",
};

interface Props {
  password: string;
  /** An Administrator request was refused with 401: the page locks again. */
  onDenied: () => void;
  /** Changes when the active provider or a provider changed, so the list is read again. */
  refreshKey?: number;
  /** A stage was moved. */
  onChanged?: () => void;
}

const subject = (row: FailedStageRow) => `${row.sessionTitle}${row.sceneNumber ? `, scene ${row.sceneNumber}` : ""}`;

/**
 * move-failed-stage-to-active-provider (JOS-172), design Decision 7 — the failed stages that sit on a provider other than
 * the active one, each with the action that binds it to the active provider. The move sends nothing: the User retries the
 * stage from its session page.
 */
export function FailedStagesSection({ password, onDenied, refreshKey = 0, onChanged }: Props) {
  const [rows, setRows] = useState<FailedStageRow[] | undefined>(undefined);
  const [notice, setNotice] = useState<{ title: string; sessionId: string } | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<string | undefined>(undefined);

  async function load() {
    try {
      const result = await getFailedStages(password);
      if (result.kind === "denied") onDenied();
      else setRows(result.failedStages);
    } catch {
      setError("Could not load the failed stages. Is the app running?");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the failed stages when the section opens or a provider changes
    void load();
    // The password and the lock callback do not change while the section is shown.
  }, [refreshKey]);

  async function handleMove(row: FailedStageRow) {
    setError(undefined);
    setNotice(undefined);
    setBusy(`${row.sessionId}:${row.stage}:${row.sceneId ?? ""}`);
    try {
      const result = await moveFailedStage(password, row);
      if (result.kind === "denied") return onDenied();
      if (result.kind === "refused") setError(REFUSALS[result.reason]);
      else {
        setNotice({ title: row.sessionTitle, sessionId: row.sessionId });
        onChanged?.();
      }
      await load();
    } catch {
      setError("The stage could not be moved. Is the app running?");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section aria-label="Failed stages" className="field">
      <h2>Failed stages</h2>
      <p>A failed stage still bound to a provider other than the active one can be moved to the active provider. The move sends nothing: retry the stage from its session page.</p>
      {rows === undefined && !error && <p className="session-loading">Loading failed stages…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status">
          Moved. Retry it from the session page. <a href={`/?sessionId=${encodeURIComponent(notice.sessionId)}`} aria-label={`Open session ${notice.title}`}>Open session</a>
        </p>
      )}
      {rows?.length === 0 && <p>No failed stage is on a provider other than the active one.</p>}
      {rows && rows.length > 0 && (
        <ul>
          {rows.map((row) => {
            const key = `${row.sessionId}:${row.stage}:${row.sceneId ?? ""}`;
            return (
              <li key={key} aria-label={`${STAGE_LABELS[row.stage]} of ${subject(row)}`}>
                <strong>{STAGE_LABELS[row.stage]}</strong> of {subject(row)}: bound to {row.boundProviderLabel}, active provider {row.activeProviderLabel}
                <div>{row.cause}</div>
                <button type="button" disabled={busy === key} onClick={() => void handleMove(row)}>
                  {`Move ${STAGE_LABELS[row.stage].toLowerCase()} of ${subject(row)} to ${row.activeProviderLabel}`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
