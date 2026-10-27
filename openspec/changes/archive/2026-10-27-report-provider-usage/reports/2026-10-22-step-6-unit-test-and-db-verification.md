# Step 6: unit tests and database verification (JOS-223, report-provider-usage)

Date: 2026-10-22.

## Baseline and isolation

- The default store does not exist in this worktree: `backend/data/` was absent before the work. A first full run made without a scratch path created it (git-ignored); it was deleted, and every run below used a scratch `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH` under the session scratchpad.
- No `backend/.secrets.json`, no settings override (`SETTINGS_PATH` is set by `vitest.config.ts`) and no vendor key in the environment.
- Post-run state: `backend/data/` still absent; the scratch folder was deleted. The baseline holds.

## Results

| Command | Result |
|---|---|
| `backend`: `npm run typecheck` | clean |
| `backend`: `npx vitest run` | 152 files passed, 4 skipped; 2052 tests passed, 5 skipped |
| targeted backend (groups 2-3: percentile, report, billed units, route) | 4 files, 30 tests passed |
| `frontend`: `npm run typecheck` | clean |
| `frontend`: `npx vitest run` | 8 files, 311 tests passed (12 new in `reports-section.test.tsx`) |

## Existing tests reviewed (5.1)

`admin-access-route.test.ts` marks every `/admin/` OpenAPI operation with the Administrator scheme generically, so the new route is covered without a change. No test lists the `/admin` routes or the `AdminTools` sections by name; none needed an update.

## Test-first note

Each new test file was written and seen to fail (module missing or behaviour absent) before its implementation, except the percentile helper (`nearestRankPercentile`), which was written in the same step as its test before the first red run; its five cases were run against it immediately after.

## Scenario and acceptance-criteria map (5.2)

| Requirement / scenario / AC | Test |
|---|---|
| Report requested without the password (AC5) | `admin-reports-route`: "is refused with 401 …" |
| Report contains no secret and no content (AC6) | `admin-reports-route`: "contains no script, prompt, instruction, failure text or stored key, and changes no table" |
| Report changes nothing | same test (row counts of every table) |
| Only attempts sent in the period are counted (AC2) | `provider-usage-report` "period" group; route "selects the same attempts for bounds with an offset …" |
| The period's end is excluded | `provider-usage-report`: "includes an attempt sent exactly at `from` and excludes one sent exactly at `to` …" |
| All time | `provider-usage-report`: "counts everything before `to` when `from` is absent"; route: "counts everything up to now …" |
| Invalid period | `admin-reports-route`: the five 400 cases |
| Default period | `reports-section`: "has 'Last 30 days' selected by default"; "requests the last 30 days on open …" |
| Changing the period | `reports-section`: "… again when the period changes"; presets test |
| Custom range in local time | `reports-section`: "gives local midnight of the first day …" |
| Access lost while reading a report | `reports-section`: "locks the page when the request is answered 401" |
| Usage per stage and provider (AC1) | `provider-usage-report`: voice, alignment/reasoning, image/video tests; `reports-section`: table rows and headers |
| Provider without attempts is not listed (AC3) | `provider-usage-report`: "lists no row for a provider whose attempts are all outside the period …" |
| Native timestamps are not an alignment call (AC4) | `provider-usage-report`: "bills audio seconds … and ignores native timestamps" |
| Attempts not sent or not finished are not counted | `provider-usage-report`: "does not count scheduled, in-flight, superseded, cancelled or unsent attempts" |
| Failed attempts bill nothing | `provider-usage-report`: "counts failed attempts as billing nothing"; clip test (failure then success) |
| Empty period | `provider-usage-report` (no rows); `reports-section`: "shows the empty message …" |
| Scene moved to another provider | `provider-usage-report`: "counts every attempt of a scene moved …" |
| The attribution is stated (AC7) | `provider-usage-report` (flag); `reports-section`: "shows the attribution note …" |
| Decision 6 (units equal the telemetry's) | `provider-usage-billed-units` |

One deviation from task 2.3: the expected numbers are derived by hand from the seeded rows, not by running the spike's R1 query inside the test. The comparison with the spike's query on a real store is step 7.3.

## Coverage (5.3)

The projects have no coverage tool configured. Every new module (`providerUsageReport.ts`, `adminReportRoutes.ts`, `ReportPeriodSelector.tsx`, `ReportsSection.tsx`, `getProviderUsageReport`) is exercised by the tests above and no existing line was removed or left untested, so module coverage cannot have decreased.
