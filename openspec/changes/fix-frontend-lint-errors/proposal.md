# Fix the two frontend lint errors that fail the release checks

Linear-Issue: JOS-231 (unblocks JOS-206)

## Why

GitHub Actions was enabled on 2026-10-26 and the first Release dry-run on `main` (run 40445693575) failed at `checks / test (frontend)`, step `npm run lint`; `build`, `publish` and `verify` were skipped. Two lint errors already on `main` cause it, so no release run can pass until they are fixed: `ReportsSection.tsx:41` (`setState` called synchronously inside an effect) and `reports-section.test.tsx:5` (`API_BASE` imported and never used). This blocks the JOS-206 release-workflow checks (tasks 7.2 to 7.5).

## What Changes

- `ReportsSection` clears its two error messages when the Administrator changes the period (in the change handler), not synchronously at the start of the data-loading effect. The visible behavior is the same: a stale error disappears as soon as another period is chosen.
- A test pins that behavior first (an error from one period is gone when another period is chosen), because no test covers it today.
- The unused `API_BASE` import is removed from `reports-section.test.tsx`.

Non-goals: the six `react-hooks/exhaustive-deps` warnings (they do not fail the run), any other lint rule, and any change to the reports' requests, tables or copy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No requirement changes; this is a lint fix with the behavior held by a test.

## Impact

- Frontend: `frontend/src/components/ReportsSection.tsx`, `frontend/test/reports-section.test.tsx`.
- No backend, API, data or PRD change.
- After the merge, the Release workflow's `dry-run` can pass its frontend check (JOS-206 task 7.2).
