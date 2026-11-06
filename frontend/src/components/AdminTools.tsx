import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AdminToolsContext } from "./AdminPage";
import { ActiveProvidersSection } from "./ActiveProvidersSection";
import { FailedStagesSection } from "./FailedStagesSection";
import { ProviderProfilesSection } from "./ProviderProfilesSection";
import { ReportsSection } from "./ReportsSection";
import { VisualStyleSection } from "./VisualStyleSection";

const TABS = [
  { id: "settings", label: "Settings" },
  { id: "providers", label: "Providers" },
  { id: "failed-stages", label: "Failed stages" },
  { id: "reports", label: "Reports" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** admin-tabs-and-tables (JOS-270), Decision 1 — the tab named by the address hash; an empty or unknown hash is Settings. */
function tabFromHash(): TabId {
  const name = window.location.hash.slice(1);
  return TABS.find((tab) => tab.id === name)?.id ?? "settings";
}

/**
 * The Administrator tools in four tabs (admin-tabs-and-tables, JOS-270): Settings (the visual style of new projects,
 * JOS-201, and the active provider of each stage, JOS-171), Providers (JOS-218), Failed stages (JOS-172) and Reports
 * (JOS-223). Only the chosen tab is mounted, so the reports are not read until they are asked for.
 */
export function AdminTools(context: AdminToolsContext) {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // A change to a provider reloads the selectors, which list the providers; a change of the active provider reloads the
  // list, which shows which one is active.
  const [selectorsKey, setSelectorsKey] = useState(0);
  const [listKey, setListKey] = useState(0);
  // The failed stages depend on which provider is active and on the providers: they read again on either change.
  const [failedKey, setFailedKey] = useState(0);

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function choose(next: TabId) {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  }

  function handleKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length]!;
    choose(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Administrator tools" className="tabs">
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[item.id] = element;
            }}
            type="button"
            role="tab"
            id={`admin-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`admin-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => choose(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`admin-panel-${tab}`} aria-labelledby={`admin-tab-${tab}`} className="tab-panel">
        {tab === "settings" && (
          <>
            <VisualStyleSection {...context} />
            <ActiveProvidersSection
              {...context}
              refreshKey={selectorsKey}
              onChanged={() => {
                setListKey((key) => key + 1);
                setFailedKey((key) => key + 1);
              }}
            />
          </>
        )}
        {tab === "providers" && (
          <ProviderProfilesSection
            {...context}
            refreshKey={listKey}
            onChanged={() => {
              setSelectorsKey((key) => key + 1);
              setFailedKey((key) => key + 1);
            }}
          />
        )}
        {tab === "failed-stages" && <FailedStagesSection {...context} refreshKey={failedKey} />}
        {tab === "reports" && <ReportsSection {...context} />}
      </div>
    </>
  );
}
