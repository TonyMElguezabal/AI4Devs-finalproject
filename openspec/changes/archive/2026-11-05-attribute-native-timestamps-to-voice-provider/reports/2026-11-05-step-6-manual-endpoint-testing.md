# Step 6 Report: Manual Endpoint Testing with curl

- Date: 2026-11-05
- Change: attribute-native-timestamps-to-voice-provider
- Agent: Claude Code (Opus 5.5)

## Setup

The backend was started from a script with every variable written literally, on a scratch folder in the session scratchpad, with every provider stubbed. This is the full-stub run of `verify-internal-workflow` (JOS-243), whose step 9 report found this bug ("timestamps = ElevenLabs"):

```
env NODE_ENV=development PORT=3264 DB_PATH=<scratch>/db.sqlite PROJECTS_ROOT=<scratch>/projects \
  SETTINGS_PATH=<scratch>/settings.json SECRETS_PATH=<scratch>/secrets.json \
  VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:9 RETRY_BASE_DELAY_SECONDS=0 RETRY_CAP_DELAY_SECONDS=0 \
  USE_STUB_SCRIPT_MODERATION=clean USE_STUB_VOICE_PROVIDER=success USE_STUB_DECOMPOSITION=success \
  USE_STUB_IMAGE_PROVIDER=success USE_STUB_VIDEO_PROVIDER=success USE_STUB_ASSEMBLY_TOOL=success \
  node src/server.ts
```

- **Guard:** before sending anything, the script checked for `Server listening at http://127.0.0.1:3264` and for the scratch `db.sqlite`.
- **`backend/data/`:** unchanged afterwards (1 run in `skeleton.sqlite`, `store.sqlite` sha256 `e3b0c44298fc1c14…`).

## 6.1 A stubbed run names the stub (AC1, AC2)

Three sessions were created with `curl -X POST /sessions -H "Content-Type: application/json" -d '{"title":"…","script":"A calm sea tonight.","language":"en"}'` (201). The first two responses were read with the wrong JSON path (`.id` instead of `.session.sessionId`), so they were followed through the database instead.

- **`curl GET /sessions/01M6PCNWZKKAYX467WQRDCJ155`:** polled to `final-video`.

| Phase | Stage | Provider |
|---|---|---|
| voice-over | voice-over | Stub provider / `stub-voice` |
| decomposition | timestamps | **Stub provider / `native timestamps`** (was ElevenLabs before this change) |
| decomposition | instructions | Stub provider / `stub-reasoning` |
| assembly | assembly | Local assembly / `ffmpeg` |

- **Stored attempts:** all three sessions have `voice-over|stub-voice|success` and `timestamps|stub-voice:native|success`.
- **Bindings:** `runs.voice_provider_id` is `stub-voice`, and `alignment_provider_id` is empty. Native timestamps bound no alignment provider, so JOS-171's binding rules hold.

## 6.2 A stored legacy attempt still shows ElevenLabs (AC4)

- **Setup:** with the server stopped, session `01M6PCKXE7VT9CA85SZKRFGCCD`'s timestamps attempt was rewritten in the scratch store to `elevenlabs-native`, as it would have been stored before this change. The server was then restarted the same way.

| Request | Timestamps provider |
|---|---|
| `curl GET /sessions/01M6PCKXE7VT9CA85SZKRFGCCD` (legacy row) | ElevenLabs / `native timestamps` |
| `curl GET /sessions/01M6PCNWZKKAYX467WQRDCJ155` (new row) | Stub provider / `native timestamps` |
| `curl GET /sessions/01ZZZZZZZZZZZZZZZZZZZZZZZZ` | 404 |

## Not checked here

- **Telemetry:** it was sent to a closed port, so the `provider` label is covered by `telemetry-provider-name.test.ts` (`stub` and `ElevenLabs`) instead.
- **ElevenLabs voice profile (AC3):** checked by the unit tests (display and telemetry for `ElevenLabs:native`). A live run would bill the real voice provider.

## Cleanup

The server was stopped; port 3264 is free.

## Outcome

- Step 6 status: PASS
- Blocking issues: none
