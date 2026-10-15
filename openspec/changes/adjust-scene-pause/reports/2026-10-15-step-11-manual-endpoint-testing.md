# Step 11: manual endpoint testing (JOS-190, adjust-scene-pause)

Date: 2026-10-15. The real backend app on `127.0.0.1:3299` with the **real ffmpeg assembly tool**, from a scratch-only harness kept outside the repo. The harness seeds one session from the committed JOS-182 fixture (five clips, the 14.4 s voice-over), with character timestamps written so the scenes' pauses are 1.0, 1.0, 0.8, 1.0 and 1.0 s, and lets its first assembly run for real. Environment cleared (`env -i`), no credentials, scratch `DB_PATH` and `PROJECTS_ROOT`. Nothing reached a provider.

## Baseline

First assembly (real ffmpeg): `final-video.mp4`, 690,280 bytes, H.264 432 frames, audio AAC stream-copied, 14.400 s. `GET /sessions/:id` carried `finalVideo: {version: 1, pendingPauseEdits: false}` and, per scene, `pause {originalSeconds, seconds, minSeconds: 0.2, maxSeconds: 3, limitedBySpeedFactor: false}` with the originals 1, 1, 0.8, 1, 1.

## `POST /sessions/:id/scenes/:sceneId/pause`

| Request | Result |
| --- | --- |
| `{"seconds":0.4}` on scene 2 | 200, the updated scene with `pause.seconds` 0.4 |
| `{"seconds":0.45}` (off the grid) | 422 "The pause after scene 2 can be 0.2 s to 3.0 s, in steps of 0.1 s, or its original 1.0 s." |
| `{"seconds":3.5}` (above the cap) | 422, same sentence |
| `{"seconds":0.1}` (below the floor) | 422, same sentence |
| `{"seconds":"soon"}` | 400 (schema) |
| unknown scene id | 404 `unknown-scene` |
| unknown session id | 404 `session-not-found` |
| `GET` after the valid edit | `finalVideo.pendingPauseEdits` true |

## `POST /sessions/:id/final-video/rebuild`

Edits: scene 2 at 0.4 s (−0.6 s), scene 4 at 1.8 s (+0.8 s).

| Step | Result |
| --- | --- |
| rebuild | 202 `{"ok":true,"held":false}`; version 2 recorded within a second |
| `final-video-2.mp4` | 782,073 bytes; H.264 **438 frames, 14.600 s**; AAC **14.600 s** (14.4 − 0.6 + 0.8) |
| `final-video.mp4` | unchanged: 690,280 bytes, 432 frames, 14.400 s |
| `GET …/download/final-video` | 200, 782,073 bytes, md5 equal to `final-video-2.mp4` (the current version) |
| rebuild again straight after | 409 `nothing-to-rebuild` |
| scene 2 set to 0.6 s, rebuild | 202; `final-video-3.mp4` **444 frames, 14.800 s**, AAC 14.800 s (14.4 − 0.4 + 0.8); folder holds all three files; `finalVideo` `{version: 3, pendingPauseEdits: false}` |
| rebuild with nothing pending | 409 `nothing-to-rebuild` |

`GET /docs/json` documents both routes and the new fields: covered by `scene-pause-api.test.ts`.

## Not exercised here

- **A request during a running rebuild (409 `assembly-in-progress`)**: the fixture clips are tiny, so each rebuild finished in under a second and the request arrived after it. Covered by `final-video-rebuild.test.ts` and `scene-pause-api.test.ts`, which hold the tool open.
- **A failed rebuild** and **a rebuild held by a pause**: unit-tested (`final-video-rebuild.test.ts`); no failing tool was staged on the real server.

## Cleanup

The harness and scratch store were removed; no `backend/data/` exists in the worktree.
