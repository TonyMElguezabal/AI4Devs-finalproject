## Context

`/admin` (`AdminPage`) renders `AdminTools` in one `.card`: five sections, each `<section class="field">` with an `<h2>`, stacked. `ReportsSection` loads five reports at once for one period and renders six tables (provider usage, estimated cost, pipeline time, failures, provider changes, sessions) with no table styles. `ReportPeriodSelector` is a `<fieldset>` of radios, and `app.css` sets `input { width: 100%; padding… }`, which stretches the radios. `ProviderProfilesSection` lists profiles in a `<ul>` with three always-visible buttons per row, named `Edit X`, `Delete X`, `Test connection X`. There is no client-side router (`docs/frontend-standards.md`); `App.tsx` picks `AdminPage` from `window.location.pathname`.

## Goals / Non-Goals

**Goals:**
- Each Administrator tool is reachable in one click and the page never spills out of its card at 375 px and 1280 px.
- Reports read as one family: same table style, same formats, a summary on top.
- Existing accessible names stay, so existing tests and the Playwright flows keep working.

**Non-Goals:**
- A router, a UI library, a charting library, a new page, any API or report-content change.

## Decisions

### Decision 1: Tabs are state plus the URL hash, not routes

`AdminTools` holds the active tab, read from `location.hash` (`#settings`, `#providers`, `#failed-stages`, `#reports`; unknown or empty means `#settings`) and written with `history.replaceState` on change, plus a `hashchange` listener. Markup is the WAI tabs pattern: `role="tablist"`, `role="tab"` with `aria-selected`, `role="tabpanel"`; arrow keys move between tabs. Only the active panel is mounted, so Reports does not load its five reports until opened. The `refreshKey` wiring between sections stays in `AdminTools`.
Alternative: real routes (`/admin/reports`): rejected, it needs a router and backend path handling (`GET /admin/…` collides with API paths).

### Decision 2: Tab contents

Settings = `VisualStyleSection` + `ActiveProvidersSection`; Providers = `ProviderProfilesSection`; Failed stages = `FailedStagesSection`; Reports = `ReportsSection`. A section keeps its `aria-label` and `<h2>`, so existing `getByRole("region", …)` queries hold. The one 401 lock (`onDenied`) is unchanged.

### Decision 3: Shared table style, no new component per table

Add `.table-scroll` (a wrapper with `overflow-x: auto`) and `.data-table` (left-aligned text, `th` in the header style, 1 px row dividers, `caption` left-aligned above the table, `td.num` right-aligned with `font-variant-numeric: tabular-nums`, `white-space: nowrap` on `td.num`). Each existing table component wraps its `<table>` in `.table-scroll` and adds the classes. The first column of the wide tables is sticky. A report with a "not recorded" cell shows `n/a` with a `title`.
Alternative: one generic `<DataTable columns rows>` component: rejected for this change; the six tables have different cells and tests, a class-based style is the smaller diff.

### Decision 4: One format for dates and numbers

A small `frontend/src/format.ts` exports `formatInstant(iso)` (`Nov 6, 2026, 12:03 PM`, locale `en`) and reuses the `Intl.NumberFormat("en")` the tables already create separately. Provider changes and sessions use it.

### Decision 5: Period selector as a segmented control

Keep the radios (native keyboard and form semantics) but style the `label`s as a segmented control and exclude radios from the global input rule: `input:not([type="radio"]):not([type="checkbox"])`. Same four choices, same default, same `onChange` contract.

### Decision 6: Summary tiles from data already loaded

Tiles: attempts and success rate (sum over provider-usage rows), estimated cost (the report's total, with "excludes unpriced providers" in its footnote), and failed scenes now (failures report). A tile whose report has not loaded or failed shows `—`. No new request.

### Decision 7: Collapsible report panels with `<details>`

Each report is a `<details><summary>`: provider usage and sessions `open`, others closed. Native element, keyboard-operable, no state to manage.

### Decision 8: Provider rows and the overflow menu

A row shows the name once (the profile's `label`; the description is shown only when it differs), an `Active` badge, and the key source as muted text. `Edit {label}` stays a visible button. `Test connection {label}`, `Duplicate {label}` (a configured connector only) and `Delete {label}` live in a `<details class="menu">` opened by a `More actions for {label}` summary; selecting an item closes it. Delete confirmation and the charged-test confirmation stay inline in the row, exactly as now. `Add {stage} provider` moves into the stage card header.
Alternative: a popover/menu library: rejected, `<details>` does it with no dependency; Escape closes it through a small key handler.

### Decision 9: Active providers grid

One row per stage: label, select (still named `{Stage} provider`), source badge (`settings files` / `set on /admin`). The text strings are unchanged so the existing queries hold.

## Risks / Trade-offs

- [Tests that click `Delete X` or `Test connection X` directly] → open the menu first; the updates are listed in tasks.
- [Reports tab now mounts on demand, so a period chosen earlier is lost when switching tabs] → keep the period state in `AdminTools`' Reports panel parent only while mounted; acceptable, the default is the common case.
- [Sticky first column over a scrolling table in dark mode] → give it the surface background token.
- [`<details>` menu is not a full ARIA menu] → it is a disclosure widget with buttons inside, which is the accurate pattern; no `role="menu"` claims.

## Migration Plan

Frontend only. No data or API change; rollback is reverting the change.

## Open Questions

None.
