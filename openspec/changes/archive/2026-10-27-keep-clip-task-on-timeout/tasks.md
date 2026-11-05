## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-204-keep-clip-task-on-timeout` created from `origin/feature/entrega-3-JAME` with `--no-track`, in the worktree `../AI4Devs-jos-204` (done by `/opsx:propose`)
- [x] 0.2 `git fetch`; confirm it is the current branch of that worktree, has no upstream, and `origin/feature/entrega-3-JAME` has not moved past its base (merge it in if it has)

## 1. Gate

- [x] 1.1 Confirm design.md § Context still holds: the limit check sits before the poll in `pollVideoRequestOnce`; `settleVideoInFlight` resumes with `Date.now()`; `recordVideoRequestSent` stores `video_request_sent_at` for every submitted clip; the attempt-timeout watcher does not touch clips.
- [x] 1.2 `cd backend && npm ci`; run `video-time-limit.test.ts` and the clip restart tests on scratch `DB_PATH` and `PROJECTS_ROOT` to record the baseline.

## 2. Backend: the ceiling value (TDD; design Decision 2)

- [x] 2.1 Write failing tests in `providerConfig.test.ts`: `videoTaskCeilingMs()` is 2,400,000 ms and `undefined` when the video stage has no limit; the PRD §11.3 per-phase row carries `Clip wait ceiling 2400s`, equal to the configured value (spec: Configuration and PRD agree).
- [x] 2.2 Add `videoTaskCeilingMs()` to `backend/src/config/providers.ts`. Make the unit part of 2.1 pass; the PRD part passes in 6.2.

## 3. Backend: keep polling past the limit (TDD; design Decisions 1, 2)

- [x] 3.1 Change the scenario "A clip that exceeds the limit" in `video-time-limit.test.ts` to expect the same request still followed at 1201 s (failing now).
- [x] 3.2 Write failing tests there, with the existing fake-timer harness and a stub whose answers can be switched per poll:
  - at 1300 s the scene is still `video-generating` with 1 attempt, the stub saw one submit, and no failed request is recorded (AC1);
  - success at 1500 s: `chunk-complete`, 1 attempt, 1 submit (AC2);
  - `failed_transient` and `not_found` past the limit each record one transient failure and the retry rule sends a second submit (AC3);
  - at 2401 s the scene is failed, not retryable, the reason names 2400 s and says the task may still be running, 1 submit, and the slot is released;
  - a manual retry after that sends a second submit;
  - with no limit, still polled at fifty minutes (existing test, kept).
- [x] 3.3 In `pollVideoRequestOnce`, remove the pre-poll limit check and add the ceiling check on a `pending` answer. Make 3.1 and 3.2 pass.

## 4. Backend: restarts count from the original send (TDD; design Decision 3)

- [x] 4.1 Write failing tests with the existing restart helpers:
  - a scene whose clip was sent 1300 s before boot and is still pending resumes polling the same task with no new submit, and fails at 2400 s after the original send, not 2400 s after boot (AC4);
  - a scene sent 3000 s before boot whose task succeeded is `chunk-complete` on boot;
  - a scene sent 3000 s before boot whose task is still pending fails at the first poll;
  - a scene with no stored send time is measured from boot.
- [x] 4.2 In `settleVideoInFlight`, pass the stored `videoRequestSentAt` (falling back to `Date.now()`). Make 4.1 pass.

## 5. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Run `video-stage.test.ts`, `restart-concurrency.test.ts`, `video-request-status.test.ts` and the telemetry hooks tests; update only assertions that expected a transient failure or a new submit at the limit, or a latency measured from boot.

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline of the local database (none in this worktree: record it), and use scratch `DB_PATH` and `PROJECTS_ROOT` for every run
- [x] 6.2 Update `docs/PRD.md` §11.3's per-phase row to append `Clip wait ceiling 2400s` (with group 9), so 2.1's PRD assertion passes; run the targeted tests from groups 2 to 4
- [x] 6.3 Run the full backend suite, lint and the type check
- [x] 6.4 Verify no shared database or project folder was touched
- [x] 6.5 Create report `openspec/changes/keep-clip-task-on-timeout/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [x] 6.6 Mark this group complete only after tests pass and the report exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the backend on a scratch database with the stub video provider in `pending` mode and the video limit lowered for the check (`SETTINGS_DEFAULTS_PATH` with a 20 s video limit)
- [x] 7.2 Bring a session to `video-generating` (content-check key permitting; otherwise insert the run and scene into the scratch database); `GET /sessions/{id}` past the limit shows the scene still `video-generating` with one request; past the ceiling it shows the scene failed with the ceiling reason
- [x] 7.3 Restart the backend while a clip is past the limit; confirm the same request id is polled (server log) and no new submit is made
- [x] 7.4 Document commands and responses in `reports/YYYY-MM-DD-step-7-manual-endpoint-testing.md`; stop the servers and delete the scratch directory (the directory is deleted after step 8)

## 8. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 No frontend change. Open the session page during 7.2 and confirm the failed scene shows the ceiling reason and offers Retry; record in `reports/YYYY-MM-DD-step-8-e2e-testing.md`

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 `docs/PRD.md` v1.24 (keep v1.23 as `docs/PRD-v1.23.md`): §11.3 row with the clip wait ceiling and its reason; §10.1 note that a clip past its limit keeps its task; status line and §16 entry
- [x] 9.2 Confirm `docs/api-spec.yml` and `docs/data-model.md` need no schema or API change; update the `current_request_id` note in `docs/data-model.md`, which described the old restart rule (checked: no API or schema change; the scene's `errorCause` is free text)
- [x] 9.3 Run `graphify update .`
- [x] 9.4 Commit (done), then push and open the PR linking JOS-204 (PR #127 merged 2026-10-27); archived 2026-10-27
