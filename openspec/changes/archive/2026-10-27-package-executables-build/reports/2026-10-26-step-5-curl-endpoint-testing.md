# Step 5 — curl endpoint testing (JOS-205)

Date: 2026-10-26 · macOS arm64 host · every run used a scratch `VID4YOU_DATA_DIR` (deleted afterwards) and a non-default port (`VID4YOU_PORT`), `VID4YOU_NO_BROWSER=1`.

Builds: `npm run package:smoke` (smoke flavor) and `npm run package:darwin-arm64` (release flavor) in `backend/`.

## Smoke flavor, port 3199, clean data folder

| Request | Result |
|---|---|
| `GET /health` | 200 `{"ok":true}` |
| `GET /docs` | 404 |
| `GET /` and `GET /admin` | 200 (embedded interface) |
| `GET /health` with `Host: evil.com` | 403 |
| `GET /health` with `Origin: http://evil.com` | 403 |
| `POST /sessions` `{"title":"Smoke","script":"Hello there. This is a short smoke test.","language":"en"}` | 200, session `submitted` |
| `GET /sessions/<id>` polled every 3 s | reached `state: "final-video"` (voice-over by `stub-voice`) within about 6 s; the real bundled ffmpeg assembled the clip |

The data folder then held `vid4you.sqlite`, `projects/`, `logs/`, `runtime/settings.default.json` and `smoke-clip.mp4`.

## Second instance (5.5)

A second `./Vid4You` with the same port printed "Vid4You is already running at http://127.0.0.1:3199/; opening it." and exited with code 0. `pgrep` showed one `Vid4You` process; the first instance kept answering.

## Release flavor, port 3198, `ALLOW_TEST_ENDPOINTS=1 USE_STUB_VOICE_PROVIDER=success`

| Request | Result |
|---|---|
| `GET /health` | 200 `{"ok":true}` |
| `GET /docs` | 404 |
| `POST /internal/test/quick-voice-over` | 404 (the test endpoint is not registered) |
| `POST /sessions` | `{"ok":false,"reason":"The content check is temporarily unavailable..."}`: the stub moderator and stub voice provider are not active; the real moderator found no key |

## Cleanup (5.6)

Both processes stopped (`/health` no longer answers), the scratch data folders were deleted, and `backend/data/` does not exist, the same as before.
