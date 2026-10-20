# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-10-04
- Change: generate-voice-over (JOS-136)
- Agent: Claude Sonnet 5

## Setup

The backend was started with `node src/server.ts` on port 3101, against an isolated store (`DB_PATH=data/curl.sqlite`, `PROJECTS_ROOT=data/curl-projects`), so the default `data/skeleton.sqlite` was not used. The voice provider was the stub, selected with `USE_STUB_VOICE_PROVIDER=<mode>`, which is honoured only when `server.ts` runs as the main module. Every scenario used `POST /sessions` with `{"title":"Curl voice test","script":"The sun rose slowly over the quiet hills. Everyone woke up smiling.","language":"en"}`, followed by `GET /sessions/{id}`. The real ElevenLabs API was never called.

Pre-test state: default store 0 runs, 0 scenes, 0 voice-overs, 0 attempts; isolated store and folder absent.

## Results

| # | Stub mode | POST response | Observed `GET` state | Verified |
|---|---|---|---|---|
| 9.3 | `success` | `201`, `state: submitted` | `voice-over-complete` | `voiceOver` = `{provider: "stub-voice", durationSeconds: 0.990375, nativeTimestampsAvailable: true, completedAt}`; `failure` absent. |
| 9.3 | `hang` | `201`, `state: submitted` | `voice-over-generating` (on every poll while the request is open) | `voiceOver` and `failure` absent. |
| 9.4 | `not-retryable-failure` | `201`, `submitted` | `failed` | `failedPhase: "voice-over"`; `failure.cause` = "The voice-over could not be generated: stub: voice provider rejected the input. The script is unchanged."; `retryable: false`. |
| 9.5 | `transient-failure` | `201`, `submitted` | `failed` | same shape, `retryable: true` (default retry hook, until JOS-184). |
| 9.6 | none (real adapter), server run from a fresh worktree with no `.secrets.json` and no `ELEVENLABS_KEY` | `201`, `submitted` | `failed` | `failure.cause` = "... missing credential 'ELEVENLABS_KEY': set it in the local environment or in the local secrets file (never in the repository). The script is unchanged."; `retryable: false`; no value anywhere; nothing was sent. |

Note: the `success` stub answers within tens of milliseconds, so the `voice-over-generating` state is shown with the `hang` stub; the automated tests also cover it (`voice-over-phase.test.ts`).

## Additional checks

- 9.7: `GET /sessions/{id}/voice-over`, `/voice-over.mp3`, `/narration` and `/audio` all return `404`.
- 9.8: on disk, the completed session has exactly one `voice-over.mp3` (plus `voice-over-timestamps.json`) in its own project folder; the three failed sessions have none; the credential-missing session wrote no folder.
- Isolated store after the run: 4 runs, 1 voice-over, attempts by outcome `success` 1, `not-retryable` 1, `transient` 1, `in-flight` 1 (the `hang` run, whose server was stopped, which is the case JOS-160 recovers).
- Logs: `voice-over.attempt.started` and `.finished` carry session id, provider, attempt number, outcome, latency, script length, SHA-256 and the provider's request id; the script text appears in none of the server logs (0 matches) and no credential value appears.

## Cleanup (9.9)

Stopped each server (port 3101 free), deleted `data/curl.sqlite` with its `-shm`/`-wal` files and `data/curl-projects/`, removed the temporary worktree and the server logs. `ls backend/data` is back to the pre-test files and the default store is unchanged.

## Outcome

- Step 9 status: PASS
- Blocking issues: none
