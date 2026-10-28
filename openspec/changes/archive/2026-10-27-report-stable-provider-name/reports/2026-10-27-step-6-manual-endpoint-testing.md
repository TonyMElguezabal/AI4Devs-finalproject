# Step 6 Report - Manual Testing of the Telemetry Export

- Date: 2026-10-27
- Change: report-stable-provider-name (JOS-213)
- Agent: Claude

The change adds and alters no endpoint, so there is no curl step to run on a route. Two things differ from the task wording and are recorded here instead of being skipped:

- A session cannot be run through to a final video in this environment: there are no provider keys and `POST /sessions` is refused without the content-check key. So the check drives the real recording functions (`recordStageAttempt`, `completeStageAttempt`, `insertProviderRequest`) in a script and exports through the real OTLP HTTP exporters.
- Telemetry is sent to `VID4YOU_TELEMETRY_ENDPOINT`; it pointed at a capture server on `127.0.0.1:4318` that stored each request body. Consent (errors and provider usage) was set in the script's scratch database.

## Commands Executed
- `node capture.mjs <scratch>/capture.jsonl` (HTTP server that appends every POST body)
- `DB_PATH=<scratch>/drive.db PROJECTS_ROOT=<scratch>/projects VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:4318 node drive.ts` (scratchpad scripts, not part of the repository): seeds the profiles, records and completes one attempt per case, one image and one clip request per scene, then flushes

## Captured `vid4you_provider_calls_total` series (stage, provider, outcome)

| Case driven | Series received |
|---|---|
| decomposition, seeded `openai-decomposition` | `decomposition`, `OpenAI`, `success` |
| voice-over, seeded `ElevenLabs` | `voice-over`, `ElevenLabs`, `success` |
| timestamps, `elevenlabs-native` and seeded `elevenlabs-forced-alignment` | `timestamps`, `ElevenLabs`, `success` (one series) |
| assembly, no provider id | `assembly`, `local`, `success` |
| decomposition, `some-old-model-id` (no profile) | `decomposition`, `unknown`, `success` |
| image, seeded id, legacy `fal-ai/flux/dev`, and an `/admin` profile of adapter `fal-image` | `image`, `Fal.ai`, `success` (one series) |
| clip, seeded id and legacy `/openapi/v2/minimax/hailuo-h3/image-to-video` | `video`, `RunningHub`, `success` (one series) |
| clip recorded as `not_retryable_failure` | `video`, `RunningHub`, `not-retryable`; one error log record with `provider` `RunningHub` |

Payload search (all captured bodies): none of the `/admin` profile's ULID, its label `My image account`, `some-old-model-id`, `flux`, `/openapi`, `openai-decomposition`, `elevenlabs-native` or `elevenlabs-forced-alignment` appears anywhere (AC1, AC2, AC3).

## Database State Verification
- Only the script's scratch database was written; the shared local database was not opened.
- State restored: the capture server was stopped and the scratch directory deleted; the scripts live in the session scratchpad.

## Outcome
- Step 6 status: PASS
