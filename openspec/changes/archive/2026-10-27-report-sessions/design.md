## Context

JOS-223 built the Reports section: `ReportsSection` holds the period (cleared errors in `changePeriod`, JOS-231) and renders the provider-usage table, and since JOS-228 also `PipelineTimeTables`; `ReportPeriodSelector` is exported for reuse; `adminReportRoutes.ts` registers report routes inside the `/admin` child plugin, so the gate answers 401 first, and already shares `periodOf` (bound normalization and the 400 rule) between the provider-usage and pipeline-time routes. The JOS-175 spike proved the R4 queries (`poc/queries.sql`, "R4 Sessions"). Base: `origin/main` at `41b03ebd` (rebased 2026-10-27; the proposal was first written on 2026-10-23). JOS-224 (`report-failures-and-retries`) is proposed in parallel and touches the same two files; whichever merges second rebases.

- **Session facts**: `runs(id, title, created_at, paused, failure, final_video_path)`; `failure` is JSON text whose `phase` is `voice-over`, `decomposition` or `assembly` (`SessionFailure`); there is no state column (JOS-136 derives state from records).
- **Attempts**: `stage_attempts` (`stage`, `outcome`, `sent_at`, `finished_at`); `provider_requests(scene_id, stage, ...)`, now with `provider_id` (JOS-222).
- **Times**: `voice_overs.completed_at`; the successful `assembly` attempt's `finished_at`. `phase_instants` (JOS-228, migration 22) also exists, but only for sessions created after it shipped; it is not used here (Decision 4).
- **Scenes**: `scenes(idx, status, provider, video_provider, requested_duration_seconds, speed_factor, duration_warning, speed_factor_warning)`; labels in `provider_profiles(id, label)`.

## Goals / Non-Goals

**Goals:**
- R4 exactly as the catalogue defines it, with the two requested views (list, scene drill-down).
- Reuse the period selector and Reports section unchanged.

**Non-Goals:**
- Cost per session (JOS-227 joins it later), phase times beyond the two agreed (JOS-228), failure wordings, pagination, sorting, CSV, links into the User's session page.

## Decisions

### 1. Two routes, one module

`backend/src/sessionsReport.ts` exports `sessionsReport({ from, to })` and `sessionScenesReport(sessionId)` (returns `null` for an unknown session). `adminReportRoutes.ts` gains `GET /reports/sessions` (same `from`/`to` schema and 400 rule as provider usage) and `GET /reports/sessions/:sessionId/scenes` (404 when unknown). The drill-down is a separate route so the list stays one cheap query and a scene table is fetched only when opened.
*Alternative:* embedding scenes in every list row. Rejected: it multiplies the payload by the scene count for rows nobody opens.

### 2. Period on creation time

`runs.created_at >= from AND < to`, with the bounds from the existing `periodOf` in `adminReportRoutes.ts`, reused unchanged (it already serves the provider-usage and pipeline-time routes).

### 3. State is derived in the query

```
failure IS NOT NULL                       → failed, phase = json_extract(failure, '$.phase')
ELSE EXISTS successful assembly attempt   → final-video-ready
ELSE                                      → in-progress
```
Failure wins over a successful assembly, as in the spike: a later failure is what the Administrator needs to see. `paused` is a separate boolean. The failure `cause` is never selected (it can carry provider wording), only `phase`.

### 4. Attempts, times and counts

One SQL statement with correlated subqueries (the spike's, adapted): scenes and failed scenes from `scenes`; attempts = sent `voice-over`/`timestamps`/`decomposition` attempts + all `provider_requests` of the session's scenes; seconds to the voice-over = `voice_overs.completed_at − runs.created_at`; seconds to the final video = latest successful assembly `finished_at − created_at`; both computed in TypeScript from the ISO strings with `Date.parse`, rounded to one decimal, `null` when the instant is missing. A failed-before-scenes session yields zero scenes and null times with no special case.
*Alternative:* the `phase_instants` ends of JOS-228. Rejected: sessions created before migration 22 have none, so most existing sessions would show no time; `voice_overs.completed_at` and the assembly attempt exist for every session.

### 5. Scene drill-down rows

One query over `scenes` ordered by `idx`, with the two request counts as subqueries on `provider_requests.stage`. Providers are the scene's bindings (`provider`, `video_provider`) mapped to labels (fallback: the id, `null` when unbound). Warnings are the stored enum strings.

### 6. Response shapes (zod)

```
sessions: { from: string|null, to: string, rows: [{ id, title, createdAt, state: "final-video-ready"|"failed"|"in-progress",
            failedPhase: "voice-over"|"decomposition"|"assembly"|null, paused, scenes, failedScenes, attempts,
            secondsToVoiceOver: number|null, secondsToFinalVideo: number|null }] }
scenes:   { sessionId, rows: [{ number, status, imageProvider, clipProvider, imageAttempts, clipAttempts,
            requestedDurationSeconds: number|null, speedFactor: number|null, durationWarning: string|null,
            speedFactorWarning: string|null }] }
```
No text column other than `title` is read: no `script`, `instruction`, `prompt`, `failure.cause`, `error_message`. A route test seeds markers in all of them and asserts they are absent.

### 7. Frontend

`ReportsSection` keeps the period and renders `SessionsReport` after the existing tables; the provider-usage and pipeline-time parts are left as they are. `SessionsReport({ password, period, onDenied })` owns its request and its error state, loads the list on mount and when the period changes, renders a captioned table, and a "Scenes" button per row (`aria-expanded`, accessible name "Scenes of <title>") that loads and toggles an inline scene table. State, paused flag and times are formatted for people ("Failed in assembly", "Paused", `18.1 s`, "—" for null). The 401 path reuses `onDenied`.

## Risks / Trade-offs

- [Large periods list every session] → single-user volumes; no pagination (non-goal). `ponytail:` comment on the query.
- [Scene attempt counts include stub-only modes (`flaky`, `unrecoverable`), which the usage report excludes] → this is a session-effort count as in the spike; stub modes exist only in tests and demos.
- [A rebuilt final video that fails shows `failed: assembly` though an earlier video exists] → intended (Decision 3); revisit with JOS-228 if confusing. Task 1.2 re-checks how rebuild failures are recorded.
- [Drill-down shows the scene's current provider after a provider move, not every provider that served its attempts] → matches the agreed field ("image and clip providers"); since JOS-222 each attempt records its provider, so a per-attempt view can be added later without a migration.

## Migration Plan

None: no schema change. Rollback is reverting the change.

## Open Questions

- JOS-223 is merged but its change is still not archived, so `openspec/specs/admin-reports` does not exist yet; archive `report-provider-usage` before this change.
- The usage report still labels scene attempts "current provider" although JOS-222 is merged (`sceneAttemptsFollowCurrentProvider: true`); outside this ticket, worth a follow-up.
