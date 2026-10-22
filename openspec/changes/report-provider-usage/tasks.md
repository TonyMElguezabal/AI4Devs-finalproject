## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-223-provider-usage-report` from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-223`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the product owner approved PRD v1.16 (§11.4, JOS-175); its status line still says "awaiting the product owner's approval". If it is not approved, stop and ask.
- [x] 1.2 Confirm the base still matches design.md § Context: the `stage_attempts` and `provider_requests` columns and values, `provider_profiles.label`, every writer of `sent_at` using `toISOString()`, the `/admin` child plugin, and whether JOS-222 has merged (if it has, attribute scene attempts by `provider_requests.provider_id` and set the flag to `false`; update design.md first).

## 2. Backend: the report module (TDD; design Decisions 2, 3, 6)

- [x] 2.1 Write failing unit tests for the nearest-rank percentile helper: empty list → `null`; one value; median of an odd and an even count; 95th percentile of 20 and of 100 values.
- [x] 2.2 Implement the helper. Make 2.1 pass.
- [x] 2.3 Write failing tests for `providerUsageReport({ from, to })` on a seeded store: counts, success rate, percentiles and billed units per stage and provider match the spike's R1 query on the same rows; `late-success` counts as success; `scheduled`, `in-flight`, `superseded`, `cancelled`, unsent attempts and the stub-only scene modes are not counted; `elevenlabs-native` is not an alignment attempt; `[from, to)` includes `from` and excludes `to`; absent `from` counts everything; a provider with attempts only outside the period has no row; failed attempts bill nothing; a scene moved to another provider counts all its attempts for the current one; rows are in pipeline order then by label; the label falls back to the id; no rows for an empty period.
- [x] 2.4 Write a failing test that the voice, image and clip billed units of the report equal those the telemetry records for the same attempts (Decision 6).
- [x] 2.5 Implement `backend/src/providerUsageReport.ts`. Make 2.3 and 2.4 pass.

## 3. Backend: the route (TDD; design Decisions 1, 4, 5)

- [x] 3.1 Write failing route tests for `GET /admin/reports/provider-usage`:
  - 401 without the Administrator password and with a wrong one;
  - 200 with the response shape of Decision 4, `to` echoed, `sceneAttemptsFollowCurrentProvider: true`;
  - `from` and `to` with an offset select the same attempts as their UTC equivalents;
  - 400 for `from` not before `to` and for a value that is not an ISO 8601 date-time;
  - the body contains none of the marker texts seeded in scripts, prompts, instructions, narration and failure messages, and no stored key;
  - the row counts of every table are unchanged after the call.
- [x] 3.2 Implement `backend/src/adminReportRoutes.ts` with zod query and response schemas and register it in the `/admin` child plugin. Make 3.1 pass and confirm the route is in the generated OpenAPI document.

## 4. Frontend: the Reports section (TDD; design Decision 7)

- [ ] 4.1 Write failing component tests:
  - `ReportPeriodSelector`: "Last 30 days" by default; each preset gives the right `from` and no `to`; "All time" gives neither; a custom range gives local midnight of the first day and of the day after the last day;
  - `ReportsSection`: requests the last 30 days on open and again when the period changes; shows one table row per report row with the formatted numbers and "—" for a missing latency; shows the empty message; shows the attribution note when there is an image or video row and not otherwise; a 401 locks the page;
  - the table has a caption and column headers usable by a screen reader.
- [ ] 4.2 Add `getProviderUsageReport` to `api/client.ts` and its types, the three components, and the section in `AdminTools`. Make 4.1 pass.

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Review the tests that list `/admin` routes or sections (the admin surface/route-list test, `AdminPage`/`AdminTools` tests) and update them for the new route and section.
- [ ] 5.2 Map every scenario in `specs/admin-reports/spec.md` and JOS-223 AC1–AC7 to at least one test. List the mapping in the step 6 report.
- [ ] 5.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, and `data/projects/` contents.
- [ ] 6.2 Run the targeted tests from groups 2–4.
- [ ] 6.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json`, no settings override and no vendor key in the environment.
- [ ] 6.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 6.5 Create the report `openspec/changes/report-provider-usage/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`.
- [ ] 6.6 Mark this step complete only after the tests pass and the report file exists.

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the real server on a scratch store and scratch projects folder with stub adapters (two providers for the image and video stages) and `ALLOW_TEST_ENDPOINTS=1`; run sessions that give successes, transient and not-retryable failures, a timed-out attempt, native timestamps on one session, and a scene moved to the second video provider.
- [ ] 7.2 Without the Administrator password: 401.
- [ ] 7.3 With it: the default, 7-day, all-time and custom-range answers; compare each row with the spike's R1 query run with `sqlite3` on the same scratch store.
- [ ] 7.4 Error cases: `from` after `to`, a non-date value (400).
- [ ] 7.5 Search the response bodies for the session scripts and failure texts: none present. Confirm the store's row counts are unchanged by the report calls.
- [ ] 7.6 Delete the scratch store and folder; confirm the default store is untouched. Save `openspec/changes/report-provider-usage/reports/YYYY-MM-DD-step-7-manual-endpoint-testing.md`.

## 8. E2E Testing with the browser (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 8.1 Applicability: a new `/admin` section, so this step applies.
- [ ] 8.2 Run the backend on the scratch store of step 7 and the frontend. Without the password: no Reports section. With it: the Reports section shows the last 30 days with the expected rows and the attribution note.
- [ ] 8.3 Switch to 7 days, all time and a custom range; the table changes accordingly; a range with no activity shows the empty message.
- [ ] 8.4 Restore the environment and save `openspec/changes/report-provider-usage/reports/YYYY-MM-DD-step-8-e2e.md`.

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 `docs/PRD.md` §11.4: check the text matches what was built; change it (with a §16 entry) only if it does not.
- [ ] 9.2 `docs/api-spec.yml`: `GET /admin/reports/provider-usage` with 200, 400 and 401.
- [ ] 9.3 `docs/frontend-standards.md`: the accessible names of the Reports section and its period selector, and that later reports reuse `ReportPeriodSelector`.
- [ ] 9.4 `docs/development_guide.md` and the readme's `/admin` section: the Reports section and what the usage report counts.
- [ ] 9.5 Run `graphify update .`.
