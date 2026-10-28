## Why

While a clip is generating, the scene details show the request, its send time, the elapsed time and an estimate (JOS-200), but nothing that tells the User the provider task is still being followed. On a long wait (seen on 2026-10-27: scene 10 at 7 min 44 s) the User cannot tell a slow clip from one that will never arrive. They cannot match the task on the provider's dashboard either, because the task id is not shown (JOS-233). Vid4You does check the task every 10 s and ends the wait at the 2400 s ceiling (JOS-204), but none of that is visible.

## What Changes

- The clip request view (`videoRequest` in the scene representation and the live snapshot) gains three fields:
  - `taskId`: the provider's task id for the current attempt (already stored as `scenes.current_request_id`), so the User can find the task on the provider's dashboard.
  - `lastCheckedAt`: the instant of the most recent "still running" answer from the provider, or null until the first check since the application started.
  - `waitEndsAt`: the instant the clip wait ceiling will fail the scene if the task is still unfinished (send time + `videoTaskCeilingMs()`), or null when the video stage has no limit.
- Every "still running" check broadcasts the session snapshot, so "last checked" refreshes live.
- The expanded scene details show three new rows: Task id, Last checked ("12 s ago", ticking with the existing browser clock) and "Gives up at <time> if unfinished".

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `video-request-status`: the clip request shown while a clip is generating also carries the task id, the last check and the wait's end; the page shows them.

## Impact

- Backend: `backend/src/videoRequestStatus.ts` (view fields, in-memory last-check record), `backend/src/orchestrator.ts` (record the check and broadcast on a pending poll; clear on attempt end), `backend/src/types.ts`, `backend/src/routes.ts` (response schema).
- Frontend: `frontend/src/types.ts`, `frontend/src/components/VideoRequestStatus.tsx`, `frontend/src/videoRequestFormat.ts` if a formatter is needed.
- Tests: backend video request status tests, the frontend `VideoRequestStatus` tests.
- Docs: `docs/api-spec.yml` (three optional-shape fields and a changelog line), `docs/data-model.md` (note that `current_request_id` is shown as the task id and that the last check is not stored), PRD only if it lists the clip request fields.
- No migration and no new column. One extra snapshot broadcast per in-flight clip every 10 s (at most 3 at once with the shipped video limit).
