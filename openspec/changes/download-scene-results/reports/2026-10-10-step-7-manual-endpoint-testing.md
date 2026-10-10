# Step 7 — Manual endpoint testing with curl (JOS-163, download-scene-results)

Real server (`node src/server.ts`), scratch store and projects folder (`DB_PATH=/tmp/jos163-manual/db.sqlite`, `PROJECTS_ROOT=/tmp/jos163-manual/projects`), `ALLOW_TEST_ENDPOINTS=1`.

## Unrelated finding: a pre-attempt assembly failure's `attemptsInCycle: 0` fails response serialization

While setting up the scratch session, `GET /sessions/:id` 500'd with `FST_ERR_RESPONSE_SERIALIZATION`: `session.failure.attemptsInCycle` was `0`, but the response schema requires `>= 1`. Traced to `orchestrator.ts`'s pre-attempt assembly failure path (around line 460: *"no assembly tool configured... cycle: 1, attemptsInCycle: 0, always retryable: false"* — `0` is intentional there, for a failure with no real attempt behind it). This fires whenever assembly is attempted with no tool configured or no stored voice-over, which includes any scratch session whose scenes reach `chunk-complete` without a prior `quick-voice-over` call. Confirmed unrelated to this change (`attemptsInCycle` isn't touched by anything in groups 2-5) by reproducing it with a brand-new session that had never been queried before. Worked around for this manual pass by always calling `quick-voice-over` before `quick-scene` and keeping `USE_STUB_ASSEMBLY_TOOL=success` set. Not fixed here — out of scope for download-scene-results; worth a follow-up ticket (likely `bounded-retry-policy`/`retry-final-assembly`'s territory).

## 7.1 — Health check

`GET /health` → `{"ok":true}`.

## 7.2 — Image downloads while video-generating; clip 409

Session created, `quick-voice-over` (10s), two scenes via `quick-scene` → both `video-generating` (video stub mode `pending`). `curl -D -` the image download of scene 1:
```
HTTP/1.1 200 OK
content-disposition: attachment; filename="scene-1-image.png"
content-type: image/png
```
`cmp` against the stored file: byte-identical. The clip download of the same scene: `409`.

## 7.3 — Restart with `success-bytes`; clips complete

Server restarted (`USE_STUB_VIDEO_PROVIDER=success-bytes`, `USE_STUB_ASSEMBLY_TOOL=success`, same `DB_PATH`/`PROJECTS_ROOT`). `GET /sessions/:id` now reports `state: "chunks-processing"` → both scenes `chunk-complete`, each with `downloads: { imageUrl, clipUrl }` present. Downloaded the clip: `200`, `content-type: video/mp4`, `filename="scene-1-clip.mp4"`, `cmp` against `scene-1.mp4` on disk: byte-identical.

## 7.4 — Rejected kinds and cross-session scoping

- `GET .../download/voice-over` → `400`.
- `GET .../download/timestamps` → `400`.
- The first session's scene requested through a second, unrelated session's address → `404`.

## 7.5 — Cleanup

Scratch store and folder removed. Confirmed the default store (`backend/data/`) does not exist in this worktree — untouched throughout.
