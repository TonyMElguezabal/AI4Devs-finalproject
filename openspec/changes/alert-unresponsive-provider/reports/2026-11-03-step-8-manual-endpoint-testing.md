# Step 8 Report - Manual Endpoint Testing with curl

- Date: 2026-11-03
- Change: alert-unresponsive-provider (JOS-246)
- Agent: Claude (Opus 5.5)
- Commit: `1f919a14`

## Purpose
This change adds no route and changes no response. The run checks that the real server still behaves exactly as before when a provider never answers or answers with a retryable error: same stored outcomes, same retries, same failure. The new `unresponsive` value only goes to telemetry, which the curl run can't observe: consent is off on a fresh store, and the OTLP endpoint is fixed at build time. The metric is covered by `unresponsive-provider-contract.test.ts` (step 7).

## Setup
Real server (`node src/server.ts`) on port 3199, with:
- a scratch `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH` under the session scratchpad;
- a scratch `SETTINGS_PATH` with `{"maxTimeSeconds":{"voice":3}}`, so the voice time limit is reached in seconds;
- stubs: image, video and assembly on `success`;
- `RETRY_BASE_DELAY_SECONDS=1` and `RETRY_CAP_DELAY_SECONDS=1`.

## Run 1: the voice provider never answers (`USE_STUB_VOICE_PROVIDER=hang`)
```bash
curl -s http://127.0.0.1:3199/health
# {"ok":true}
curl -s -X POST http://127.0.0.1:3199/sessions -H 'content-type: application/json' \
  -d '{"title":"JOS-246 curl hang","script":"A short script for the hang test.","language":"en"}'
# 201, {"session":{"type":"session","sessionId":"01M6HGJ67KCXYSB6X5FJ9MRTTE","state":"submitted",...}}
curl -s http://127.0.0.1:3199/sessions/01M6HGJ67KCXYSB6X5FJ9MRTTE   # after the attempts ran out
# session.state = failed; failure.retryable = true; failure.manualRetryAvailable = true; failure.attemptsInCycle = 4
```
`stage_attempts` (read-only `sqlite3`): attempts 1, 2 and so on are `timed-out` with "the attempt had no result after 3 s", each followed by a scheduled retry that was sent, until the cycle's 4 attempts were used. The timeout watcher marked the attempts and the retry policy rescheduled them as before this change. `timeOutAttempt` now also reports each timeout to telemetry; nothing else differs.

Log file (`<scratch>/logs/vid4you.log`): 5 lines for the timeouts, and the session script does not appear in it.

## Run 2: the voice provider answers with a retryable error (`USE_STUB_VOICE_PROVIDER=transient-failure`)
```bash
curl -s -X POST http://127.0.0.1:3199/sessions -H 'content-type: application/json' \
  -d '{"title":"JOS-246 curl transient","script":"A short script for the transient test.","language":"en"}'
# HTTP 201
```
`stage_attempts`: attempts 1–4 are `transient`, "stub: transient voice provider error (503)". `GET /sessions/:id`: `state failed`, `retryable true`, `manualRetryAvailable true`, `attemptsInCycle 4`. These are the same budget and the same failure as run 1: only the reported telemetry outcome differs between the two runs (`unresponsive` vs `transient`).

## Error case
```bash
curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3199/sessions -H 'content-type: application/json' \
  -d '{"title":"x","script":"","language":"en"}'
# 400
```

## E2E with the browser (task 10.1)
Not applicable: this change touches no frontend code and no page.

## Cleanup
- Both servers stopped; port 3199 is free.
- Both scratch stores, projects folders, settings and key files were deleted.
- Default store `backend/data/skeleton.sqlite`: checksum prefix `9d1f0aa625a4`, unchanged from the step 7 baseline.

## Outcome
- Step 8 status: PASS
- Blocking issues: none
