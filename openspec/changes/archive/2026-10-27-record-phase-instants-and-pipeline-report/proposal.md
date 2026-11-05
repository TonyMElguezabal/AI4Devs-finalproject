Linear-Issue: JOS-228

## Why

The Administrator wants to tune the stage time limits, but the app cannot say how long each phase of a session takes. Voice-over and assembly have attempt stamps; the decomposition and scene phases have no start stamp of their own (the JOS-175 spike approximated them from the first image request). Without recorded phase instants there is no honest pipeline-time report (JOS-175, ADR 0008, catalogue R6, follow-up F7).

## What Changes

- New table `phase_instants` (migration 22): one row per session and phase (`voice-over`, `decomposition`, `scenes`, `assembly`) with a start and an end instant, each written once.
- The pipeline stamps the start and the end of each phase at the points where the phase begins and completes. Existing sessions get no rows: a phase without an instant shows no time, never an estimate.
- New `GET /admin/reports/pipeline-time?from&to`, behind the Administrator gate: per phase, the elapsed seconds per session and aggregated, and the attempts that timed out, finished late or were superseded.
- A "Pipeline time" table in the Reports section of `/admin`, under the existing period selector.

## Capabilities

### New Capabilities
- `phase-instants`: the start and end instant of each pipeline phase of a session, recorded once, absent for sessions from before this change.
- `pipeline-time-report`: the admin report of elapsed seconds per phase (per session and aggregated) and of timed-out, late and superseded attempts, refused without the Administrator password.

### Modified Capabilities
<!-- None: no existing requirement changes. -->

## Impact

- Backend: `backend/src/db.ts` (migration 22, a stamping function, calls at the phase boundaries), a new `backend/src/pipelineTimeReport.ts`, `backend/src/adminReportRoutes.ts` (new route).
- Frontend: `frontend/src/components/ReportsSection.tsx`, `frontend/src/api/client.ts`, `frontend/src/types.ts`.
- Docs: `docs/data-model.md`, `docs/api-spec.yml`.
- No new dependency. Depends on the Reports section from JOS-223 (merged).
