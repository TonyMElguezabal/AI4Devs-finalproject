# Step 7 Report - Manual Endpoint Testing

- Date: 2026-10-28
- Change: show-clip-task-liveness (JOS-233)
- Agent: Claude (Sonnet 5.5)

The change adds no endpoint; it adds three fields to `videoRequest` in the session read and the live stream.

Backend from this worktree, `PORT=3233`, scratch `DB_PATH` and `PROJECTS_ROOT`, `USE_STUB_VIDEO_PROVIDER=pending` (every clip stays unfinished). `POST /sessions` needs a content-check key the scratch environment lacks, so the session was inserted into the scratch database after a first boot created the schema: run `01ARZ3NDEKTSV4RRFFQ69G5FB1`, one scene `video-generating`, task `stub-task-0001`, request sent `2026-10-28T05:46:03.000Z` (7 min 44 s before the run). Boot recovery resumed polling the stored task.

| Step | Command | Result |
|---|---|---|
| 1 | `GET /sessions/<id>` at 05:53:58 | `videoRequest.taskId` `stub-task-0001`; `sentAt` `05:46:03.000Z`; `lastCheckedAt` `05:53:57.928Z`; `waitEndsAt` `06:26:03.000Z` (= send + 2400 s) |
| 2 | `curl -N /events?sessionId=<id>` for 26 s | 2 snapshots, with `lastCheckedAt` `05:54:07.933Z` and `05:54:17.936Z`: one per 10 s check |
| 3 | `GET /sessions/<id>` at 05:54:24 | `lastCheckedAt` `05:54:17.936Z` (moved forward by 20 s); `taskId`, `sentAt`, `waitEndsAt` unchanged |
| 4 | kill the backend and boot it again, `GET` 5 s later | `lastCheckedAt` `05:54:32.363Z`, an instant after the new boot and not the pre-restart `05:54:17.936Z` (the check is in memory); `taskId`, `sentAt`, `waitEndsAt` unchanged; the database row unchanged (`video-generating`, `stub-task-0001`) |
| 5 | `GET /sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV` (well-formed, unknown) | 404 |

Note: the window in which `lastCheckedAt` is `null` after a restart is the few milliseconds between boot and the first poll, so a curl cannot catch it; the unit test `shows the stored task and no check after a restart, until the first poll answers` covers it.

Database state: only the scratch database was written. It is deleted after the E2E group.

Outcome: PASS
