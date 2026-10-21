## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Fetch, then create branch `feature/jos-208-add-linting-and-static-analysis` from `feature/entrega-2-JAME` with `--no-track`
- [x] 0.2 Verify the current branch and that it has no upstream

## 1. Backend tooling and rule set

- [x] 1.1 Add `eslint`, `@eslint/js` and `typescript-eslint` to backend `devDependencies` (pinned versions that resolve with `npm ci` on Node 24)
- [x] 1.2 Create `backend/eslint.config.js`: `recommendedTypeChecked`, `projectService`, scope `src` and `test`, ignores for `node_modules` and `data`, `reportUnusedDisableDirectives`
- [x] 1.3 Add the `lint` script (`eslint .`) to `backend/package.json`
- [x] 1.4 Run it once and record the findings count per rule, to size the work

## 2. Frontend tooling and rule set

- [x] 2.1 Add `eslint`, `@eslint/js`, `typescript-eslint` and `eslint-plugin-react-hooks` to frontend `devDependencies`
- [x] 2.2 Create `frontend/eslint.config.js`: same base, plus React Hooks rules; ignore `dist` and `node_modules`; cover `vite.config.ts` and `vitest.config.ts`
- [x] 2.3 Add the `lint` script (`eslint .`) to `frontend/package.json`
- [x] 2.4 Run it once and record the findings count per rule

## 3. Fix existing violations (no behaviour change)

- [x] 3.1 Backend `src`: type the SQLite rows in `db.ts` (row interfaces replacing `row: any`), then fix or suppress the remaining findings per line with a one-line reason; any non-mechanical fix is its own commit
- [x] 3.1a Backend `test`: add one `test/**` override turning off the `no-unsafe-*` rules and `no-explicit-any`, with the reason in a comment; fix the remaining test findings (`require-await`, `unused-vars`, `unnecessary-type-assertion`)
- [x] 3.2 Frontend: same approach
- [x] 3.3 Any test-only rule override is added to the config with a comment giving the reason, never a blanket disable
- [x] 3.4 Build a list of findings that indicate real defects (unused code, unhandled promise, unsafe cast) with their disposition, for the PR description
- [x] 3.5 `npm run lint` exits 0 in both packages, with no unused disable directives

## 4. CI gate

- [x] 4.1 Add `- run: npm run lint` after `npm run typecheck` in `.github/workflows/ci.yml` and update the header comment
- [x] 4.2 Prove the gate: introduce a deliberate violation locally (not committed), confirm `npm run lint` fails in both packages, then revert it

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Confirm no existing test needs changing for behaviour; list any test touched only for a lint fix
- [x] 5.2 Confirm the spec scenarios in `specs/static-analysis/spec.md` are each covered by a command run in tasks 3.5, 4.2 and 6.x (no application code is added, so no new unit test is written)

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test state of the test database and projects folder (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [x] 6.2 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend/` and `frontend/`; counts must match the baseline (backend 1719 passed, 5 skipped; frontend 258) with the frontend `npm run build` still correct
- [x] 6.3 Verify the post-test state equals the baseline and restore it if not
- [x] 6.4 Create `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` in the change folder and mark the step done only after it exists
- [x] 6.5 Run the same commands in a fresh worktree to rule out local-only effects — this worktree was created fresh from origin/feature/entrega-2-JAME with `npm ci` and no local secrets file

## 7. Manual Endpoint Testing with curl (MANDATORY)

- [x] 7.1 Record in a report that no endpoint is added or changed, and run one smoke call (`GET /health` or the OpenAPI route) against the linted backend to confirm it still starts; stop the server afterwards

## 8. E2E Testing with Playwright (MANDATORY if applicable)

- [ ] 8.1 Record that no user workflow changes; load the built frontend once against the running backend and confirm it renders without console errors — NOT executed; see reports/2026-10-20-step-8-e2e-not-executed.md

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 Update `readme.md` section 2.6: add `npm run lint` next to the typecheck and test commands, update the test counts and CI sentence, remove the "no lint" limitation
- [x] 9.2 Record the tool choice and rule set in `docs/backend-standards.md` and `docs/frontend-standards.md`, and note lint in the CI line of the `readme.md` directory tree (`.github/workflows`)
- [x] 9.3 Run `graphify update .`

## 10. Pull request

- [x] 10.1 Commit the work on the feature branch in separate commits: tooling and CI, backend fixes, frontend fixes, docs
- [ ] 10.2 After approval, push and open the PR linking JOS-208, with the defect-findings list from 3.4, and a note that the check should be made required on `main` and `feature/entrega-2-JAME`
