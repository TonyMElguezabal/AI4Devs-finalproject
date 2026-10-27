## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-232-fix-windows-packaging-build` from `origin/main` (worktree `AI4Devs-jos-232`, no upstream)
- [x] 0.2 Verify the current branch

## 1. Backend: Tests first (TDD)

- [ ] 1.1 In `backend/test/packaging-build.test.ts`, add tests for `npmInvocation(env, platform)`: with `npm_execpath` set to an `npm-cli.js` path it returns the current Node and that path as first argument, with no shell, on `win32` and on `darwin`; without it, it returns `npm` with no shell on `darwin` and with a shell on `win32`; a value that does not end in `.js` is ignored
- [ ] 1.2 Run the file and confirm the new tests fail because the function does not exist

## 2. Backend: Implementation

- [ ] 2.1 Add and export `npmInvocation` to `backend/packaging/build.ts`; let `run` take a `shell` option; use both for the frontend build step
- [ ] 2.2 Make group 1 pass and confirm the other `run(...)` calls are unchanged (Node, `tar`, `codesign`)

## 3. Frontend

- [ ] 3.1 No frontend change (record the check)

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Review the other packaging tests (`packaging-build`, `packaging-instance`, `packaging-locations`, `packaging-runtime-env`, `packaging-verify`) for assumptions about how the build starts npm
- [ ] 5.2 Update the affected tests (none expected) and make group 1 pass

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test baseline (isolated `DB_PATH` and `PROJECTS_ROOT`; `backend/data` absent)
- [ ] 6.2 Run targeted tests for the changed files
- [ ] 6.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend` and `frontend`
- [ ] 6.4 Verify post-test state and restore if needed
- [ ] 6.5 Create report `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [ ] 6.6 Mark the step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (not applicable)

- [ ] 7.1 Record in `reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md` that no endpoint changed

## 8. E2E Testing with Playwright MCP (not applicable)

- [ ] 8.1 Record in `reports/YYYY-MM-DD-step-8-e2e-browser.md` that no frontend code or copy changed

## 9. Real check

- [ ] 9.1 Run the real build step locally on macOS (`npm run package:smoke`, which downloads the pinned Node, ffmpeg and ffprobe) and record that the frontend build step and the rest still pass; the Windows case can only be checked on CI (task 10.4)

## 10. Update Technical Documentation and Verify on CI (MANDATORY)

- [ ] 10.1 `docs/PRD.md`, `docs/api-spec.yml`, `docs/data-model.md` and the README do not change (record the check)
- [ ] 10.2 Run `graphify update .`
- [ ] 10.3 Open the pull request linking JOS-232 and JOS-206; archive the change after merge (`openspec archive fix-windows-packaging-build --skip-specs`)
- [ ] 10.4 After the merge, run the Release workflow in `dry-run` mode on `main` and record how far the Windows and macOS builds get; record any new build problem in this change's report and fix or ticket it
