# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-10-04
- Change: bounded-retry-policy (JOS-184)
- Agent: Claude Sonnet 5

## Setup

`node src/server.ts` on port 3102 against an isolated store (`DB_PATH` and `PROJECTS_ROOT` in a scratch folder), so the default `data/skeleton.sqlite` was not used. The voice provider was the stub (`USE_STUB_VOICE_PROVIDER=<mode>`); the real ElevenLabs API was never called. Retry delays were shortened with two variables that `server.ts` honours only when run as the main module (`RETRY_BASE_DELAY_SECONDS`, `RETRY_CAP_DELAY_SECONDS`, fractions allowed). Both are manual-testing aids added in this step; the first one needed a new stub mode, `transient-twice-then-success` (fails its first two calls, then succeeds), covered by a test in `voice-provider.test.ts`.

Every scenario: `POST /sessions` with a two-sentence script, then `GET /sessions/{id}` until the expected state. Attempt rows were read from the isolated store, read-only.

Pre-test state: default store 0 runs, 0 scenes, 0 attempts, 0 provider requests, 13 migrations (another branch's); isolated store absent.

## Results

| # | Stub mode, delays | Observed | Verified |
|---|---|---|---|
| 9.3 | `transient-twice-then-success`, 0.3 s base, 1 s cap | `voice-over-complete`, no failure at any point | 3 attempts in cycle 1: `initial` transient, `automatic` transient (due set), `automatic` success. |
| 9.4 | `transient-failure`, 0.3 s, 1 s | `failed`, `failure` = `{retryable: true, manualRetryAvailable: true, cycle: 1, attemptsInCycle: 4}`, cause written for a person | 4 attempts, all transient; after waiting 3 s (well past the next delay) still 4 rows and the same failure. |
| 9.5 | `not-retryable-failure` | `failed`, `retryable: false`, `manualRetryAvailable: false`, `cycle: 1`, `attemptsInCycle: 1` | exactly 1 attempt, `not-retryable`. |
| 9.6 | `transient-twice-then-success`, 5 s base and cap | before restart: `submitted`, attempt 1 transient, attempt 2 `scheduled` with a due time. After restart: boot log `scheduledRetries: 1`, still `submitted`, attempt 2 still `scheduled`. Later: `voice-over-complete` | attempt 2 was sent once after the restart (rows: 1, 2, 3, 4, one per sequence number, no duplicate). The new process's stub starts its failure count again, hence 4 attempts rather than 3. |

Logs: `voice-over.retries.exhausted` and `voice-over.failure.not-retryable` appear at warning level (level 40) with the stage instance key, cycle and sequence; the script text appears in no server log line (0 matches) and no credential or `xi-api-key` appears either.

## Cleanup (9.7)

Stopped every server (port 3102 free), deleted the isolated store and project folder. The default store was re-counted and is identical to the pre-test state.

## Outcome

- Step 9 status: PASS
- Blocking issues: none
