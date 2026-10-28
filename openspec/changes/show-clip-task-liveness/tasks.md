## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-233-clip-task-liveness` exists from `origin/feature/entrega-3-JAME` (at `d97175bd`, PR #133 merged) with no upstream, in the worktree `../AI4Devs-jos-233` (checked by `/opsx:propose`)
- [x] 0.2 `git fetch`; confirm it is the current branch of that worktree, still has no upstream, and `origin/feature/entrega-3-JAME` has not moved past its base (merge it in if it has); run `npm ci` in `backend/` and `frontend/`

## 1. Gate

- [x] 1.1 Confirm design.md § Context still holds: `runVideoAttempt` writes the provider's task id into `current_request_id` before `recordVideoRequestSent`; the pending branch of `pollVideoRequestOnce` does not broadcast; `videoRequestView` returns nothing until `video_request_sent_at` is set; `settleVideoInFlight` passes the stored send time to the poll loop

## 2. Backend: view fields (TDD; design Decisions 1, 2, 4, 6)

- [x] 2.1 Write failing tests for `videoRequestView`: `taskId` equals the scene's `current_request_id`; `lastCheckedAt` is null with no recorded check, equals the recorded instant after `recordTaskCheck` for the same task, and is null again when the recorded check belongs to another task (a retry); `waitEndsAt` is send time + `videoTaskCeilingMs()`, and null when the video stage has no limit
- [x] 2.2 Add `recordTaskCheck`, `resetTaskChecksForTests` and the three fields in `backend/src/videoRequestStatus.ts`; add them to `VideoRequestView` in `backend/src/types.ts` and to `videoRequestSchema` in `backend/src/routes.ts`. Make 2.1 pass.

## 3. Backend: a pending check records and broadcasts (TDD; design Decision 3)

- [x] 3.1 Write failing orchestrator tests with fake timers: after a submit, a "pending" poll records the check (the snapshot's `videoRequest.lastCheckedAt` is set) and emits a `state` event; a second pending poll moves `lastCheckedAt` forward; after a restart (`settleVideoInFlight` on a stored in-flight scene, fresh map) the snapshot shows the stored `taskId` with `lastCheckedAt` null until the first poll
- [x] 3.2 Call `recordTaskCheck` and `broadcast` in the pending branch of `pollVideoRequestOnce`, after the ceiling check. Make 3.1 pass.

## 4. Frontend: three rows (TDD; design Decision 5)

- [x] 4.1 Write failing tests for `VideoRequestStatus`: shows "Task id" with the id; "Last checked" as "10 s ago" ten seconds after `lastCheckedAt` (fake timers) and ticking; "Not checked yet" when null; "Gives up at <clock> if unfinished" when `waitEndsAt` is set; no "Gives up at" row when null
- [x] 4.2 Add the fields to `VideoRequestView` in `frontend/src/types.ts` and the rows to `VideoRequestStatus.tsx` (`<code>` for the id, wrapping); style only if the id overflows. Make 4.1 pass.

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.0 Update the sentinel test `stage-diagnostics-surface.test.ts` (design Decision 6): the task id is no longer a leak and must appear only as `videoRequest.taskId`, never in `videoRequest.body`; the upload URL, API key and endpoint remain leaks
- [x] 5.1 Update fixtures that build a `videoRequest` (backend and frontend) with the three new fields; review any test that counts `state` events or broadcasts during pending polls, and change an expectation only where the extra broadcast is the intended behavior, recording each change in the report

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline (the worktree has no local database; every run uses scratch `DB_PATH` and `PROJECTS_ROOT`)
- [x] 6.2 Run the targeted tests from groups 2-4
- [ ] 6.3 Run the full backend suite (scratch paths), the full frontend suite, `npm run lint` and the type checks in both packages
- [ ] 6.4 Verify the post-test state matches the baseline and restore if needed
- [ ] 6.5 Create report `openspec/changes/show-clip-task-liveness/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [ ] 6.6 Mark this group complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the backend on scratch paths with `USE_STUB_VIDEO_PROVIDER=pending` (and short retry delays), and a session whose scene reaches the video stage
- [ ] 7.2 `GET /sessions/<id>`: the generating scene's `videoRequest` carries `taskId`, `waitEndsAt` (= `sentAt` + 2400 s) and `lastCheckedAt`; read it again after 10+ s and confirm `lastCheckedAt` moved forward; subscribe to the event stream (`curl -N`) and confirm a snapshot arrives about every 10 s while the clip is pending
- [ ] 7.3 Restart the backend and read the session before and after the first poll (`lastCheckedAt` null, then set; `taskId` and `waitEndsAt` unchanged)
- [ ] 7.4 Document commands and responses in `reports/YYYY-MM-DD-step-7-manual-endpoint-testing.md`; remove the scratch data

## 8. E2E Testing in the Browser (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 With the same stub setup, open the session, expand the generating scene and confirm the Task id, "Last checked … ago" ticking and resetting every ~10 s, and "Gives up at … if unfinished"
- [ ] 8.2 Confirm the rows disappear when the clip leaves `video-generating` (switch the stub to success or let it fail)
- [ ] 8.3 Screenshot at a narrow width to confirm a long task id wraps inside the details; restore the environment and record in `reports/YYYY-MM-DD-step-8-e2e-testing.md`

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 `docs/api-spec.yml`: add `taskId`, `lastCheckedAt` and `waitEndsAt` to every `videoRequest` schema and a JOS-233 changelog line
- [ ] 9.1a `docs/backend-standards.md` (line "The body is an allow-list"): say that the task id is shown only as `videoRequest.taskId`, never in the body, and that the upload URL and other fields still never reach the page
- [ ] 9.2 `docs/data-model.md`: note that `current_request_id` is shown as the task id once the request is sent, and that the last check is held in memory, not stored
- [ ] 9.3 Check PRD and `readme.md` (Spanish) for a list of the clip request's fields and update them only if they have one; add the "last checked" check to the README troubleshooting row about long clip waits if that row exists
- [ ] 9.4 Run `graphify update .`
- [ ] 9.5 Commit, then push and open the PR into `feature/entrega-3-JAME` linking JOS-233 (on the user's go-ahead)
