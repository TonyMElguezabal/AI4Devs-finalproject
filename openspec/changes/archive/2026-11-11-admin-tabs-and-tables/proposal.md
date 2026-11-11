## Why

`/admin` has grown to five tools on one long scroll (JOS-201, JOS-171, JOS-218, JOS-172, JOS-223 and the later reports). On screen it breaks down: the report period radios are stretched across the row because the global `input { width: 100% }` rule also hits radios; the provider usage table runs past the card edge; the report tables have no styling; each provider row repeats its name and carries three wide buttons; and the active-provider selects fill the width one under the other. The Administrator cannot find a tool without scrolling past the others, and the reports are hard to read.

## What Changes

- `/admin` shows its tools in four tabs: **Settings** (visual style, active providers), **Providers**, **Failed stages**, **Reports**. The chosen tab is kept in the URL hash, so a tab can be linked and a reload keeps it.
- **Settings**: the active providers become one compact row per stage: stage name, select, and a source badge (`settings files` or `set on /admin`).
- **Providers**: one card per stage, one compact row per provider (name once, an `Active` badge, the key source as muted text). `Edit` stays visible; `Test connection` and `Delete` move into an overflow menu; `Delete` still asks for confirmation in place. `Add … provider` sits in the stage card's header.
- **Reports**: the period selector becomes a segmented control; a row of summary tiles sits above the reports; each report is its own collapsible panel (provider usage and sessions open first); all report tables share one table style inside a horizontal scroll wrapper, with right-aligned tabular numbers, one date format, and the "excludes unpriced providers" note shown once as a footnote instead of in every sessions row.
- The radios no longer take the global full-width input rule.
- No backend change, no new dependency, no change to the Administrator password handling: the 401 lock still locks the whole page.

## Capabilities

### New Capabilities
- `admin-page-layout`: how `/admin` arranges its tools: the tabs and their URL hash, the compact active-provider and provider rows with the overflow menu, and the rule that no content spills out of its card.

### Modified Capabilities
- `admin-reports`: the Reports section requirement. The period selector is presented as a segmented control with the same four choices and the same default; the section adds summary tiles and collapsible report panels; tables scroll inside their own wrapper; the sessions report states the unpriced-providers note once.

## Impact

- Frontend only: `AdminPage.tsx`, `AdminTools.tsx`, `ActiveProvidersSection.tsx`, `ProviderProfilesSection.tsx`, `ReportsSection.tsx`, `ReportPeriodSelector.tsx`, the report table components (`EstimatedCostTable`, `PipelineTimeTables`, `FailuresTables`, `ProviderChangesTable`, `SessionsReport`), plus `styles/app.css` and the `/admin` tests in `frontend/test/`.
- Docs: the `/admin` rows and the "Administrator page" section of `docs/frontend-standards.md`.
- Button and select accessible names stay as they are now, so most existing tests keep passing; tests that click `Delete …`/`Send charged test …` must open the overflow menu first.
- Non-goals: a client-side router, a charting library, a separate `/admin/reports` page, any change to report contents or to the API.
