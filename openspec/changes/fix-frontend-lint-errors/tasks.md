## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-231-fix-frontend-lint-errors` from `origin/main` (worktree `AI4Devs-jos-231`, no upstream)
- [x] 0.2 Verify the current branch

## 1. Frontend: Tests first (TDD)

- [x] 1.1 In `frontend/test/reports-section.test.tsx`, add a test: the provider-usage request fails for the first period, the error shows, the Administrator chooses another period, and the error is gone (the test passes before the fix; it guards the behavior — checked by removing the clearing: it then fails)
- [x] 1.2 Run `npm run lint` and record the two errors as the failing signal — `ReportsSection.tsx:41:5` setState in an effect and `reports-section.test.tsx:5:10` unused `API_BASE` (2 errors, 6 warnings)

## 2. Frontend: Implementation

- [x] 2.1 In `ReportsSection.tsx`, clear both error messages in the handler passed to `ReportPeriodSelector` and remove the two calls at the start of the effect
- [x] 2.2 Remove the unused `API_BASE` import from `reports-section.test.tsx`
- [x] 2.3 Confirm `npm run lint` has 0 errors (the six warnings remain) and group 1's test still passes — lint: 0 errors, 6 warnings; `reports-section.test.tsx`: 19 passed

## 3. Backend

- [x] 3.1 No backend change (record the check) — the diff touches only `frontend/`

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Review the other tests of `ReportsSection` and `ReportPeriodSelector` for any that rely on the error being cleared inside the effect
- [ ] 5.2 Update the affected tests (none expected) and make group 1 pass

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test database baseline (no database is used by the frontend tests; record `backend/data` absent)
- [ ] 6.2 Run targeted tests for the changed files
- [ ] 6.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `frontend`, and the same three in `backend` (nothing changed there)
- [ ] 6.4 Verify post-test state and restore if needed
- [ ] 6.5 Create report `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [ ] 6.6 Mark the step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (not applicable)

- [ ] 7.1 Record in `reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md` that no endpoint changed

## 8. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 8.1 With the frontend and a backend running on throwaway data, open `/admin`, open the Reports section, stop the backend, choose another period to see the error, restart it, choose a period again and confirm the error is gone (AGENT MUST EXECUTE)
- [ ] 8.2 Restore the environment and document the scenarios in `reports/YYYY-MM-DD-step-8-e2e-browser.md`

## 9. Real-provider check (not applicable)

- [ ] 9.1 Record in the final report that no provider is involved

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/PRD.md`, `docs/api-spec.yml`, `docs/data-model.md` and the README do not change (record the check)
- [ ] 10.2 Run `graphify update .`
- [ ] 10.3 Open the pull request linking JOS-231 and JOS-206; archive the change after merge (`openspec archive fix-frontend-lint-errors --skip-specs`)
- [ ] 10.4 After the merge, re-run the Release workflow in `dry-run` mode on `main` and confirm its frontend check passes (JOS-206 task 7.2)
