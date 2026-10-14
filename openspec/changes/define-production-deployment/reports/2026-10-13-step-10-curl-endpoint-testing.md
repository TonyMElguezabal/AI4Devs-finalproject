# Step 10 — manual endpoint testing with curl (local packaged application)

Date: 2026-10-13. Target: `poc/local/out/Vid4You` on macOS, port 3150, a throwaway data folder (`VID4YOU_DATA_DIR` in the session scratchpad), `PATH=/usr/bin:/bin`. The task list was written for the hosted options; under Decision 14 the "edge" is the executable's own `Origin`/`Host` guard.

| Task | Command (abridged) | Response |
|---|---|---|
| 10.1 | start in stub mode; data folder before | empty |
| 10.2 | `GET /health` | `200 {"ok":true}` |
| 10.2 | `GET /health` with `Origin: https://evil.example` | `403 forbidden: origin not allowed` |
| 10.3 | `POST /sessions` (title, script, `en`) with the app's own `Origin` | `201`, state `submitted` |
| 10.3 | `POST /sessions` with an invalid body | `400` |
| 10.4 | `curl -N /events?sessionId=…` for 20 s | `: connected` at 1 s, `: heartbeat` at 16 s |
| 10.5 | `GET /sessions/:id/download/final-video` | `200`, 58,339 B, `video/mp4` |
| 10.6 | `GET /events?sessionId=<unknown>` | `404` |
| 10.6 | `GET /sessions/<unknown>` | `404` |
| 10.6 | release mode (no `POC_MODE`) started **with** `ALLOW_TEST_ENDPOINTS=1` and `USE_STUB_VOICE_PROVIDER=success` in the environment: `POST /internal/test/quick-scene` | `404` (release safety stand-in, story L5) |
| 10.6 | release mode: `GET /docs` | `404` |
| 10.7 | data folder after | the throwaway folder holds the test store and project; the user's real data folder (`~/Library/Application Support/Vid4You`) was never created |
