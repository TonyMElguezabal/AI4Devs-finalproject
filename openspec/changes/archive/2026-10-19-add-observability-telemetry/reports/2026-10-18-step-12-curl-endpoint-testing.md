# JOS-199 step 12 — manual endpoint testing with curl

Date: 2026-10-18. The packaged executable (`poc/local/out/Vid4You`, built from this branch) on port 3198 with `POC_MODE=stub`, a throwaway data folder (own `DB_PATH` and `PROJECTS_ROOT`), and a local OTLP receiver on `127.0.0.1:4318` (`VID4YOU_TELEMETRY_ENDPOINT`). The shared test store was not touched.

## 12.1 Baseline
`sqlite3 vid4you.sqlite "select * from telemetry_settings"` → `1|0|0|0||01M58K…` (nothing granted, `answered_at` empty).

## 12.2 Defaults
`GET /telemetry/consent` → `200 {"errors":false,"providerUsage":false,"productUsage":false,"answered":false}`

## 12.3 Consent writes
| Request body | Status | Response |
|---|---|---|
| `{"errors":true,"providerUsage":true,"productUsage":false}` | 200 | same flags, `"answered":true` |
| `{"errors":true}` | 400 | `body/providerUsage Required, body/productUsage Required` |
| `{"errors":"yes","providerUsage":true,"productUsage":true}` | 400 | `body/errors Expected boolean, received string` |
| all three `true` (restore) | 200 | all `true`, `"answered":true` |

The original (unanswered) row was not restored by hand: this store is throwaway and the next steps need consent on.

## 12.4 Update check
- Channel `development`: `GET /app/update` → `200 {"available":false}`.
- `VID4YOU_CHANNEL=production VID4YOU_RELEASE_TAG=v0.0.1`: `200 {"available":false}`. The log shows `update check failed: GitHub answered 404`, because `TonyMElguezabal/AI4Devs-finalproject` has no release yet (`/releases/latest` → 404). The failure is handled as designed (warned once, nothing blocked).
- **Not shown live: `available:true`.** It needs a published release. The unit tests (`update-check.test.ts`) cover it with a stubbed fetch; repeat it by hand after the first release.

## 12.5 Stubbed session to final video
`POST /sessions` with title `SECRET-TITLE-xyz` and script `SECRET-SCRIPT …`. The session ran to a final video. Received on `/v1/metrics` (on shutdown and on the 60 s timer):
- `vid4you_provider_calls_total` for voice-over (stub-voice), timestamps (elevenlabs-native), decomposition (openai-decomposition), image (stub-image), video (stub-video-provider), assembly (provider `unknown`), all `outcome=success`.
- `vid4you_provider_call_duration_ms` for the same six.
- `vid4you_billed_units_total`: `voice_characters`, `images`, `clip_seconds`.
- `vid4you_app_starts_total`, `vid4you_sessions_started_total`, `vid4you_final_videos_total`.
- Attribute keys seen: only `stage`, `provider`, `outcome`, `unit`. `grep SECRET` over everything received: 0; `grep` for `/Users`, `/private`, `poc-clip`: 0.

## 12.6 Log file
`<data dir>/logs/vid4you.log` exists, 92 lines, 0 occurrences of `SECRET`.

## 12.7 Store check
The throwaway store ends with `telemetry_settings` = `1|1|1|1|<timestamp>|<install id>` (consent on, as set in 12.3/12.5); the shared test store is unchanged from step 11.

## Findings
- The assembly stage reports provider `unknown` (it records no provider id). Dashboards group by provider, so assembly shows under `unknown`.
- To run a stub session the proof-of-concept `entry.ts` now also installs a clean script moderator in stub mode (no OpenAI key there), otherwise `POST /sessions` returns 503.
