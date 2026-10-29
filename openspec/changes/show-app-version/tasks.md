## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-238-version-specification` created from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-238` (done by `/opsx:propose`)
- [x] 0.2 Verify it is the current branch of that worktree and has no upstream

## 1. Backend: Tests First (TDD)

- [ ] 1.1 Test that `GET /app/version` returns `{ version, channel }` from `BUILD` and no other field (find where `/app/update` is tested and follow it)
- [ ] 1.2 Test `readBuildConfig` with and without `VID4YOU_VERSION` (`0.0.0-dev` / `development` without it; a given version and each channel with it)

## 2. Backend: Implementation

- [ ] 2.1 Add the response schema and `GET /app/version` next to `/app/update` in `backend/src/routes.ts` (design Decision 3)

## 3. Frontend: Tests First (TDD)

- [ ] 3.1 In `frontend/test/components.test.tsx`: `TopBar` shows `v2026.10.28-3d00e7b` for `production`, `Development build` for `development`, `v… · uat` for `uat`, with the accessible name `Vid4You version <version>`
- [ ] 3.2 `TopBar` without a version renders without the label
- [ ] 3.3 `App` requests `/app/version` once on `/admin`, on the start form and after moving to a session page, and shows no label when the request fails

## 4. Frontend: Implementation

- [ ] 4.1 Add the `AppVersion` type in `frontend/src/types.ts` and `getAppVersion()` in `frontend/src/api/client.ts`
- [ ] 4.2 Add the `appVersion` prop and label to `TopBar`; load the version once in `App` and pass it to all three `TopBar`s (design Decisions 1 and 2)
- [ ] 4.3 Add the `.app-version` style in `frontend/src/styles/app.css` (design Decision 4)

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Check the existing `TopBar` and `App` tests still pass with the new prop and request; update the fetch mocks that list the known endpoints, if any

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [ ] 6.2 Run the targeted backend and frontend tests
- [ ] 6.3 Run typecheck, lint and tests in `backend` and `frontend`
- [ ] 6.4 Verify the post-test database state and restore if needed
- [ ] 6.5 Create `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [ ] 6.6 Mark the step complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the backend from source and `curl` `GET /app/version`: `{"version":"0.0.0-dev","channel":"development"}` and no other field
- [ ] 7.2 Start it with `VID4YOU_VERSION=2026.10.28-3d00e7b VID4YOU_CHANNEL=production` and `curl` again
- [ ] 7.3 Check the request is refused for a foreign `Origin` or `Host`, as for the other routes
- [ ] 7.4 Record the commands and responses in `reports/`; no data is created, so the database needs no restoration

## 8. Frontend: E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Run backend and frontend; open the start form, a session page and `/admin`: `Development build` is in the top bar of each
- [ ] 8.2 Restart the backend with `VID4YOU_VERSION=2026.10.28-3d00e7b VID4YOU_CHANNEL=production`: each screen shows `v2026.10.28-3d00e7b`; scroll a long session page and confirm it stays visible
- [ ] 8.3 Resize the window to about 400 px: the other top-bar controls stay on screen
- [ ] 8.4 Block `/app/version` and confirm the bar renders without the label and without an error
- [ ] 8.5 Record the scenarios and outcomes in `reports/`; restore any test data

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 Add `/app/version` to `docs/api-spec.yml`
- [ ] 9.2 Update `readme.md` (release section, Spanish): where users find the version and how it maps to a GitHub release (`release-<tree hash>`)
- [ ] 9.3 Run `graphify update .`
- [ ] 9.4 Check with a `dry-run` release artifact that the label shows the date-hash version (ticket Definition of Done)
- [ ] 9.5 Open the pull request into `main` linking JOS-238; archive the change after merge
