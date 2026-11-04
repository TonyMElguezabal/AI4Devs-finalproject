# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-11-03
- Change: verify-internal-workflow (JOS-243)
- Agent: Claude Code (Opus 5.5)

## Setup

Each run started `node src/server.ts` from `backend/` on a fresh scratch folder in the session scratchpad. Every variable was written out literally:

```
env NODE_ENV=development PORT=3943 DB_PATH=<scratch>/db.sqlite PROJECTS_ROOT=<scratch>/projects \
  SETTINGS_PATH=<scratch>/settings.json SECRETS_PATH=<scratch>/secrets.json \
  VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:9 RETRY_BASE_DELAY_SECONDS=0 RETRY_CAP_DELAY_SECONDS=0 \
  USE_STUB_SCRIPT_MODERATION=clean USE_STUB_VOICE_PROVIDER=success USE_STUB_DECOMPOSITION=success \
  USE_STUB_IMAGE_PROVIDER=success USE_STUB_VIDEO_PROVIDER=success USE_STUB_ASSEMBLY_TOOL=success \
  node src/server.ts
```

Before sending any request, the script checked for Fastify's `Server listening at http://127.0.0.1:3943` line and for the scratch database file.

## 9.2–9.3 Full run, every provider stubbed

| Request | Result |
|---|---|
| `curl -X POST /sessions -H "Content-Type: application/json" -d '{"title":"Curl run","script":"A calm sea tonight.","language":"en"}'` | 201, `state: submitted` |
| `curl GET /sessions/<id>`, polled | `final-video` |
| Phases | `voice-over: complete` (voice-over = Stub provider); `decomposition: complete` (timestamps = ElevenLabs, instructions = Stub provider); `scenes: complete`; `assembly: complete` (Local assembly) |
| `curl GET /sessions/<id>/download/final-video` | 200, `video/mp4`, 16 bytes (the stub placeholder) |
| Server log | Only `stub-` providers. No `api.openai.com`, `elevenlabs.io`, `fal.ai` or `runninghub` in the output. |

The timestamps stage still shows ElevenLabs on a stubbed run. That is JOS-264 (native timestamps recorded as `elevenlabs-native`), which is out of scope here.

## 9.4 Permanent image failure (`USE_STUB_IMAGE_PROVIDER=not-retryable-failure`)

| Request | Result |
|---|---|
| `curl -X POST /sessions …` | 201 |
| `curl GET /sessions/<id>`, polled until every scene failed | session `failed`; scene `failed`, `affectedStage: image`; phases: voice-over and decomposition `complete`, scenes `failed`, assembly `pending`; no `finalVideoUrl` |
| `curl GET /sessions/<id>/download/final-video` | 409 `{"ok":false,"reason":"final video is not yet available"}` |
| `<scratch>/logs/vid4you.log` | one `level: 50` line: `stage: image`, `provider: stub`, `outcome: not-retryable`, `msg: image request failed (not_retryable_failure)` |

## 9.5 Error cases

| Case | Result |
|---|---|
| `USE_STUB_DECOMPOSITION=bogus` | boot `warn` (level 40): `USE_STUB_DECOMPOSITION='bogus' is not a stub mode (success): the real reasoning and alignment providers are used` |
| `USE_STUB_SCRIPT_MODERATION=yes` | boot `warn` (level 40): `USE_STUB_SCRIPT_MODERATION='yes' is not a stub mode (clean): the real script moderation is used` |
| `curl GET /sessions/01ZZZZZZZZZZZZZZZZZZZZZZZZ` | 404 `{"error":"session not found"}` |

## Incident and restoration

The first attempt at 9.4 put the variables in a shell variable (`env $COMMON …`). zsh does not split an unquoted variable into words, so all of them became the value of `NODE_ENV`. The server then started with no stubs, on the default port 3100, and with the default `DB_PATH`: the Developer's `backend/data/skeleton.sqlite`.
- It ran boot recovery there (`resumed 0, stillPending 0`). It received no request, because curl was calling port 3943, and it was stopped within seconds.
- Checked afterwards: the database row counts, the SHA-1 of `skeleton.sqlite`, and the modification times of `skeleton.sqlite`, `skeleton.sqlite-wal` and `projects/` were identical to the step 8 baseline.
- The only change was 5 lines appended to `backend/data/logs/vid4you.log` by that process (pid 21797). They were the last 5 lines of the file and only those. They were removed, which restored the file to its 465 original lines. A copy of the file before the removal was kept in the session scratchpad.
- The rerun wrote every variable out literally and checked the listening line and the scratch database before sending anything.

The workflow tests are not exposed to this mistake: `workflowServer.ts` passes the environment to `spawn` as an object.

## 9.6 Cleanup

All scratch folders were removed and no `src/server.ts` process is left. `backend/data/` matches the step 8 baseline (`diff` empty).

## Outcome

- Step 9 status: PASS
- Blocking issues: none
