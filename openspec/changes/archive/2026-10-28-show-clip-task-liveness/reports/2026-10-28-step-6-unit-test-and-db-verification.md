# Step 6 Report - Unit Tests and Database Verification

- Date: 2026-10-28
- Change: show-clip-task-liveness (JOS-233)
- Agent: Claude (Sonnet 5.5)

## Commands Executed
- `cd backend && DB_PATH=<scratch>/t.db PROJECTS_ROOT=<scratch>/proj npx vitest run test/clip-task-liveness.test.ts` (new; seen failing first: `resetTaskChecksForTests is not a function`)
- `cd frontend && npx vitest run test/video-request-status.test.tsx` (4 new tests seen failing first, then passing)
- `cd backend && DB_PATH=<scratch>/t.db PROJECTS_ROOT=<scratch>/proj npx vitest run` (full backend suite)
- `cd frontend && npx vitest run`, `npm run lint`, `npx tsc --noEmit` in both packages

## Unit Test Results
- Targeted: backend `clip-task-liveness.test.ts` 8 passed (view fields, the retry and restart cases, the live broadcast per "still running" answer); frontend `video-request-status.test.tsx` 15 passed (4 new + the JOS-200 ones, 1 new that passes by design because the row is absent when `waitEndsAt` is null).
- Full backend suite: 2432 passed, 5 skipped, 0 failed (181 files, 4 skipped), 91 s.
- Full frontend suite: 418 passed, 0 failed (14 files).
- `tsc --noEmit`: clean in both packages. `eslint`: 0 errors, 7 warnings, all in files this change does not touch (the same 7 on the base commit).

## Existing tests changed (task 5.0 / 5.1)
- `backend/test/stage-diagnostics-surface.test.ts` (the sentinel test): the task id is no longer listed as a leak; the upload URL, API key and endpoint still are. A new test asserts the id appears as `videoRequest.taskId` and never in `videoRequest.body`. This follows design Decision 6, which reverses the JOS-200 rule on purpose; `docs/backend-standards.md` is updated to match (group 9).
- `backend/test/video-request-status.test.ts` "carries the request while the clip generates": the whole-view `toEqual` gains `taskId`, `lastCheckedAt: null` and `waitEndsAt` (send time + 2400 s).
- `backend/test/restartHelpers.ts`: `simulateRestart` also clears the in-memory task checks, as a new process would.
- `frontend/test/video-request-status.test.tsx`: the `request()` fixture carries the three new fields.
- No test that counts broadcasts or `state` events needed a change: none failed.

## Database State Verification
- Pre-test baseline: this worktree has no `backend/data/` directory and every run used a scratch `DB_PATH` and `PROJECTS_ROOT`, so no shared or local database was opened. The change adds no column or migration.
- Post-test validation: `backend/data/` still absent; only the scratch directory was written.
- State restored: Yes (nothing to restore).

## Outcome
- Step 6 status: PASS
- Blocking issues: none
