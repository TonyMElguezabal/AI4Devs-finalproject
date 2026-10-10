# Step 6 — Manual endpoint testing with curl (JOS-162, keep-project-files-locally)

Real server (`node src/server.ts`), scratch store and scratch projects folder (`DB_PATH=/tmp/jos162-manual/db.sqlite`, `PROJECTS_ROOT=/tmp/jos162-manual/projects`), `ALLOW_TEST_ENDPOINTS=1`. `USE_STUB_VIDEO_PROVIDER` and `USE_STUB_ASSEMBLY_TOOL` set as noted per run (no `USE_STUB_VOICE_PROVIDER`: the real ElevenLabs/RunningHub providers are not configured with credentials in this checkout, so the automatic voice-over/image stages fail on their own — unrelated to this change; `quick-voice-over`/`quick-scene` bypass them, per task 6.3's own intent).

## 6.1 — Health check

`GET /health` → `{"ok":true}`.

## 6.2 — Same-title counter

`POST /sessions` twice with title "Manual Test Session" within the same minute. Scratch projects folder:
```
Manual Test Session 2026-10-10 14-24
Manual Test Session 2026-10-10 14-24 (2)
```
Each has its own `script.txt`.

## 6.3 — One session to final-video

Session 1, through `quick-voice-over` (duration 10s) then `quick-scene` (video stage via `USE_STUB_VIDEO_PROVIDER=success-bytes`, assembly via `USE_STUB_ASSEMBLY_TOOL=success`): `GET /sessions/:id` reports `state: "final-video"`. Its folder:
```
scene-1.mp4
scene-1.png
script.txt
voice-over.mp3
```
all present, none in the other session's folder.

**Note on `final-video.mp4`:** `final_video_path` is recorded in the store and `GET /sessions/:id` reports `finalVideoUrl`, but `GET .../download/final-video` returns 404 and no `final-video.mp4` file exists on disk. This is the same pre-existing behavior the automated suite documents (`stubAssemblyTool.ts`'s bare `createStubAssemblyTool` reports success without writing bytes to `outputPath`; `assembly-failure-recovery.test.ts` wraps it in a `fileWritingStub` specifically to get a real file). `quick-voice-over` also writes an empty `voice-over.mp3`, so the real `ffmpeg` tool (installed on this machine) isn't usable here either. The "final video physically on disk" claim for AC1 is proven by the unit test (`test/project-files-ac-pinning.test.ts`, which uses a file-writing stub), not by this manual pass.

## 6.4 — Restart, re-read both sessions

Server killed and restarted against the same `DB_PATH`/`PROJECTS_ROOT`. `GET /sessions/:id` for both:
- Session 1: still `state: "final-video"`, same `finalVideoUrl`.
- Session 2: `state: "failed"` (voice-over phase — no voice-provider credentials in this checkout; expected, unrelated to this change).

Both project folders' contents were byte-identical to before the restart (`script.txt` for session 2; `scene-1.mp4`, `scene-1.png`, `script.txt`, `voice-over.mp3` for session 1).

## Scope-expansion check — corrected-instructions.json over HTTP

A third session was created, given a scene via `quick-scene` with the video stage forced to fail (`USE_STUB_VIDEO_PROVIDER=not-retryable-failure`), then corrected through the real route (`POST /sessions/:sessionId/scenes/:sceneId/correct`). Result: `{"ok":true}`, and the project folder gained:
```json
{"scenes":{"<sceneId>":{"videoInstruction":"a corrected river scene, manual curl test","correctedAt":"2026-10-10T20:26:13.752Z"}}}
```
in `corrected-instructions.json` — confirming design Decision 5 end to end over the real HTTP route, not just at the unit level.

## 6.5 — Cleanup

Scratch store and folder removed (`rm -rf /tmp/jos162-manual`). Confirmed the default store (`backend/data/`) does not exist in this worktree — untouched throughout.
