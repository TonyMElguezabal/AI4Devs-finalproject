## Context

`npm run lint` in `frontend` reports 2 errors and 6 warnings; only errors fail the Release workflow's checks. One error is `react-hooks` "calling setState synchronously within an effect": the effect in `ReportsSection` starts with `setError(undefined)` and `setPipelineError(undefined)` before it requests the two reports. The other is an unused import in a test.

## Goals / Non-Goals

**Goals:**

- `npm run lint` in `frontend` ends with 0 errors.
- No behavior change in the Reports section.

**Non-Goals:**

- The warnings, other components, or a change to the effect's dependencies.

## Decisions

### Decision 1: Clear the errors in the period-change handler

The errors must disappear when the period changes. That is a reaction to a user event, so it belongs in the handler passed to `ReportPeriodSelector` (`onChange`), next to `setPeriod`, not in the effect. On first render both are already `undefined`, so nothing is lost at start-up. The effect keeps requesting and setting results only. *Alternatives not taken:* a lint-disable comment (hides the rule for a real pattern the rule exists to catch); keying the component by period (remounts the table and loses the stale report that stays visible while the next one loads).

### Decision 2: A test first

No test covers "the error is gone after another period is chosen", so a test is written before the change: fail one period's requests, see the error, choose another period, and expect the error to disappear. It passes before and after the change; it guards the behavior, and the lint run is the failing signal for the fix.

## Risks / Trade-offs

- [The error could flash or stay if a request fails again right after] → The same as today: a new failure sets the message again.
- [Other lint errors appear in CI that the local run does not show] → CI runs the same `npm run lint`; the Release `dry-run` after the merge is the final check (JOS-206 task 7.2).
