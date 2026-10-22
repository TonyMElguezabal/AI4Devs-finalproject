import { useState } from "react";
import type { AdminToolsContext } from "./AdminPage";
import { ActiveProvidersSection } from "./ActiveProvidersSection";
import { ProviderProfilesSection } from "./ProviderProfilesSection";

/** The Administrator tools: the active provider of each stage (JOS-171) and the providers themselves (JOS-218). */
export function AdminTools(context: AdminToolsContext) {
  // A change to a provider reloads the selectors, which list the providers.
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <ActiveProvidersSection {...context} refreshKey={refreshKey} />
      <ProviderProfilesSection {...context} onChanged={() => setRefreshKey((key) => key + 1)} />
    </>
  );
}
