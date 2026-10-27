## Why

The Administrator chooses a provider for each stage on `/admin` (JOS-171, JOS-218) but cannot see how those providers behave: how often they fail, how slow they are, how much work they billed. The JOS-175 spike agreed a provider-usage report (catalogue R1, ADR 0008) as the first `/admin` report, and PRD v1.16 puts it in scope. This is JOS-223 (follow-up F2).

## What Changes

- New read-only endpoint `GET /admin/reports/provider-usage?from&to`, behind the Administrator password, computed on demand from the local store. One row per stage and provider with: attempts, successes, transient failures, not-retryable failures, timed-out attempts, success rate, median and 95th-percentile latency, billed units and their unit.
- The period `[from, to)` applies to the instant each attempt was sent. A provider with no attempt in the period is not listed. Attempts that used the voice provider's native timestamps are not counted as alignment calls.
- Until the provider is recorded on scene attempts (JOS-222), image and clip attempts are attributed to the scene's current provider, and the response says so.
- New "Reports" section on `/admin` with a period selector (7 days, 30 days by default, all time, custom range) and the usage table. The section and the selector are built to be reused by the failures (JOS-224) and sessions (JOS-225) reports.
- The report contains no key, script, prompt, instruction, narration text or provider failure text.

## Capabilities

### New Capabilities
- `admin-reports`: the Reports section on `/admin`, the shared period rule, the rules every report follows (read-only, gated, no content), and the provider-usage report.

### Modified Capabilities

None. The Administrator gate (`administrator-access`) already covers every `/admin/` route; no requirement changes.

## Impact

- **Backend**: new `providerUsageReport.ts` (query and aggregation) and `adminReportRoutes.ts` (route, zod schemas), registered in the existing `/admin` child plugin in `routes.ts`. No migration, no new table, no background job.
- **Frontend**: new Reports section, period selector and usage table inside `AdminTools`; one new client call in `api/client.ts`.
- **API**: one new route in `docs/api-spec.yml` and the generated OpenAPI document.
- **Docs**: `docs/api-spec.yml`, `docs/frontend-standards.md` (accessible names), the readme/development guide `/admin` section; PRD v1.16 already describes the report and is only checked.
- **Out of scope**: the failures and sessions reports (JOS-224, JOS-225), cost (JOS-227), recording the provider on scene attempts (JOS-222), CSV download.
