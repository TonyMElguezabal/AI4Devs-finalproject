## Context

The JOS-175 spike (`openspec/changes/define-admin-reports/`, ADR 0008) defined R1 and proved its query on a scratch store (`poc/queries.sql`, the `calls` view and the R1 select). This change turns that query into a route and an `/admin` section. Current base (`origin/main` at the JOS-175 merge):

- **Session-level attempts**: `stage_attempts` (migration 15 shape) with `stage` in `voice-over`, `timestamps`, `decomposition`, `assembly`; `provider_id` (nullable; `elevenlabs-native` when the voice provider's timestamps were used); `outcome` in `scheduled`, `in-flight`, `success`, `transient`, `not-retryable`, `timed-out`, `late-success`, `superseded`, `cancelled`; `sent_at` and `finished_at` as ISO 8601 UTC strings (`toISOString()`).
- **Scene-level attempts**: `provider_requests` (`scene_id`, `sent_at`, `latency_ms`, `mode`) with no provider column; the provider is `scenes.provider` (image) or `scenes.video_provider` (video). JOS-222, which adds `provider_requests.provider_id`, is in Backlog.
- **Units**: `runs.script`, `voice_overs.duration_seconds`, `scenes.requested_duration_seconds`.
- **Labels**: `provider_profiles(id, label)` (JOS-218); stored provider ids are profile ids.
- **Gate**: the `/admin` child plugin in `routes.ts` answers 401 before any `/admin/` handler (JOS-173); `adminFailedStageRoutes.ts` is the pattern for a route file registered there.
- **Frontend**: `AdminTools.tsx` stacks the sections; `api/client.ts` has `adminFetch` and the per-route calls; a 401 locks the page.

## Goals / Non-Goals

**Goals:**
- The R1 numbers exactly as the catalogue defines them, from one read of the store.
- A Reports section and a period selector that JOS-224 and JOS-225 add their tables to without changing them.

**Non-Goals:**
- Recording the provider on scene attempts (JOS-222), the failures and sessions reports, cost, CSV, charts, caching, pagination.
- Changing how attempts are recorded or how the telemetry counts them.

## Decisions

### 1. One route file, one report module

`backend/src/providerUsageReport.ts` exports `providerUsageReport({ from, to }): ProviderUsageReport`. `backend/src/adminReportRoutes.ts` exports `registerReportRoutes(admin)` with `GET /reports/provider-usage`, registered next to `registerFailedStageRoutes` inside the `/admin` child plugin, so the gate and the OpenAPI security entry apply with no new code.
*Alternative:* adding the route to `routes.ts` directly. Rejected: the admin routes already live in their own files.

### 2. SQL selects attempt rows; TypeScript aggregates

One SQL statement, adapted from the spike's `calls` view, returns one row per counted attempt in the period: `stage` (report name), `provider_id`, `outcome` (normalized), `latency_ms`, `unit`, `units`. TypeScript groups them by stage and provider and computes counts, success rate and nearest-rank percentiles (`sorted[ceil(p × n) − 1]`).
*Why:* the spike's correlated percentile subqueries are hard to read and test; the store is single-user and small (a period of heavy use is thousands of rows), so reading the rows is cheap, and the percentile function is a pure, unit-tested helper.
*Alternative:* the spike's all-SQL query. Rejected for readability; its output is the reference the tests compare against.

Rules carried from the spike:
- Session-level: stages `voice-over` → voice, `timestamps` → alignment, `decomposition` → reasoning; `provider_id IS NOT NULL AND provider_id <> 'elevenlabs-native'`; `sent_at IS NOT NULL`; outcome in `success`, `late-success` (counted as success), `transient`, `not-retryable`, `timed-out`. Latency is `finished_at − sent_at`; an attempt without `finished_at` has no latency and is left out of the percentiles only.
- Scene-level: `mode` `success` → success, `transient_failure` → transient, `not_retryable_failure` → not-retryable; the stub-only modes `unrecoverable` and `flaky` are not counted. Latency is `latency_ms`.
- Period: `sent_at >= from AND sent_at < to`, comparing ISO strings. The route converts both bounds with `new Date(value).toISOString()`, so an offset in the request (`+02:00`) still compares correctly against the stored UTC strings.
- Units of successful attempts only: `LENGTH(runs.script)` voice characters, `voice_overs.duration_seconds` audio seconds, `1` request, `1` image, `scenes.requested_duration_seconds` clip seconds.

### 3. Attribution of scene attempts until JOS-222

Image and clip attempts are joined to `scenes` and take the scene's current binding. The response carries `sceneAttemptsFollowCurrentProvider: true`, and the section shows the note when the report has an image or video row. JOS-222 will switch the select to `provider_requests.provider_id` and set the flag to `false`; the frontend needs no change then.

### 4. Response shape

```
{ from: string | null, to: string,
  sceneAttemptsFollowCurrentProvider: boolean,
  rows: [{ stage, providerId, providerLabel, attempts, successes, transient, notRetryable, timedOut,
           successRatePercent, medianLatencyMs, p95LatencyMs, billedUnits, unit }] }
```

Rows are ordered by stage in pipeline order (voice, alignment, reasoning, image, video), then by display name. `providerLabel` is `provider_profiles.label`, or the id when no profile matches. `medianLatencyMs` and `p95LatencyMs` are `null` when no attempt of the row has a latency; `billedUnits` is `0` when no attempt succeeded. `to` is echoed as the instant actually used ("now" when absent). Query and response are zod schemas, so the route appears in the generated OpenAPI document.

### 5. No content in the report

The select reads no text column except ids and labels; `error_message`, `script` text, prompts and narration never leave SQL (`LENGTH(script)` only). A route test seeds marker strings in every content column and a stored key and asserts none is in the response body.

### 6. Billed units are derived in SQL, not shared with the telemetry

ADR 0008 says the reports and the telemetry should share the code that derives billed units. The telemetry derives units per call inside the recording functions in `db.ts` and only for voice, image and clip; the report derives them per row in SQL for all five stages. Sharing would mean the report calling the telemetry helper once per row or the telemetry running SQL per call. Rejected for this change: a test pins that both give the same voice, image and clip units for the same attempts, so a divergence fails CI.

### 7. Frontend: `ReportsSection`, `ReportPeriodSelector`, `ProviderUsageTable`

- `ReportPeriodSelector` (controlled): a radio group "Last 7 days", "Last 30 days", "All time", "Custom range"; custom shows two `<input type="date">`. It turns the choice into `{ from?: string; to?: string }` (ISO, local midnight for custom bounds, the day after the end date as `to`). Exported for JOS-224 and JOS-225.
- `ReportsSection` holds the period (default 30 days), calls `getProviderUsageReport(password, period)` on mount and on change, and renders `ProviderUsageTable`, the empty message, the attribution note and errors. A 401 goes through the existing lock path.
- `ProviderUsageTable` is a plain `<table>` with a caption; numbers are formatted with `Intl.NumberFormat`; a missing latency shows "—".
- Added at the end of `AdminTools`.

## Risks / Trade-offs

- [Scene-stage rows are wrong after a provider move until JOS-222] → stated in the response and the UI (spec requirement); JOS-222 is a small migration that removes it.
- [Reading every attempt row of a long period into memory] → bounded by single-user use; if "All time" grows slow, move the aggregation into SQL. `ponytail:` comment on the select naming that ceiling.
- [Timed-out attempts' latency is the time limit, which pulls the 95th percentile up] → intended: it is what the user waited; the timed-out count is shown next to it.
- [String comparison of instants] → valid only for same-format UTC strings; the route normalizes the bounds, and every writer uses `toISOString()` (checked in task 1.2).

## Migration Plan

None: no schema change. Rollback is reverting the change.

## Open Questions

- PRD v1.16 is marked "awaiting the product owner's approval" while the JOS-175 commit applies "the approved reports text". Task 1.1 confirms the approval before code.
