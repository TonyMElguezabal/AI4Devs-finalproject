# Step 9: curl endpoint testing (JOS-166, see-provider-and-attempts)

Date: 2026-10-05. Branch `feature/jos-166-see-provider-and-attempts`, HEAD `97c0db6`.

All runs used a scratch store and project folder (`DB_PATH` and `PROJECTS_ROOT` in a scratchpad directory), port 3166, `ALLOW_TEST_ENDPOINTS=1`, `USE_STUB_VOICE_PROVIDER=hang` (so session creation cannot reach a real voice provider) and `USE_STUB_VIDEO_PROVIDER=success`. Server start: `node src/server.ts`.

## 9.1 Start

`GET /health` returned `{"ok":true} HTTP 200`. Boot log: `boot reconciliation complete`, `scheduled retries re-armed`, `Server listening at http://127.0.0.1:3166`.

## 9.2 A scene through the clip stage, then the image stage

`POST /sessions` returned 201, then `POST /internal/test/quick-scene` (`sceneIndex` 1) created a scene with its image stored and ran its clip through the stub. `GET /sessions/:id`:

```
scene state: chunk-complete
stages: {"video": {"stage": "video", "provider": {"name": "Stub provider", "model": "stub-video-provider"}, "attempts": 1}}
top-level provider/attempts present: [false, false]
```

No HTTP route creates image attempts offline (the image stage makes a real Fal.ai call), so the image stage's records were added to the scratch store through the backend's own store functions (`bindSceneImageProvider` and two `insertProviderRequest` calls), as the task 9.3 rows were. The same read then showed:

```
"image": {"stage": "image", "provider": {"name": "Fal.ai", "model": "fal-ai/flux/dev"}, "attempts": 2}
"video": {"stage": "video", "provider": {"name": "Stub provider", "model": "stub-video-provider"}, "attempts": 1}
```

## 9.3 Session-level stages, with sentinel text in every free-text column

`voice-over`, two `timestamps` (native, then forced alignment), `decomposition` and `assembly` attempt rows were added with `external_request_id`, `error_code` and `error_message` set to sentinels. The phase `stages` in `GET /sessions/:id`:

```
voice-over    [voice-over: ElevenLabs (eleven_multilingual_v2), 3 attempts]
decomposition [timestamps: ElevenLabs (forced alignment), 2 attempts; instructions: OpenAI (gpt-6-astra), 1 attempt]
scenes        []
assembly      [assembly: Local assembly (ffmpeg), 1 attempt]
```

The voice-over count is 3, not 1, because the real session's own voice attempt (the hung stub) was timed out and retried by the timeout watcher from JOS-185 while the test ran, next to the one added by hand: the count rises live. `grep -c` over the whole response body: `SENTINEL-REQUEST-ID` 0, `SENTINEL-ERROR-CODE` 0, `SENTINEL-ERROR-TEXT` 0, the clip endpoint path (`/openapi/v2/minimax`, `image-to-video`) 0; the positive control `Fal.ai` 1.

## 9.4 Error case and the generated API docs

- `GET /sessions/01ZZZZZZZZZZZZZZZZZZZZZZZZ` returned `{"error":"session not found"} HTTP 404`.
- `GET /docs/json`: the scene schema documents `stages` (an object with `image` and `video`, `additionalProperties: false`) and documents no `provider` or `attempts`; the phase entries document `stages`, and a stage diagnostic requires exactly `stage`, `provider` and `attempts`.

## 9.5 Clean-up

The server was stopped and the scratch store and project folder deleted. A snapshot of the default store of this worktree is identical to the one taken before the runs.
