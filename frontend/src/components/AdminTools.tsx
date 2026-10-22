import { useState } from "react";
import type { AdminToolsContext } from "./AdminPage";
import { ActiveProvidersSection } from "./ActiveProvidersSection";
import { FailedStagesSection } from "./FailedStagesSection";
import { ProviderProfilesSection } from "./ProviderProfilesSection";
import { ReportsSection } from "./ReportsSection";

/** The Administrator tools: the active provider of each stage (JOS-171), the providers themselves (JOS-218) the failed stages to move (JOS-172) and the reports (JOS-223). */
export function AdminTools(context: AdminToolsContext) {
  // A change to a provider reloads the selectors, which list the providers; a change of the active provider reloads the
  // list, which shows which one is active.
  const [selectorsKey, setSelectorsKey] = useState(0);
  const [listKey, setListKey] = useState(0);
  // The failed stages depend on which provider is active and on the providers: they read again on either change.
  const [failedKey, setFailedKey] = useState(0);
  return (
    <>
      <ActiveProvidersSection
        {...context}
        refreshKey={selectorsKey}
        onChanged={() => {
          setListKey((key) => key + 1);
          setFailedKey((key) => key + 1);
        }}
      />
      <ProviderProfilesSection
        {...context}
        refreshKey={listKey}
        onChanged={() => {
          setSelectorsKey((key) => key + 1);
          setFailedKey((key) => key + 1);
        }}
      />
      <FailedStagesSection {...context} refreshKey={failedKey} />
      <ReportsSection {...context} />
    </>
  );
}
