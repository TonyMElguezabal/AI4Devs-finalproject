## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-224-failures-retries-report` created from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-224` (done by `/opsx:propose`)
- [x] 0.2 Verify it is the current branch of that worktree and has no upstream

## 1. Gate

- [x] 1.1 `git fetch`. Confirm `adminReportRoutes.ts`, `providerUsageReport.ts` and `ReportsSection.tsx` on `origin/main` still match design.md § Context; if another report story changed them, update design.md first.
- [x] 1.2 Confirm `MAX_ATTEMPTS_PER_CYCLE` is still exported from `backend/src/config/providers.ts` and the failed-scene tests (`result IS NULL` / `video_result IS NULL`) still hold in `db.ts`.

## 2. Backend: failures report (TDD; design Decisions 1 to 6)

- [x] 2.1 Write failing tests for `failuresReport`: transient, not-retryable and timed-out attempts per stage from both attempt sources; stage order; a stage with no failure and no manual retry is not listed (spec: Failed attempts per stage and outcome).
- [x] 2.2 Write a failing test that, on the same seeded store and period, each stage's failure counts equal the sums of that stage's rows in `providerUsageReport` (AC1).
- [x] 2.3 Write failing tests: a cycle whose fourth attempt is transient or timed out counts one exhausted budget; manual attempts count as manual retries, an unsent one placed by `queued_at`; image and video rows give `null` for both (AC2).
- [x] 2.4 Write failing tests for wordings: grouped by text, most frequent first then alphabetical, at most five per stage, only voice, alignment and reasoning (AC2).
- [x] 2.5 Write failing tests: scenes failed now split into image and clip, the same for any period (AC3); a clip failure text and script, prompt and narration markers never appear in the serialized report (AC4).
- [x] 2.6 Export `countedAttempts` from `providerUsageReport.ts` and add `backend/src/failuresReport.ts`. Make 2.1 to 2.5 pass.

## 3. Backend: route (TDD)

- [x] 3.1 Write failing route tests: `GET /admin/reports/failures` answers 401 without the password or with a wrong one (AC5); 400 when `from` is not before `to`; 200 with the response schema otherwise; the table contents are the same before and after.
- [x] 3.2 Register the route in `adminReportRoutes.ts` with the Zod query and a strict response schema. Make 3.1 pass.

## 4. Frontend: Failures and retries table (TDD; design Decision 7)

- [x] 4.1 Write failing component tests: the Reports section shows a "Failures and retries" table with one row per stage, "not recorded" for the scene-stage budgets and manual retries, the wordings with their counts, and the scenes failed now labelled as current; an empty period says there were no failures and still shows the failed-now counts; a 401 locks the page; a network error shows its own message and is cleared when the period changes.
- [x] 4.2 Add the types and client call (`types.ts`, `api/client.ts`), `FailuresTables.tsx`, and the request in `ReportsSection.tsx`. Make 4.1 pass.

## 5. Backend and Frontend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Run the admin-reports-route, provider-usage-report, pipeline-time-report and reports-section tests; fix only assertions that the third request or the new export legitimately change (for example a test that counts fetch calls).

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline of the local database (row counts of `stage_attempts`, `provider_requests`, `scenes`, `schema_migrations` max version)
- [x] 6.2 Run the targeted tests from groups 2 to 4
- [x] 6.3 Run the full backend and frontend suites and lint in this worktree with their own `DB_PATH` and `PROJECTS_ROOT`
- [x] 6.4 Verify the post-test database state matches the baseline and restore if needed
- [x] 6.5 Create report `openspec/changes/report-failures-and-retries/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [x] 6.6 Mark this group complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the backend on a copy of a database that holds real failed attempts and failed scenes (the Windows run results, or a stub-provider session with failure modes); record the row counts
- [x] 7.2 `GET /admin/reports/failures` for the last 30 days and for all time; compare each stage's counts with `GET /admin/reports/provider-usage` for the same period and with direct sqlite counts (AC1 to AC3)
- [x] 7.3 Grep the response for the clip failure texts stored in `scenes.last_error`: none appears (AC4)
- [x] 7.4 Request the report without the password (401) and with `from` after `to` (400) (AC5)
- [x] 7.5 Document commands and responses in `reports/YYYY-MM-DD-step-7-manual-endpoint-testing.md`; confirm the row counts are unchanged and the original database is untouched. The copy is kept for group 8 and removed at its end (8.2).

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Unlock `/admin`, open Reports, confirm the Failures and retries table matches the curl answer of 7.2, switch to "All time" and back, and confirm the failed-now counts do not change; record in `reports/YYYY-MM-DD-step-8-e2e-testing.md`
- [ ] 8.2 Stop the servers, remove the scratch database copy and confirm the original `Winrun_results/vid4you.sqlite` is unchanged

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 `docs/api-spec.yml`: add `GET /admin/reports/failures`
- [ ] 9.2 Run `graphify update .`
- [ ] 9.3 Commit, then (after the user's go-ahead) push and open the PR linking JOS-224; archive the change after merge
