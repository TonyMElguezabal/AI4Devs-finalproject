## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-228-phase-instants-pipeline-report` created from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-228` (done by `/opsx:propose`)
- [x] 0.2 Verify it is the current branch of that worktree and has no upstream

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the latest migration on `origin/main` is still 21; if another branch merged a 22, renumber and update design.md first.
- [x] 1.2 Confirm design.md § Context still holds: locate the boundary writes (first voice, decomposition/timestamps and assembly attempt inserts; `insertVoiceOver`; scene registration; the last-scene completion; the first `final_video_path` set) and record file and line in design.md Decision 2.

## 2. Backend: migration 22 and the stamping function (TDD; design Decisions 1, 2)

- [x] 2.1 Write failing tests: a database migrated up to 21 holding a completed session gets the `phase_instants` table and no rows (spec: existing sessions keep no instants); every other table is unchanged.
- [x] 2.2 Write failing tests for `stampPhase`: first start and first end win; a second call with a different instant changes nothing; an end without a start is stored.
- [x] 2.3 Add migration 22 and `stampPhase` in `db.ts`. Make 2.1 and 2.2 pass.

## 3. Backend: stamp the phase boundaries (TDD; design Decisions 2, 3)

- [x] 3.1 Write failing tests through the real write paths: a stub-provider session run end to end has a start and an end for all four phases, each start not after its end (AC1).
- [x] 3.2 Write failing tests: a retried voice-over keeps the first attempt's start; a rebuilt final video leaves the assembly instants unchanged; the scenes phase starts at scene registration and ends at the last scene's completion.
- [x] 3.3 Add the `stampPhase` calls. Make 3.1 and 3.2 pass.

## 4. Backend: pipeline-time report and route (TDD; design Decisions 4, 5)

- [x] 4.1 Write failing tests for `pipelineTimeReport`: two sessions give per-session seconds, session count, median and 95th percentile; a phase without an end or without instants shows no time and is not aggregated (AC2, AC3).
- [x] 4.2 Write failing tests: voice-over attempts stored as `timed-out`, `late-success` and `superseded` are counted per phase by `sent_at` in the period; the scenes row reports the counts as not recorded.
- [x] 4.3 Add `backend/src/pipelineTimeReport.ts` (reusing `nearestRankPercentile`). Make 4.1 and 4.2 pass.
- [x] 4.4 Write failing route tests: `GET /admin/reports/pipeline-time` answers 401 without the password and runs no query (AC4); 400 when `from` is not before `to`; 200 with the response schema otherwise.
- [x] 4.5 Register the route in `adminReportRoutes.ts` with Zod request and response schemas. Make 4.4 pass.

## 5. Frontend: Pipeline time table (TDD)

- [x] 5.1 Write failing component tests: the Reports section shows a "Pipeline time" table with elapsed seconds per phase, "—" where there is no time and "not recorded" for the scenes counts; a 401 locks the page.
- [x] 5.2 Add the types and client call (`api/client.ts`, `types.ts`) and the table in `ReportsSection.tsx`, under the existing period. Make 5.1 pass.

## 6. Backend and Frontend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Run the migration, admin-reports-route, provider-usage-report, stage-attempt, voice-over, decomposition, assembly and admin-page tests; fix only assertions that list migrations or compare whole table sets.

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test baseline of the local database (`phase_instants` absence, `schema_migrations` max version)
- [x] 7.2 Run the targeted tests from groups 2 to 5
- [x] 7.3 Run the full backend and frontend suites in this worktree with their own `DB_PATH` and `PROJECTS_ROOT`
- [x] 7.4 Verify the post-test database state matches the baseline and restore if needed
- [x] 7.5 Create report `openspec/changes/record-phase-instants-and-pipeline-report/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [x] 7.6 Mark this group complete only after tests pass and the report exists

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the backend on a copy of a pre-change database; confirm migration 22 applied and the existing sessions have no instants
- [x] 8.2 `GET /admin/reports/pipeline-time` for the old sessions: every phase shows no time (AC2)
- [x] 8.3 Run a stub-provider session end to end via curl; sqlite shows four phases with both instants; the report shows seconds per phase (AC1, AC3)
- [x] 8.4 Request the report without the password (401) and with `from` after `to` (400) (AC4)
- [x] 8.5 Document commands and responses in `reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`; remove the test session and the database copy

## 9. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Unlock `/admin`, open Reports, confirm the Pipeline time table shows the session from 8.3 and "—" for an old session; record in `reports/YYYY-MM-DD-step-9-e2e-testing.md`

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 `docs/data-model.md`: add `phase_instants` (migration 22)
- [x] 10.2 `docs/api-spec.yml`: add `GET /admin/reports/pipeline-time`
- [x] 10.3 Run `graphify update .`
