import { useEffect, useState } from "react";
import { getAppUpdate } from "../api/client";
import type { AppUpdate } from "../types";

/**
 * add-observability-telemetry (JOS-199), design Decision 10 — asks `GET /app/update` once on load. A failed
 * request shows nothing. Dismissing keeps the choice in component state only, so it returns on the next launch.
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<AppUpdate | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getAppUpdate().then(setUpdate).catch(() => setUpdate(undefined));
  }, []);

  if (dismissed || !update?.available) return null;
  return (
    <aside className="update-banner" aria-label="Update available">
      <span>A new version of Vid4You is available</span>
      <a href={update.url} target="_blank" rel="noreferrer">
        View release
      </a>
      <button type="button" onClick={() => setDismissed(true)}>
        Dismiss
      </button>
    </aside>
  );
}
