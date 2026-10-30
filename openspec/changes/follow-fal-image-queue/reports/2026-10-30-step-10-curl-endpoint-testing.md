# Step 10 Report - Manual endpoint testing with curl

- Date: 2026-10-30
- Change: follow-fal-image-queue
- Agent: Claude
- Scope: tasks 10.1-10.4 done; **10.5 (the real 50-scene run and the fal.ai usage comparison) is not done**: it spends money and waits for the owner's approval of a spend ceiling

## Setup

The backend ran from `backend/` with `node src/server.ts` on port 3199, on scratch `DB_PATH`, `PROJECTS_ROOT` and `SETTINGS_PATH` in the session scratchpad (never `backend/data`), with `ALLOW_TEST_ENDPOINTS=1`, `USE_STUB_IMAGE_PROVIDER=transient-failure`, `USE_STUB_VOICE_PROVIDER=hang`, `USE_STUB_VIDEO_PROVIDER=pending`, `USE_STUB_ASSEMBLY_TOOL=success`, `RETRY_BASE_DELAY_SECONDS=0.2` and `RETRY_CAP_DELAY_SECONDS=0.4`. Creating a session sends the script to OpenAI's moderation endpoint (not stubbed; free).

## 10.1 Boot log

`listening on http://127.0.0.1:3199 (docs at /docs) — image concurrency limit 6, body limit 52428800 bytes`; `GET /health` answered `{"ok":true}`.

## 10.2 A session and its image attempts

- `POST /sessions` with `{"title":"JOS-239 manual","script":"One. Two.","language":"en"}` returned 201.
- Two `POST /internal/test/quick-scene` (`sceneIndex` 1 and 2) returned a `sceneId` each.
- No endpoint creates a scene that is waiting for its image, so the server was stopped and the scratch DB changed with `sqlite3`: both scenes `submitted`, no stored image, an image instruction, bound to `stub-image`, `provider_requests` emptied. Restarting the server made boot recovery launch the image stage.
- Each image attempt took about 5 s (`latency_ms` 5005 and 5009 for attempt 1): a request is first checked one poll interval (5 s) after its submission. Against fal.ai's real image times (about 2 s for `flux/dev`, 80 s or more for the reference model) this adds little; a shorter first check would trim it.

## 10.3 Delayed retries, one sweep, failed session

With the image stub failing every attempt:

| Moment | Scene 1 | Scene 2 | Sweep marker |
| -- | -- | -- | -- |
| 3 s after boot | `image-generating`, attempts 1 | same | not set |
| 10 s | `image-generating`, attempts 2 | same | not set |
| after both cycles | `failed`, attempts 4 | same | `2026-10-30T03:14:35.605Z` |

- `provider_requests` for the image stage: **8 rows per scene, all `transient_failure`** (4 attempts, then the swept cycle of 4).
- `GET /sessions/<id>`: `state: failed`, `failedPhase: scenes`, `failedSceneIndexes: [1, 2]`.
- The server was restarted: still **8 rows per scene**, the same marker, both scenes `failed`, nothing resent.

## 10.4 Settings override

`SETTINGS_PATH` pointing at `{"maxSimultaneousRequests":{"image":2}}` gave `image concurrency limit 2` in the boot log; with the file removed the next start logged `image concurrency limit 6`. `GET /sessions/<unknown id>` answered 404.

## Cleanup

All servers were stopped (no `node src/server.ts` process left). The scratch database and projects folder live in the session scratchpad; `backend/data` was not used.

## Outcome

- Steps 10.1-10.4: PASS
- Step 10.5: not run, pending the owner's spend approval
