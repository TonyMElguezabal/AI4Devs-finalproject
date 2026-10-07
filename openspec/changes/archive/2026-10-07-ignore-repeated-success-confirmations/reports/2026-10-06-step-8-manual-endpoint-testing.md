# Step 8 Report - Manual Endpoint Testing with curl

- Date: 2026-10-06
- Change: ignore-repeated-success-confirmations (JOS-161)
- Agent: Claude Opus 5

## Setup

Real server from this worktree on a scratch store and projects folder in the session scratchpad, port 3198, with `USE_STUB_VIDEO_PROVIDER=success-bytes`, `USE_STUB_ASSEMBLY_TOOL=slow-success` (`ASSEMBLY_STUB_DELAY_MS=15000`), `USE_STUB_VOICE_PROVIDER=success`, `ALLOW_TEST_ENDPOINTS=1`, `STAGE_CONCURRENCY_LIMIT=1`. `GET /health` returned `{"ok":true}`.

## Steps

1. ✅ Session "JOS-161 curl check" created, two clips completed through `quick-scene` → session read `final-video-generating` while the 15-second assembly ran.
2. ✅ `POST /sessions/:id/pause` then `POST /sessions/:id/continue` during the assembly → 200 both; the read showed `paused: false` and `held: []`. The running assembly was not interrupted.
3. ✅ After the wait, the read showed `final-video` with `finalVideoUrl`. The store has exactly one assembly attempt (`1: success`) and `final_video_path = final-video.mp4`.
4. ✅ 8.3 `POST /sessions/:id/continue` after the final video exists → 200; still one attempt; state `final-video`; `final-video.mp4` unchanged.
5. 🔍 Six concurrent `POST /sessions/:id/continue` while a second session's assembly ran (a session not yet at `final-video`) → all six answered 200; the store has exactly one attempt (`1: success`). The in-flight guard holds under concurrency.
6. ✅ Scratch server stopped. The default store was read before and after: unchanged (2 runs, 0 scenes, 13 migrations).

## Findings

- ⚠️ **`GET /sessions/:id/download/final-video` answers 404 "final video file not found on disk"** for sessions finished with `USE_STUB_ASSEMBLY_TOOL` set to `success` or `slow-success`. The stub never writes `final-video.mp4`, but it records the path. The route refuses correctly. The real ffmpeg tool, or a test that writes the file, is needed to exercise the download. This matters for JOS-164's curl step, which needs real bytes.
- ⚠️ **`POST /internal/test/quick-voice-over` answers 500** ("voice-over.mp3 already exists and is written once") when the stub voice provider has already written the voice-over. The endpoint writes the artefact before its own 409 check. This is pre-existing and outside this change. Not fixed here.
- 🔍 `POST /internal/provider-callback/no-such-request` → 400 "Invalid uuid". A non-UUID id never reaches the store, so the duplicate-delivery path for images is not reachable over HTTP with a made-up id. The unit tests drive it directly.
