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

## 10.5 Real long run (46 scenes, real keys)

Run by the owner on the application started from this branch (`FFMPEG_PATH` and `FFPROBE_PATH` set to the pinned build with libass), session `01M65GNA0GJ23QRQB072RYZNZF`, script of 46 scenes (the spend ceiling was approved: $3.105 expected for images, clips on RunningHub). Numbers read from `backend/data/skeleton.sqlite`, read-only:

| Stage | Requests | Scenes | Outcome | Average / longest | Highest attempt |
| -- | -- | -- | -- | -- | -- |
| image | 46 | 46 | 46 `success` | 136 s / 213 s | 1 |
| video (clips) | 46 | 46 | 46 `success` | 531 s / 891 s | 1 |

- **Image failures by cause: none.** No retry, no 429, no request hit the 300 s limit or the ceiling; `runs.image_sweep_at` stayed unset (nothing to sweep). First request 04:25:45Z, last (clip) 06:12:53Z.
- All 46 scenes ended `chunk-complete`; the session ended in `final-video` (196,763,063 bytes).
- **fal.ai usage CSV** (exported by the owner, 2026-10-29T04:00Z to 2026-10-30T04:52Z): the 04:00Z bucket bills `bytedance/seedream/v5/pro/edit` for **46 units, $3.105** (46 × $0.0675), exactly the 46 completed requests: no abandoned request was billed. Before the fix, the same kind of run billed 85-93 images per hour for 46-57 scenes (about 72 % of image spend wasted).
- Fal's other lines in the file (flux/dev at 02:00Z and 03:00Z, one stray seedream image at 02:00Z, about $0.40) are not attributable to this run: they predate it (the run started 04:21Z).

### Finding outside this change: assembly failed on a relative `PROJECTS_ROOT`

The first assembly failed 4 times with `No such file or directory` on `data/projects/.assembly-tmp-XXXX/final-video.mp4`. Cause (pre-existing, from JOS-237): the application was started with the default relative `PROJECTS_ROOT` (`data/projects`), and with subtitles `ffmpegAssemblyTool.ts` runs ffmpeg with `cwd` set to its own temp folder, so the relative output path points nowhere. Not related to the image queue: narration, images and clips were kept. Workaround used: restart with an absolute `PROJECTS_ROOT` pointing at the same folder, then `POST /sessions/<id>/assembly/retry`; the video was built on that retry (the backend does not answer HTTP while ffmpeg runs, because the assembly uses `execFileSync`). To be filed as its own ticket.

## Cleanup

All scratch servers of steps 10.1-10.4 were stopped (no stray `node src/server.ts`). The scratch database and projects folder live in the session scratchpad. The real run's data (`backend/data`) and the running application belong to the owner's run and were left in place.

## Outcome

- Steps 10.1-10.4: PASS
- Step 10.5: PASS, 46 images for 46 scenes, 0 failures, fal.ai CSV equal to completed requests
