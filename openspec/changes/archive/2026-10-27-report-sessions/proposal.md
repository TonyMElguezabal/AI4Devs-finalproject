## Why

The Administrator can see how providers behave in aggregate (JOS-223) but cannot find the individual sessions that failed or took long. The JOS-175 spike agreed a sessions report (catalogue R4, ADR 0008) as part of release 1, and PRD v1.16 §11.4 already describes it. This is JOS-225 (follow-up F4); it reuses the Reports section and period selector built by JOS-223.

## What Changes

- New read-only endpoint `GET /admin/reports/sessions?from&to`, behind the Administrator password: one row per session created in the period with its id, title, creation time, state (final video ready, failed in a phase, in progress), whether it is paused, scenes, failed scenes, attempts, seconds to the voice-over and seconds to the final video.
- New read-only endpoint `GET /admin/reports/sessions/:sessionId/scenes`: one row per scene with its number, status, image and clip providers, image and clip attempts, requested duration, speed factor, duration warning and speed-factor warning.
- A session that failed before it had scenes is listed with its failed phase and no phase times.
- The session state is derived from the store (there is no state column). The period applies to the session's creation time, not to attempts.
- A sessions table in the Reports section of `/admin`, under the existing period selector, with a per-session "Scenes" drill-down.
- The report shows no script, prompt, instruction, narration text or failure wording.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `admin-reports`: adds the sessions report, its scene drill-down, and the creation-time period rule for session facts. The capability is still being introduced by the unarchived `report-provider-usage` change (JOS-223), so the requirements here are ADDED to it and this change must be archived after that one.

## Impact

- **Backend**: new `sessionsReport.ts` (list and drill-down queries) and two routes in `adminReportRoutes.ts`, inside the existing `/admin` child plugin. No migration, no new table.
- **Frontend**: a `SessionsReport` table and drill-down inside `ReportsSection`; two client calls in `api/client.ts`; new types.
- **API**: two routes in `docs/api-spec.yml` and the generated OpenAPI document.
- **Docs**: `docs/api-spec.yml`, `docs/frontend-standards.md` (accessible names), the readme/development guide `/admin` section; PRD §11.4 is checked, not changed.
- **Out of scope**: estimated cost per session (JOS-227), pipeline-time phases (JOS-228), failure wordings, pagination, sorting, CSV download, deep links to the User's session page.
