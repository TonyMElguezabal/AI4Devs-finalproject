## 0. Setup

- [x] 0.1 Create and switch to `feature/retry-or-correct-clip-backend` before changing implementation code
- [x] 0.2 Verify the branch and record the starting working-tree state — isolated worktree; initial source tree clean apart from this change's untracked planning artifacts

## 1. Backend clip recovery (TDD)

- [x] 1.1 Add failing backend tests for video-stage retry and correction through the existing session-scoped routes, including same `VIDEO`, bound-provider reuse, image preservation, paused-session holding, not-retryable manual recovery, invalid input, and non-video refusals — new API and video-stage tests fail at the current `image-already-generated` guard as expected; existing tests already cover invalid and non-video cases
- [x] 1.2 Add failing persistence and race tests proving video retry/correction updates are conditional on the owning session, failed video state, stored image, and absent clip, and that only one concurrent command launches — concurrent video retry and retry-vs-correction now fail red with two 409 responses; already-committed clip refusal is covered
- [x] 1.3 Implement conditional database transitions that preserve `result`, `video_result`, locked content, timing fields, provider binding, and unrelated scenes; correction SHALL trim and update only `video_instruction` plus required state/retry bookkeeping — focused route/race tests pass
- [x] 1.4 Update the orchestrator to dispatch scene recovery by the persisted failed stage, launch a video retry from `image-complete` through the existing launch gate, and preserve the established image-recovery behavior — bound-provider and not-retryable manual-retry tests pass
- [x] 1.5 Update route validation/refusal mapping and API contract documentation for clip recovery without adding endpoints or changing request/response shapes — route schemas and response shape remain unchanged; stale JOS-146 refusal note replaced
- [x] 1.6 Run focused backend route, persistence, video-stage, retry-policy, pause, provider-binding, and runtime-load tests; resolve all failures before continuing — 16 route/image-regression tests, 17 video-stage tests, and backend typecheck passed; superseded clip-refusal assertions remain for task 3.1
- [x] 1.7 Publish the updated session snapshot after an accepted clip retry/correction even when pause holds provider work; add a backend event test proving the held `image-complete` state is emitted without a video request — both paused retry and correction event tests pass

## 2. Frontend clip recovery (TDD)

- [x] 2.1 Add failing `sceneActions` and component tests for stage-specific retry visibility, image-vs-video correction forms, prefilled `VIDEO`, accessible names, blank input, pending state, and readable refusal messages — new failed-video action/form tests fail red as expected
- [x] 2.2 Extend `sceneActions()` and `SceneRow` to render stage-appropriate controls, bind the correction draft to the failed stage's instruction, and map any new refusal reasons to user-readable sentences
- [x] 2.3 Run focused frontend tests and typecheck; verify image-failure controls and behavior remain unchanged — 14 focused component tests and frontend typecheck passed

## 3. Review and update existing unit tests (MANDATORY)

- [x] 3.1 Review and update existing tests that assert clip retry/correction is refused, including video-stage, scene-action, route, and API-contract tests — obsolete refusal assertions replaced; stale frontend reason mapping removed
- [x] 3.2 Confirm the resulting tests cover the new acceptance scenarios and retain regression coverage for image-stage recovery — backend scene/video suites passed (73 tests), clip route boundary cases passed (9 tests), and frontend suite passed (159 tests)

## 4. Run unit tests and verify database state (MANDATORY)

- [x] 4.1 Capture the relevant pre-test database baseline and record the exact test commands — isolated SQLite at `/tmp/jos-158-verification-31901.sqlite`; all six tracked tables started at 0 rows
- [x] 4.2 Run targeted backend and frontend unit tests, then the required broader backend and frontend suites; record pass/fail/skip totals, duration, and flaky behavior — final full backend: 1,403 passed, 4 skipped, 54.64 s; frontend: 159 passed, 3.46 s; both typechecks passed
- [x] 4.3 Re-check the same database indicators, restore any unintended mutation, and create `specs/retry-or-correct-clip/reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md` with commands, results, database comparison, and cleanup — report: `specs/retry-or-correct-clip/reports/2026-10-09-step-4-unit-test-and-db-verification.md`
- [x] 4.4 Mark this verification complete only after required tests pass (or an approved exception is recorded), database state is verified/restored, and the report exists

## 5. Manual endpoint testing with curl (MANDATORY — AGENT MUST EXECUTE)

- [x] 5.1 Start the backend with a deterministic video-provider test mode and capture the test database baseline — isolated temporary SQLite/project paths; video success stub
- [x] 5.2 Use curl to verify successful same-instruction retry and corrected-`VIDEO` retry, blank correction validation, non-failed refusal, unknown/cross-session 404, and response shapes; verify the image and unrelated scene results remain unchanged
- [x] 5.3 Verify provider call count and final scene state, clean up test data/restore the database baseline, and save commands, responses, and cleanup in `specs/retry-or-correct-clip/reports/YYYY-MM-DD-step-5-curl-endpoint-testing.md` — report: `specs/retry-or-correct-clip/reports/2026-10-09-step-5-curl-endpoint-testing.md`

## 6. End-to-end browser testing (MANDATORY — AGENT MUST EXECUTE)

- [x] 6.1 Start the backend and frontend test environment and create a deterministic session with a failed clip — isolated backend DB, paused three-scene session, success video stub, frontend at port 5173
- [x] 6.2 Use Playwright MCP or an equivalent agent-driven browser tool to verify clip retry, `VIDEO` correction, accessible labels, refusal feedback, paused-session behavior, and absence of clip controls outside a failed video stage; verify the live-updated scene state
- [x] 6.3 Restore the database/test environment and save scenarios, outcomes, and cleanup in `specs/retry-or-correct-clip/reports/YYYY-MM-DD-step-6-e2e-testing.md` — report: `specs/retry-or-correct-clip/reports/2026-10-09-step-6-e2e-testing.md`

## 7. Technical documentation and final verification (MANDATORY)

- [x] 7.1 Update `docs/api-spec.yml`, `docs/data-model.md`, `docs/backend-standards.md`, and `docs/frontend-standards.md` to describe stage-aware clip recovery and remove stale statements that it is unavailable; regenerate the API contract from route schemas where required — contract shape unchanged; generated route schemas remain identical; stale behavioral contract note replaced
- [x] 7.2 Run the required backend and frontend typechecks and test suites after documentation/API regeneration; inspect the final diff for accidental changes — final full suites and typechecks passed
- [x] 7.3 Confirm all new and modified requirements are covered by tests and report any remaining limitation without marking the change complete — backend, frontend, curl, and browser reports cover retry/correction, persistence races, provider binding, image preservation, pause/live updates, validation, refusal, and cleanup; no implementation blockers remain