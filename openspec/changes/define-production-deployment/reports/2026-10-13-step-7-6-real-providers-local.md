# Step 7.6 — real providers inside the packaged executable (macOS)

Date: 2026-10-13. `poc/local/out/Vid4You`, `POC_MODE=real-test` (real providers; the test endpoint `quick-scene` kept because nothing starts decomposition after the voice-over, story S6), `PATH=/usr/bin:/bin`, a throwaway data folder holding a copy of the developer's `backend/.secrets.json` (mode 0600), deleted after the run.

| Check | Result |
|---|---|
| Credentials file in the data folder | read: the ElevenLabs call authenticated |
| Real voice-over (ElevenLabs) | `voice-over-complete`, 4.41 s narration for "The harbor is quiet at dusk. Small boats rest by the old pier." |
| Credentials in the log | none of the four values (or their 12-character prefixes) appears in the process log |
| Real video (RunningHub, image from `quick-scene`, a 1920x1088 PNG made by the bundled ffmpeg) | **failed**: 4 attempts, each `transient_failure` in about 0.2-0.6 s, then the scene and session `failed` |
| Cause | RunningHub's image upload (`POST /openapi/v2/media/upload/binary`) answers HTTP 200 with `errorCode 1000`, "Unknown error, please retry or contact support", in an envelope (`taskId, status, errorCode, errorMessage, …`) different from the one the adapter parses (`code, data.fileUrl`). Reproduced with a plain `fetch` outside the application, so it is the provider or the account, not packaging |
| Real assembly with a real clip | not reached |

## Findings for follow-up
1. **RunningHub currently rejects uploads for this account** (error 1000). The product owner checks the account (balance, key, API status) with RunningHub; the adapter may also need the provider's current response envelope (owned by the video stage's change, not this one).
2. **The failure reason is not stored**: `provider_requests` has no reason column and the log has no warning, so the cause was only found by repeating the request by hand. Worth a story for the video stage (observability).
3. **Video attempts 1-4 ran back to back within about 1 s**, with no backoff between transient failures. Worth checking against the retry policy (PRD §10) in the video stage's change.
