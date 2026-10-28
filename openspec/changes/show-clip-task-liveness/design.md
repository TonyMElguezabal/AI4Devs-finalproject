## Context

A clip attempt (`runVideoAttempt` in `backend/src/orchestrator.ts`) submits the task, writes the provider's task id into `scenes.current_request_id`, records the send time and body (`recordVideoRequestSent`), broadcasts, and then `pollVideoRequestOnce` asks the provider about the task every `videoPollIntervalMs` (10 s). A "pending" answer only re-arms the timer: nothing is recorded and nothing is broadcast. Any other answer ends the attempt (success, failure, retry) and broadcasts. At the ceiling (`videoTaskCeilingMs()`, 2 × the video limit = 2400 s, JOS-204) a "pending" answer fails the scene. On boot, `settleVideoInFlight` resumes polling the stored task, counting from the stored send time.

`videoRequestView(scene)` (`backend/src/videoRequestStatus.ts`) derives the page's `videoRequest` from the scene row on every read, only while `status` is `video-generating` and a request has been sent. The page (`VideoRequestStatus.tsx`) shows it and ticks the elapsed time with a one-second browser clock.

## Goals / Non-Goals

**Goals:**
- The User can tell a slow clip from an abandoned one: they see the task id, when Vid4You last heard "still running", and when it will give up.

**Non-Goals:**
- Changing how often the task is checked, the ceiling, or what happens at it (JOS-204).
- A history of checks, or showing the provider's own progress percentage.
- Image requests (they are a single call, not a polled task).

## Decisions

### 1. The task id comes from `current_request_id`, read only once the request is sent
`markVideoGenerating` first writes a local UUID into `current_request_id`. The submit then replaces it with the provider's `taskId`, before `recordVideoRequestSent`. `videoRequestView` already returns nothing until `video_request_sent_at` is set, so whenever the view exists, the column holds the provider's id. No new column.
- Alternative: a separate `video_task_id` column. Rejected: it would duplicate a value that the restart path already relies on.

### 2. The last check lives in memory, keyed by scene and task
`recordTaskCheck(sceneId, taskId, at)` stores `{ taskId, at }` in a module-level `Map` in `videoRequestStatus.ts`. `videoRequestView` returns `lastCheckedAt` only when the stored `taskId` equals the scene's current task id. A retry's new task therefore reads as "not checked yet" with no explicit clearing, and so does a stale entry after a restart (the map starts empty).
- Why memory: the value means "this running application is following the task". After a restart, "not checked yet" is the truthful answer until the first check, which comes within 10 s. Persisting it would mean a write every 10 s per clip and a migration, and the restored value would claim a check this process never made.
- Ceiling: one small entry per scene that ever had a clip polled in this process. It is not deleted on completion, because the task-id match already hides it. That is bounded by the session's scenes and is negligible. `resetTaskChecksForTests()` clears it between tests.
- Alternative: clear on every terminal path of `pollVideoRequestOnce`. Rejected: there are six such paths, and missing one would show a stale check.

### 3. A "still running" answer broadcasts
`pollVideoRequestOnce`'s pending branch, below the ceiling check, records the check and calls `broadcast(runId)` before re-arming the timer. Cost: one snapshot per in-flight clip every 10 s. With the shipped video limit of 3 that is at most 0.3 snapshots per second, against the existing broadcasts on every state change.
- Alternative: no broadcast, and let the page estimate "next check in". Rejected: the point is to show a check *did* happen. A guessed value would look alive even if polling had stopped.

### 4. `waitEndsAt` is derived, not stored
`waitEndsAt = sentAt + videoTaskCeilingMs()` (null when the video stage has no limit). It uses the same stored send time that `settleVideoInFlight` passes to the poll loop after a restart, so the shown time is the one the code enforces. The scene actually fails at the first check after that instant, at most one poll interval (10 s) later. The label says "Gives up at", not "fails at exactly".

### 5. The page: three rows, the existing clock
In `VideoRequestStatus.tsx`, after Estimate: "Task id" (the id in `<code>`), "Last checked" (`formatElapsed(now − lastCheckedAt)` + " ago", or "Not checked yet"), and "Gives up at" (`formatClock(waitEndsAt)` + " if unfinished", the row omitted when null). The existing one-second interval already re-renders the block, so "ago" ticks without extra timers.

### 6. The task id is not a secret
A RunningHub task id can only be queried with the account's API key, and it does not reveal the key or the upload URL. The allow-list that keeps the request body private (`allowListVideoRequest`) is unchanged. Only the id is added.

## Risks / Trade-offs

- [More snapshots on the stream] → bounded by the video concurrency limit (3), at one per 10 s each. Snapshots are already sent on every scene change.
- [A provider whose task id is long] → the id renders in `<code>` with `overflow-wrap: anywhere`, so it wraps inside the details.
- ["Gives up at" can be up to 10 s early] → stated in Decision 4. The wording avoids claiming an exact instant.
- [Tests that count broadcasts on pending polls] → they will see more. Each such test is reviewed in the "existing tests" task, not loosened.

## Migration Plan

No schema change. Backend and frontend ship together in the next build. Rollback is reverting the commit.

## Open Questions

None.
