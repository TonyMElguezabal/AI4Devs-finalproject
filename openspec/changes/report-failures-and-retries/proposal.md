Linear-Issue: JOS-224

## Why

The Administrator can see per provider how often a stage fails (the usage report, JOS-223), but not where retries are wasted: how many automatic retry budgets ran out, how often a session needed a manual retry, what the failures said, and how many scenes are stuck failed right now. The JOS-175 spike defined this report (ADR 0008, catalogue R3, follow-up F3) and PRD §11.4 already lists it in the first release of reports.

## What Changes

- New `GET /admin/reports/failures?from&to`, behind the Administrator gate, with the same period rules as the other reports:
  - per stage (voice, alignment, reasoning, image, video): failed attempts by outcome (transient, not-retryable, timed out), counted from the same attempt rows as the usage report;
  - for the session-level stages (voice, alignment, reasoning): retry budgets exhausted and manual retries; for the scene stages these are reported as not recorded;
  - for the session-level stages: the most frequent failure wordings with their counts (the application's own sentences);
  - the scenes that are failed now, by failed stage (image or clip), as a current state that ignores the period.
- A video failure's text, and any other scene-stage failure text, is never part of the response.
- A "Failures and retries" part of the Reports section on `/admin`, under the existing period selector.

## Capabilities

### New Capabilities
- `failures-report`: the admin report of failed attempts by stage and outcome, exhausted retry budgets, manual retries, the most frequent session-level failure wordings and the scenes failed now, refused without the Administrator password.

### Modified Capabilities
<!-- None: no existing requirement changes. -->

## Impact

- Backend: a new `backend/src/failuresReport.ts`; `backend/src/providerUsageReport.ts` exports its attempt reader so both reports count the same rows; `backend/src/adminReportRoutes.ts` (new route).
- Frontend: `frontend/src/components/ReportsSection.tsx` and a new table component, `frontend/src/api/client.ts`, `frontend/src/types.ts`.
- Docs: `docs/api-spec.yml`. No migration, no new table, no PRD change (§11.4 already describes the report).
- No new dependency. Depends on the Reports section and period selector from JOS-223 (merged).
