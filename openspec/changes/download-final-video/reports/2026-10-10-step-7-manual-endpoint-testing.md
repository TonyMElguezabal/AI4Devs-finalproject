# Step 7 — Manual endpoint testing with curl (JOS-164, download-final-video)

Real server (`node src/server.ts`), scratch store and scratch projects folder (`DB_PATH=/tmp/jos164-manual/db.sqlite`, `PROJECTS_ROOT=/tmp/jos164-manual/projects`), `ALLOW_TEST_ENDPOINTS=1`, `USE_STUB_VIDEO_PROVIDER=success-bytes`. `quick-voice-over` called before `quick-scene` in every run — without it, assembly's pre-attempt failure hits the unrelated `attemptsInCycle: 0` schema bug already documented in `download-scene-results` (JOS-163)'s step 7 report.

## Note: the bare stub assembly tool never writes real bytes

`USE_STUB_ASSEMBLY_TOOL=success` (and `slow-success`) report success without writing anything to `outputPath` — the same `stubAssemblyTool.ts` limitation JOS-163's manual pass found (and the unit suite works around with a `fileWritingAssemblyTool` wrapper, same as `test/final-video-download.test.ts` here). A session can reach `final-video` with `final_video_path` recorded while no `final-video.mp4` actually exists on disk, so `GET .../download/final-video` legitimately 404s. To verify the route's real streaming/header behavior (task 7.3), a file was placed directly in the project folder at the recorded path — exactly what a real `ffmpeg` run would have produced — without touching any code; this exercises the route, not the stub assembly tool.

## 7.1 — Health check

`GET /health` → `{"ok":true}`.

## 7.2 — 409 before assembly finishes

Session created, `quick-voice-over`, one scene via `quick-scene` (`USE_STUB_ASSEMBLY_TOOL=slow-success`, `ASSEMBLY_STUB_DELAY_MS=4000` — assembly runs for 4s before reporting success, giving a real pending window). While `state: "final-video-generating"`:
```
HTTP/1.1 409 Conflict
{"ok":false,"reason":"final video is not yet available"}
```

## 7.3 — 200 with headers and byte-identical content

After assembly completed (`state: "final-video"`) and the real file was placed at the recorded path:
```
HTTP/1.1 200 OK
content-disposition: attachment; filename="final-video.mp4"
content-length: 41
content-type: video/mp4
```
`cmp` against the project folder's own `final-video.mp4`: byte-identical.

## 7.4 — 404 cases

- Unknown session id → `404`.
- The same session, with its `final-video.mp4` deleted from the project folder → `404`.

## 7.5 — Published contract

`GET /docs/json`'s `responses.200` for the final-video route:
```json
{
  "description": "The assembled MP4 file (video/mp4)",
  "content": { "video/mp4": { "schema": { "type": "string", "format": "binary" } } }
}
```
`video/mp4`, not `application/json`, confirming the fix against a real running server.

## 7.6 — Cleanup

Server killed, scratch store and folder removed (`rm -rf /tmp/jos164-manual`). Confirmed the default store (`backend/data/`) does not exist in this worktree — untouched throughout.
