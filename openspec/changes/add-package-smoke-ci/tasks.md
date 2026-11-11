## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Ticket JOS-279 (Chore, Improvement). Branch `chore/jos-279-package-smoke-ci` made with `git worktree add --no-track` from `origin/feature/entrega-3-JAME`; open its PR against `feature/entrega-3-JAME`, and confirm the PR is still OPEN before adding commits to its branch

## 1. Smoke script (TDD)

- [x] 1.1 Write `backend/packaging/smokeRun.ts` with the scenarios "A session runs through the executable" and "Nothing is left behind"; run it against the built smoke flavor and see it pass, and against a missing folder and see it fail with the log
- [x] 1.2 Add the `package:smoke:run` script to `backend/package.json`

## 2. CI

- [x] 2.1 Add `.github/workflows/package-smoke.yml` (design Decisions 1-2), using the action SHAs `ci.yml` pins
- [ ] 2.2 Confirm the job is green on the PR and red on a deliberately broken packaged entry (reverted afterwards); confirm it does not run on a documentation-only pull request

## 3. Review and Update Existing Unit Tests (MANDATORY)

- [x] 3.1 Confirm no existing backend or frontend test changes (the script is not part of the product bundle; `packaging-build.test.ts` still passes)

## 4. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 4.1 AGENT MUST EXECUTE: with scratch `DB_PATH` and `PROJECTS_ROOT` run `npm run typecheck`, `npm run lint` and `npm test` in `backend/`; record the `backend/data/` fingerprint before and after; write `reports/<date>-step-4-unit-test-and-db-verification.md`

## 5. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Not applicable: no endpoint is added or changed. Record that in the step 4 report

## 6. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Not applicable: no user-interface change; the smoke run itself is the end-to-end check. Record it in the step 4 report with three consecutive local runs of `npm run package:smoke:run`

## 7. Update Technical Documentation (MANDATORY)

- [x] 7.1 `readme.md` §2.6 and the "No ejecutado" item of the closure notes: the smoke run now runs in CI on pull requests that change `backend/` or `frontend/`
- [x] 7.2 `docs/development_guide.md`: how to run `package:smoke` and `package:smoke:run` locally and the port it uses (3102)
- [x] 7.3 Leave `graphify-out/` untouched in this PR (the graph is rebuilt in a dedicated PR to avoid merge conflicts)
