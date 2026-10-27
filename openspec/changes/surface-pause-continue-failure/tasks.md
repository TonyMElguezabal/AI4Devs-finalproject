## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-217-pause-continue-error` exists from `origin/main` with no upstream, in the worktree `../AI4Devs-jos-217` (checked by `/opsx:propose`)
- [ ] 0.2 `git fetch`; confirm it is the current branch of that worktree, still has no upstream, and `origin/main` has not moved past its base (merge it in if it has)

## 1. Gate

- [ ] 1.1 Confirm design.md § Context still holds: the pause and continue routes' only refusal is 404 `unknown session`; `SessionHeader` is the only place that renders the Pause and Continue buttons; `App.tsx` still carries both suppressions.

## 2. Frontend: sentence lookup (TDD; design Decision 2)

- [ ] 2.1 Write failing tests for `sessionPauseRefusalSentence`: `unknown session` reads "This session could not be found." for both actions; any other reason, `Failed to fetch` included, reads "The session could not be paused." or "The session could not be continued."
- [ ] 2.2 Add `sessionPauseRefusalSentence` to `frontend/src/pauseRefusals.ts`. Make 2.1 pass.

## 3. Frontend: header handles its own failure (TDD; design Decisions 1, 3)

- [ ] 3.1 Write failing component tests for `SessionHeader` (spec scenarios): pause rejecting with `TypeError("Failed to fetch")` shows "The session could not be paused." and the button is enabled again (AC1); continue rejecting likewise shows "The session could not be continued." (AC2); a rejection with `unknown session` shows "This session could not be found."; the button is disabled while the promise is pending; a resolved request shows no sentence and the header still shows the session as not paused (AC3); a second click clears the sentence while pending.
- [ ] 3.2 Change `onPause`/`onContinue` to `() => Promise<unknown>` in `SessionHeader` and `SessionPage`; add `pending` and `refusal` state to `SessionHeader` with `role="status"` output. Make 3.1 pass.
- [ ] 3.3 Remove both `eslint-disable-next-line @typescript-eslint/no-misused-promises` comments for `onPause` and `onContinue` in `frontend/src/App.tsx` (AC4). Add a suppression with a reason on the header's buttons only if lint asks, as `PhaseRetryButton` does.

## 4. Frontend: Review and Update Existing Unit Tests (MANDATORY)

- [ ] 4.1 Replace the existing `onPause={() => {}}`/`onContinue={() => {}}` props in `frontend/test/` with a shared `async () => {}` helper; change no assertion.

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 5.1 Capture the pre-test baseline of the local database (`runs` count and paused flags)
- [ ] 5.2 Run the targeted tests from groups 2 and 3
- [ ] 5.3 Run the full frontend suite (every existing test plus the new ones), `npm run lint` and the type check in `frontend/` (AC4, AC5); run the backend suite in this worktree with its own scratch `DB_PATH` and `PROJECTS_ROOT` to confirm nothing else moved
- [ ] 5.4 Verify the post-test database state matches the baseline and restore if needed
- [ ] 5.5 Create report `openspec/changes/surface-pause-continue-failure/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [ ] 5.6 Mark this group complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 6.1 Start the backend on a copy of the local database with stub providers
- [ ] 6.2 `POST /sessions/<unknown>/pause` and `/continue` answer 404 with reason `unknown session` (the string the lookup maps); pause and continue on a real session answer 200 and the database flag follows
- [ ] 6.3 Restore the session's paused flag; document commands and responses in `reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`; remove the database copy

## 7. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Open a session page; pause and continue it successfully and confirm the header follows the live update with no sentence (AC3)
- [ ] 7.2 Stop the backend; click `Pause session` and confirm "The session could not be paused." and an enabled button (AC1); do the same for `Continue session` on a paused session (AC2); confirm the console shows no unhandled rejection
- [ ] 7.3 Restart the backend, restore the session's state, and record in `reports/YYYY-MM-DD-step-7-e2e-testing.md`

## 8. Update Technical Documentation (MANDATORY)

- [ ] 8.1 Confirm `docs/api-spec.yml` and `docs/data-model.md` need no change (no API or schema change); check PRD §8.3/§9 and update it only if it describes pause feedback
- [ ] 8.2 Run `graphify update .`
- [ ] 8.3 Commit, then (after the user's go-ahead) push and open the PR linking JOS-217; archive the change after merge
