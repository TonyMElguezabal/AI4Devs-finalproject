import { useEffect, useState } from "react";
import { getAdminProviders, putAdminProvider } from "../api/client";
import type { ProviderStage, ProviderView } from "../types";

const STAGE_LABELS: Record<ProviderStage, string> = {
  reasoning: "Reasoning",
  voice: "Voice",
  alignment: "Alignment",
  image: "Image",
  video: "Video",
};

interface Props {
  password: string;
  /** An Administrator request was refused with 401: the page locks again. */
  onDenied: () => void;
  /** Changes when a provider was added, edited or deleted, so the selectors reload their options (JOS-218). */
  refreshKey?: number;
}

/**
 * change-active-provider-from-admin (JOS-171), design Decision 6 — one row per stage: a select of the providers
 * the app ships for it, set to the active one, with where that choice comes from. A change applies to the next
 * stage that is not yet bound; running stages keep their provider (PRD §11.2). The Administrator is the only
 * writer, so there is no live update.
 */
export function ActiveProvidersSection({ password, onDenied, refreshKey = 0 }: Props) {
  const [views, setViews] = useState<ProviderView[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busyStage, setBusyStage] = useState<ProviderStage | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getAdminProviders(password)
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "denied") onDenied();
        else setViews(result.providers);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the providers. Is the app running?");
      });
    return () => {
      cancelled = true;
    };
    // The password and the lock callback do not change while the section is shown.
  }, [refreshKey]);

  async function handleChange(stage: ProviderStage, providerId: string) {
    setError(undefined);
    setBusyStage(stage);
    try {
      const result = await putAdminProvider(password, stage, providerId);
      if (result.kind === "denied") onDenied();
      else if (result.kind === "refused") setError(`${STAGE_LABELS[stage]}: that provider cannot be chosen. Available: ${result.selectable.join(", ")}.`);
      else setViews((current) => current?.map((view) => (view.stage === stage ? result.view : view)));
    } catch {
      setError(`${STAGE_LABELS[stage]}: the change could not be saved. Is the app running?`);
    } finally {
      setBusyStage(undefined);
    }
  }

  return (
    <section aria-label="Active providers" className="field">
      <h2>Active providers</h2>
      <p>A change applies to work that has not started its stage yet. Work already running keeps its provider.</p>
      {views === undefined && !error && <p className="session-loading">Loading providers…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {views?.map((view) => {
        const id = `provider-${view.stage}`;
        const label = STAGE_LABELS[view.stage];
        return (
          <div className="field" key={view.stage}>
            <label htmlFor={id}>{`${label} provider`}</label>
            <select
              id={id}
              value={view.activeProviderId}
              disabled={view.selectable.length < 2 || busyStage === view.stage}
              onChange={(event) => void handleChange(view.stage, event.target.value)}
            >
              {view.selectable.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <span>{view.source === "admin" ? "set on /admin" : "from settings files"}</span>
            {view.orphanedChoice && <span role="status">{`The choice "${view.orphanedChoice}" is no longer shipped; the settings default is used.`}</span>}
          </div>
        );
      })}
    </section>
  );
}
