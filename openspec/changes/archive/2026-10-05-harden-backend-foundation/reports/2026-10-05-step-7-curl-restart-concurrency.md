# Step 7: curl restart check (JOS-186, harden-backend-foundation)

Date: 2026-10-05. Branch `feature/jos-186-harden-backend-foundation`, HEAD `55f21ea`. Video cap 3 (the provisional value).

All runs used a scratch store and project folder (`DB_PATH` and `PROJECTS_ROOT` in a scratchpad directory), port 3186, `ALLOW_TEST_ENDPOINTS=1` and `USE_STUB_VOICE_PROVIDER=hang` (so session creation cannot reach a real voice provider). Server start: `USE_STUB_VIDEO_PROVIDER=<mode> node src/server.ts`. The default store of this worktree was snapshotted before (7.1) and after (7.6) and was identical.

## What the first two attempts found

Two defects surfaced here that the unit suites had not shown, and both were fixed before the run below.

1. **Waiting launches were lost on restart.** With the occupy fix alone, scenes 1 to 3 resumed and settled with one clip each. Scenes 4, 5 and 6 had been queued behind the cap, a queue that lives only in memory, so after the restart they stayed `image-complete` indefinitely while the stage had free capacity. Fix: `reconcileOnBoot` relaunches held work for admitted sessions after counting sent requests (spec requirement "Waiting scene work resumes at boot", design Decision 2, commit `762261b`).
2. **The stub video provider crashed the server after a restart.** Its request ids were numbered from 1 in each process, so after a restart a new request collided with `provider_requests.id` rows from before it (`UNIQUE constraint failed: provider_requests.id`, unhandled, process exit). The real adapter's task ids are unique. Fix: stub ids are unique across restarts (task 3.5a, commit `55f21ea`).

## 7.1 Start

`USE_STUB_VIDEO_PROVIDER=pending`. Boot log:

```
{"level":30,"time":1791224667844,"pid":1780,"hostname":"192.168.1.13","resumed":0,"recordedFailedAttempt":0,"stillPending":0,"concurrency":{"image":{"inFlight":0,"limit":200},"video":{"inFlight":0,"limit":3}},"msg":"boot reconciliation complete"}
```

## 7.2 Session and five scenes

`POST /sessions` with `{"title":"JOS-186 restart check 3","script":"One. Two. Three. Four. Five.","language":"en"}` returned 201. Then five `POST /internal/test/quick-scene` (`sceneIndex` 1 to 5, `requestedDurationSeconds` 8). `GET /sessions/:id`:

```
session: chunks-processing | 1=video-generating(a1) 2=video-generating(a1) 3=video-generating(a1) 4=image-complete(a0) 5=image-complete(a0)
```

Three clips are requested (the cap) and two wait.

## 7.3 kill -9 and restart, same environment

`pkill -9 -f src/server.ts`, then the same start command. Boot log right after reconciliation, before any new launch:

```
{"level":30,"time":1791224673075,"pid":1800,"hostname":"192.168.1.13","resumed":0,"recordedFailedAttempt":0,"stillPending":3,"concurrency":{"image":{"inFlight":0,"limit":200},"video":{"inFlight":3,"limit":3}},"msg":"boot reconciliation complete"}
```

Video `inFlight` is 3 of 3. The three pending clips hold their slots and poll again. State after the restart: scenes 1 to 3 `video-generating`, scenes 4 and 5 `image-complete(a0)` (their queue entries were rebuilt, still behind the cap). A sixth scene added with `POST /internal/test/quick-scene` (`sceneIndex` 6) also waits: `6=image-complete(a0)`, no clip requested.

## 7.4 Second restart, pending clips settle

`kill -9`, restart with `USE_STUB_VIDEO_PROVIDER=success-bytes`. Boot log:

```
{"level":30,"time":1791224678360,"pid":1813,"hostname":"192.168.1.13","resumed":0,"recordedFailedAttempt":0,"stillPending":3,"concurrency":{"image":{"inFlight":0,"limit":200},"video":{"inFlight":3,"limit":3}},"msg":"boot reconciliation complete"}
```

Within one poll round: `1=chunk-complete(a1) 2=chunk-complete(a1) 3=chunk-complete(a1) 4=chunk-complete(a1) 5=chunk-complete(a1) 6=chunk-complete(a1)`. The session moved on to `final-video-generating`, and the server stayed up. Database evidence (scratch store):

| Scene | Status | Attempts | Clips recorded | Video requests | Resolved |
| --- | --- | --- | --- | --- | --- |
| 1 to 6 (each) | chunk-complete | 1 | 1 | 1 | 1 |

Six `.mp4` files on disk, one per scene. Every waiting launch ran exactly once.

## 7.5 Error cases

- `GET /sessions/01ZZZZZZZZZZZZZZZZZZZZZZZZ` returned `HTTP/1.1 404 Not Found`. `POST /internal/test/quick-scene` with an unknown session id returned `{"error":"session not found"} HTTP 404`.
- `POST /internal/provider-callback/<unknown uuid>` returned `{"applied":false,"note":"unknown request id"} HTTP 200`.
- Repeated delivery has no visible effect on a scene: not shown over HTTP for the video stage, because video requests are polled and are not delivered through the callback route (which also accepts only a UUID). It is covered by `test/write-capacity.test.ts` (every request delivered twice, 300 duplicates ignored) and the `orchestrator` duplicate-delivery cases.

## 7.6 Clean-up

The scratch store and project folder were deleted. A snapshot of the default store of this worktree is identical to the one taken before the run (row counts, migrations, triggers, project folders).

## 8.1 Frontend

Not applicable: this change touches no frontend code and no API contract. The SSE reconnect resync carry-forward from JOS-179 is already in `frontend/src/api/useLiveSession.ts` (verified during the proposal).
