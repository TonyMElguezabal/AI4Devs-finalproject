# Step 7 Report - Manual Endpoint Testing

- Date: 2026-10-27/28 (UTC)
- Change: keep-clip-task-on-timeout (JOS-204)
- Agent: Claude

Setup: the real backend from this worktree (`node src/server.ts`, port 3204) on a scratch `DB_PATH`/`PROJECTS_ROOT`, with `USE_STUB_VIDEO_PROVIDER=pending` (every clip task stays unfinished) and `SETTINGS_DEFAULTS_PATH` pointing at a copy of the default settings whose video limit is **20 s** (so the ceiling is 40 s); the video poll interval is its default, 10 s. `POST /sessions` needs the content-check key, so a run and an image-complete scene were seeded into the scratch database with a script (the scene is launched by boot recovery, the same path a real session takes after its image).

## Past the limit (AC1)
Scene sent at 00:00:17Z. Sampled every 10 s from `sqlite3`:

| Age of the task | Scene | Request id | Video requests recorded |
|---|---|---|---|
| 20 s (at the limit) | `video-generating`, attempts 1 | `stub-video-req-59a8cc0…` | none |
| 30 s (past the limit) | `video-generating`, attempts 1 | same id | none (no failure, no new submit) |
| 40 s (ceiling) | `failed`, attempts 1 | cleared | 1 `not_retryable_failure` |

`last_error`: "the clip task did not finish within 40 s (twice the 20 s phase limit); the provider task may still be running and billed. Retry to send a new task." `GET /sessions/{id}` shows the scene as `failed` with `affectedStage: video`, the same `errorCause`, and 1 attempt. No second task was ever submitted (the stub's submit log has no second id).

## Manual retry after the ceiling
`POST /sessions/{id}/scenes/{sceneId}/retry` answered `200 {"ok":true}`; the scene went to `video-generating` with a **new** request id (`stub-video-req-4570acab…`) and a new send time (00:01:40.223Z).

## Restart while the task is past its limit (AC4)
The server was stopped when the new task was 26 s old (past the 20 s limit) and started again:

| Moment | Scene |
|---|---|
| before the restart | `stub-video-req-4570acab…`, attempts 1 |
| after the restart | `video-generating`, **the same** request id, attempts 1 (no new task) |
| task age 35, 39, 43 s | still `video-generating`, attempts 1 |
| task age 47.6 s | `failed`, attempts 1 |

The failure was recorded with a latency of **47,493 ms from the original send**; had the wait restarted at the boot it would have run to about 77 s. The 7 s past the 40 s ceiling is the 10 s poll interval (the first poll after the boot was at ~37 s, the next at ~47 s).

## Database State Verification
- Only the scratch database was written; the shared local database was not opened.
- Restored: both servers stopped, the scratch directory deleted after step 8.

## Outcome
- Step 7 status: PASS
