## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Ticket JOS-272 (Chore, Documentation). Create `feature/jos-272-add-browser-e2e` with `git worktree add --no-track` from `chore/jos-272-add-browser-e2e-proposal` (this proposal's branch, so the change files exist), and open its PR against `feature/entrega-3-JAME`; confirm the proposal PR is still OPEN before adding commits to its branch

## 1. Test package and first failing run (TDD)

- [x] 1.1 Create `e2e/package.json` (private, `type: module`, script `test: playwright test`, dev dependency `@playwright/test`), run `npm install` for the lockfile, and add `e2e/node_modules`, `e2e/test-results` and `e2e/playwright-report` to `.gitignore`
- [x] 1.2 Write `e2e/tests/main-flow.spec.ts` with the scenario "A session runs from the page to its downloaded video" (role- and label-based selectors; auto-retrying expectations bounded at 60 s) and `e2e/playwright.config.ts` with the two `webServer` entries (design Decision 2); run it and see it fail because no config or selectors match yet
- [x] 1.3 Make it pass: complete the config (scratch folder from `mkdtempSync`, `ALL_STUBS_SUCCEEDING` and `WORKFLOW_SCRIPT` imported from `backend/test/workflowServer.ts`, backend on 3101, Vite on 5173 with `VITE_API_BASE`, `reuseExistingServer: false`, chromium only, 1 retry in CI) and, only if an element has no accessible name, add that name in `frontend/src`
- [x] 1.4 Add the isolation checks: the spec compares `backend/data/` before and after (as `workflow-end-to-end.test.ts` does) and the config removes the scratch folder at teardown; prove "A server already on a port" by starting a listener on 5173 and seeing the run fail naming the port

## 2. CI

- [x] 2.1 Add the `e2e` job to `.github/workflows/ci.yml` (design Decision 6) using the action SHAs already pinned there; upload `e2e/playwright-report` and traces on failure
- [x] 2.2 Push the branch only after the owner approves; confirm the `e2e` job is green on the PR and that a deliberately broken form (reverted afterwards) turns it red

## 3. Review and Update Existing Unit Tests (MANDATORY)

- [x] 3.1 Confirm no existing backend or frontend test changes; if step 1.3 touched `frontend/src`, update or add the matching test in `frontend/test`

## 4. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 4.1 AGENT MUST EXECUTE: with scratch `DB_PATH` and `PROJECTS_ROOT` run `npm run typecheck`, `npm run lint` and `npm test` in `backend/` and `frontend/`; record the `backend/data/` fingerprint before and after; write `reports/<date>-step-4-unit-test-and-db-verification.md` in this change folder

## 5. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Not applicable: no endpoint is added or changed. Record that in the step 4 report instead of a separate one

## 6. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 AGENT MUST EXECUTE: run `npm test` in `e2e/` three times in a row on a clean checkout of the branch and record pass or fail, duration and any retry; save the report under `reports/`

## 7. Update Technical Documentation (MANDATORY)

- [x] 7.1 `readme.md` §2.6: replace "La interfaz no tiene pruebas E2E automatizadas en navegador" with the new test, its command and that CI runs it; remove the matching item from §1.6 if any
- [x] 7.2 `docs/development_guide.md`: how to run `e2e/` locally, the ports it needs (3101, 5173) and how to open the trace of a failure
- [x] 7.3 Refresh `docs/release/mvp-release-gates.md` rows that mention browser tests, if any
- [x] 7.4 Run `graphify update .` and commit the graph
