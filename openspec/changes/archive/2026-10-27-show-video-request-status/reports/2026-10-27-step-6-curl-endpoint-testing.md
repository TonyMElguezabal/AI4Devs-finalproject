# Step 6: manual endpoint testing with curl (show-video-request-status, JOS-200)

Date: 2026-10-26 (local). Target: the real backend (`npm start` code path through `bootstrap.ts`) on `127.0.0.1:3100`, scratch `DB_PATH`, `PROJECTS_ROOT` and `SECRETS_PATH` in the session scratchpad, `USE_STUB_VIDEO_PROVIDER=pending` (a clip never finishes), `ALLOW_TEST_ENDPOINTS=1`. The script moderator was stubbed by a scratch launcher outside the repository, so no provider was called and no key was read.

| Step | Command (abridged) | Response |
|---|---|---|
| 6.1 | `POST /sessions` (title, script, `en`) | `201`, session `01M5X9YTN3YFD7SYQ5DPZWJBEH`, state `submitted` |
| 6.1 | `POST /internal/test/quick-voice-over` (10 s) | `{"ok":true}` |
| 6.1 | `POST /internal/test/quick-scene` (VIDEO instruction, 10 s) | `{"sceneId":"ed0e726a-…"}` |
| 6.1 | `GET /sessions/:id` after 1.5 s | scene `state: video-generating`; `stages.video` = Stub provider, `attempts: 1` (the in-flight request is counted); `videoRequest` = provider, `attempt: 1`, `sentAt: 2026-10-26T23:50:36.298Z`, `estimate: null`, `body: { prompt, duration: 10, resolution: "2K", firstFrame: "scene 1 image" }` |
| 6.1 | the same read searched for `stub.example`, `firstFrameUrl`, `stub-video-req` | 0 matches: the provider's upload URL, its field name and the task id are not in the response |
| 6.1 | backend stopped and started again on the same data; `GET /sessions/:id` | `videoRequest` byte-identical to the read before the restart (same `sentAt`, same body) |

## Data

The throwaway folder in the scratchpad held the test store and project; nothing under the user's real data folder or `backend/data` was created or changed. The scratch folder is not part of the repository.
