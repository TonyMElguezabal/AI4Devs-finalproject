Linear-Issue: JOS-229

## Why

`active_providers` keeps only each stage's last choice, and a failed-stage move (JOS-172) overwrites the binding in place, so nobody can tell when a stage's provider changed or which sessions were moved, and from which provider. The JOS-175 spike agreed a provider-changes report for a later release (ADR 0008, catalogue R7, follow-up F8); it needs a log the app does not keep today. The log also answers the open question JOS-172 left about a move log.

## What Changes

- New table `provider_changes` (migration 25): one row per change, written in the same transaction as the change itself:
  - an **active-provider change** on `/admin`: when, the stage, the previous and the new active provider;
  - a **failed-stage move** (JOS-172): when, the session, the stage, the scene if any, the previous and the new provider.
  Each row keeps the providers' ids and their display names as they were at that moment.
- Saving the provider that is already active writes no entry. Nothing is backfilled: changes made before this version are not in the log.
- New `GET /admin/reports/provider-changes?from&to`, behind the Administrator gate, with the period rules of the other reports: the entries changed in the period, newest first.
- A "Provider changes" table in the Reports section of `/admin`, under the existing period selector.
- PRD §11.4: provider changes move from "later release" to built (v1.23; the previous version kept as `docs/PRD-v1.22.md`).

## Capabilities

### New Capabilities
- `provider-change-log`: every active-provider change and failed-stage move is recorded once, atomically with the change, with its time, stage, session and scene where they apply, and the previous and new provider.
- `provider-changes-report`: the admin report of the logged changes in a period, newest first, refused without the Administrator password.

### Modified Capabilities
<!-- None: the active-provider and failed-stage-move requirements keep their behaviour; the log is added beside them. -->

## Impact

- Backend: `backend/src/db.ts` (migration 25, an insert function, `resetAll`), `backend/src/activeProvider.ts` (`setActiveProvider` logs inside a transaction), `backend/src/failedStages.ts` (`moveFailedStage` logs inside its existing transaction), a new `backend/src/providerChangesReport.ts`, `backend/src/adminReportRoutes.ts` (new route).
- Frontend: `frontend/src/components/ReportsSection.tsx` and a new table component, `frontend/src/api/client.ts`, `frontend/src/types.ts`.
- Docs: `docs/data-model.md`, `docs/api-spec.yml`, `docs/PRD.md` (v1.23).
- No new dependency. JOS-224 and JOS-225 change the same report files in parallel; whichever merges second rebases.
