## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-225-sessions-report` from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-225`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree
- [x] 0.3 Rebase onto `origin/main` (`41b03ebd`, 2026-10-27) and refresh the artifacts for what main gained since the proposal: JOS-228 (`phase_instants`, pipeline-time table), JOS-231 (`changePeriod`), the shared `periodOf`

## 1. Gate

- [x] 1.1 `git fetch`. Confirm PRD §11.4 still describes the sessions report as this change builds it (JOS-175 AC for R4); if the product owner changed it, update the artifacts first.
- [x] 1.2 Confirm the base still matches design.md § Context: the `runs`, `scenes`, `stage_attempts`, `provider_requests` and `voice_overs` columns, `failure.phase` values, how a failed rebuild is recorded (Decision 3 risk), the `/admin` child plugin, and that `ReportsSection` still owns the period.

## 2. Backend: the sessions report module (TDD; design Decisions 2–5)

- [x] 2.1 Write failing tests for `sessionsReport({ from, to })` on a seeded store: only sessions created in `[from, to)` are listed, newest first; absent `from` lists all; state is `failed` with its phase / `final-video-ready` / `in-progress`; a failure wins over a successful assembly; `paused` is reported apart from the state; scenes, failed scenes and attempts match the spike's R4 query on the same rows; seconds to the voice-over and to the final video are rounded to one decimal and `null` when the instant is missing; a session with no scenes is listed; a failed session keeps its voice-over time.
- [x] 2.2 Write failing tests for `sessionScenesReport(sessionId)`: rows in scene order with status, provider labels (id fallback, `null` unbound), image and clip request counts, requested duration, speed factor and both warnings; no rows for a session without scenes; `null` for an unknown session.
- [x] 2.3 Implement `backend/src/sessionsReport.ts`. Make 2.1 and 2.2 pass.

## 3. Backend: the routes (TDD; design Decisions 1, 2, 6)

- [x] 3.1 Write failing route tests for `GET /admin/reports/sessions` and `GET /admin/reports/sessions/:sessionId/scenes`:
  - 401 without the Administrator password and with a wrong one (both routes);
  - 200 with the response shapes of Decision 6; offset bounds select the same sessions as their UTC equivalents; 400 for `from` not before `to` and for a non-ISO value; 404 for an unknown session;
  - neither body contains the marker texts seeded in scripts, prompts, instructions, narration, failure causes and attempt error messages, nor a stored key;
  - the row counts of every table are unchanged after the calls.
- [x] 3.2 Add the two routes to `adminReportRoutes.ts` with zod schemas, reusing `periodOf` for the list, and make 3.1 and the existing report route tests pass. Confirm both routes are in the generated OpenAPI document.

## 4. Frontend: the sessions table and drill-down (TDD; design Decision 7)

- [x] 4.1 Write failing component tests:
  - `SessionsReport`: requests the list for the selected period and again when it changes; a network error shows its own message and does not hide the other reports; one row per session with title, creation time, state text ("Failed in assembly" etc.), paused flag, counts and "—" for null seconds; empty message; a 401 locks the page; the table has a caption and column headers;
  - the "Scenes of <title>" button toggles (`aria-expanded`), loads the scene table once opened with providers, attempts, duration, speed factor and warnings, and says so for a session with no scenes.
- [x] 4.2 Add `getSessionsReport` and `getSessionScenesReport` to `api/client.ts`, their types, and `SessionsReport`; render it in `ReportsSection` after the existing tables, under the one period selector. Make 4.1 and the existing Reports tests pass.

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review the tests that list `/admin` routes or sections (admin surface/route-list test, `AdminPage`/`AdminTools`/`ReportsSection` tests) and update them for the new routes and table.
- [x] 5.2 Map every scenario in `specs/admin-reports/spec.md` and JOS-225 AC1–AC5 to at least one test. List the mapping in the step 6 report.
- [x] 5.3 Confirm module test coverage has not decreased: no coverage tool is installed, so every exported function and component branch is covered by a named test instead (see the step 6 report)

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, and `data/projects/` contents.
- [x] 6.2 Run the targeted tests from groups 2–4.
- [x] 6.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json`, no settings override and no vendor key in the environment.
- [x] 6.4 Verify the post-test state matches the baseline; restore it if not.
- [x] 6.5 Create the report `openspec/changes/report-sessions/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`.
- [x] 6.6 Mark this step complete only after the tests pass and the report file exists.

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the real server on a scratch copy of the Windows-run database (two real finished sessions with 5 and 53 scenes and their attempts; the original is never touched) with its own scratch projects folder. Add to the copy only, by sqlite, one session each in progress, paused, failed in the voice-over before any scene and failed in assembly, plus a scene with a warning and one with retries. (Chosen over creating sessions through stub adapters: the real session is richer, and the states are plain rows.)
- [x] 7.2 Without the Administrator password: 401 on both routes.
- [x] 7.3 With it: the default, 7-day, all-time and custom-range lists; compare each row with the spike's R4 query run with `sqlite3` on the same scratch store; open the drill-down of a session with scenes and of one without.
- [x] 7.4 Error cases: `from` after `to`, a non-date value (400); an unknown session id (404).
- [x] 7.5 Search the response bodies for the session scripts and failure causes: none present. Confirm the store's row counts are unchanged by the calls.
- [x] 7.6 Confirm the default store and the original Windows-run database are untouched. Save `openspec/changes/report-sessions/reports/YYYY-MM-DD-step-7-manual-endpoint-testing.md`. The scratch copy is kept for step 8 and removed at 8.4.

## 8. E2E Testing with the browser (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 8.1 Applicability: new content in an `/admin` section, so this step applies.
- [ ] 8.2 Run the backend on the scratch store of step 7 and the frontend. Without the password: no Reports section. With it: the sessions table shows the expected rows and states under the provider-usage table.
- [ ] 8.3 Change the period; the list changes. Open and close the drill-down of a session with scenes and of one without.
- [ ] 8.4 Restore the environment and save `openspec/changes/report-sessions/reports/YYYY-MM-DD-step-8-e2e.md`.

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 `docs/PRD.md` §11.4: check the text matches what was built; change it (with a §16 entry) only if it does not.
- [ ] 9.2 `docs/api-spec.yml`: both routes with 200, 400 (list), 401 and 404 (drill-down).
- [ ] 9.3 `docs/frontend-standards.md`: the accessible names of the sessions table and its "Scenes of <title>" buttons.
- [ ] 9.4 `docs/development_guide.md` and the readme's `/admin` section: the sessions report and how the state is derived.
- [ ] 9.5 Run `graphify update .`.
