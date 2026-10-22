import { useState } from "react";
import type { AdminToolsContext } from "./AdminPage";
import { ActiveProvidersSection } from "./ActiveProvidersSection";
import { ProviderProfilesSection } from "./ProviderProfilesSection";

/** The Administrator tools: the active provider of each stage (JOS-171) and the providers themselves (JOS-218). */
export function AdminTools(context: AdminToolsContext) {
  // A change to a provider reloads the selectors, which list the providers; a change of the active provider reloads the
  // list, which shows which one is active.
  const [selectorsKey, setSelectorsKey] = useState(0);
  const [listKey, setListKey] = useState(0);
  return (
    <>
      <ActiveProvidersSection {...context} refreshKey={selectorsKey} onChanged={() => setListKey((key) => key + 1)} />
      <ProviderProfilesSection {...context} refreshKey={listKey} onChanged={() => setSelectorsKey((key) => key + 1)} />
    </>
  );
}
