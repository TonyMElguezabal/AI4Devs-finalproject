## Why

When a clip request passes the 1200 s video limit, the stage records a transient failure and the retry policy sends a new task to RunningHub. The provider keeps running and billing the first task, so one scene can cost several tasks. On 2026-10-14 the 14 s clips timed out on 8 of 8 uncut attempts, each already billed (JOS-204, from JOS-197 task 9.3). PRD §10.1 asks that recovery does not multiply cost by accident.

## What Changes

- Passing the video limit no longer fails the attempt. The stage keeps polling **the same task**, and no new task is sent for the scene while the provider says it is running.
- A result that arrives after the limit is accepted like any other: the clip is stored and the scene reaches `chunk-complete` with no further attempt.
- A task the provider reports as failed, or no longer holds, follows the automatic retry policy as today, so a new task may be sent.
- **New ceiling:** the wait stops at twice the video limit (2400 s) after the task was sent. At the ceiling the scene fails as **not retryable**, with a reason saying the provider task may still be running. No task is sent automatically, but the User can still press Retry. (Product owner's decision, 2026-10-27.)
- After a restart, polling resumes for the same task, and the ceiling counts from the original send time, not from the boot. Today a restart gives a fresh window.
- A task that finished while the application was down is accepted on boot even if it is past the ceiling.
- PRD v1.24 records the ceiling in §11.3.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `video-stage-time-limit`: past the limit, a still-running clip is no longer failed. The ceiling is new, along with what happens at it.
- `chunk-video-generation`: restart reconciliation no longer counts an attempt over the limit as failed, and it measures the ceiling from the original send.

## Impact

- Backend: `backend/src/orchestrator.ts` (`pollVideoRequestOnce`, `settleVideoInFlight`) and `backend/src/config/providers.ts` (the ceiling, derived from the video limit). Tests go in `backend/test/video-time-limit.test.ts` and the clip restart tests.
- No schema change: the send time is already stored per attempt (`scenes.video_request_sent_at`, JOS-200). No API or frontend change; the scene's request status already shows the elapsed time.
- Docs: PRD v1.24 (§11.3, §16; v1.23 kept as `docs/PRD-v1.23.md`).
- Cost: at most one automatic task per scene while the provider holds it. The concurrency slot stays held while the task runs, as it does today.
- Linear: JOS-204 (`post-MVP`, `Improvement`), related to JOS-197 and JOS-203.
