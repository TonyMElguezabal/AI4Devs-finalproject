# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-11-03
- Change: alert-unresponsive-provider (JOS-246: JOS-257, JOS-258, JOS-259)
- Agent: Claude (Opus 5.5)
- Commit tested: `279dff8b`, in a fresh detached worktree (no `backend/.secrets.json`, no settings override, no vendor key in the environment), with `node_modules` linked from the main checkout (same lockfile)

## Commands Executed
- Targeted: `DB_PATH=<scratch>/db.sqlite PROJECTS_ROOT=<scratch>/projects npx vitest run test/telemetry.test.ts test/telemetry-hooks.test.ts test/image-provider.test.ts test/image-provider-queue.test.ts test/voice-provider.test.ts test/video-provider.test.ts test/visual-instructions.test.ts test/unresponsive-telemetry-wiring.test.ts test/unresponsive-provider-contract.test.ts test/grafana-alert-rule.test.ts`
- `npm run typecheck`, `npm run lint` (backend)
- `DB_PATH=<scratch>/db.sqlite PROJECTS_ROOT=<scratch>/projects npm test` (backend)
- `npm test` (`infra/telemetry-relay`)

## Unit Test Results
- Targeted tests: 213 passed, 0 failed, 0 skipped (10 files, 4 s)
- Backend typecheck and lint: clean
- Full backend suite: 2634 passed, 0 failed, 12 skipped (199 files passed, 6 skipped, 120 s)
- Relay suite: 13 passed, 0 failed
- Notes:
  - The skipped files are the vendor contract suites (`*.contract.test.ts`) and `subtitles-real-ffmpeg.test.ts`, which skip without a real key or a libass ffmpeg. There is one more skipped file than in the main checkout, which has `.secrets.json`. This is expected, and why the run was done in a fresh worktree.
  - No flaky behavior was seen.
  - The contract test was mutation-checked: removing the fal adapter's `unresponsive: true` made it fail (`['transient']` vs `['unresponsive']`). The file was then restored from git.

## Scenario → test mapping (task 6.2)

| Scenario / acceptance criterion | Test |
|---|---|
| app-telemetry: Completed attempt is counted once; Image and clip calls are counted; Repeated completion is not double-counted | existing `telemetry-hooks.test.ts` (`completeStageAttempt`, `insertProviderRequest`), unchanged and green |
| app-telemetry: Timed-out attempt is unresponsive (JOS-257 AC1) | `telemetry-hooks.test.ts` › timeOutAttempt › records one unresponsive call…; `telemetry.test.ts` › normalizeOutcome maps timed-out |
| app-telemetry: Request that hits its call time limit is unresponsive, retried as before | `unresponsive-provider-contract.test.ts` (fal, ElevenLabs voice); `voice-provider.test.ts` › a timeout is transient; `telemetry-hooks.test.ts` › stores the same mode/outcome as before |
| app-telemetry: Provider that cannot be reached is unresponsive (JOS-257 AC2) | `video-provider.test.ts` › upload/submit/poll cannot reach the provider; `unresponsive-telemetry-wiring.test.ts` › video submission/poll; image and voice network-error tests |
| app-telemetry: Unreachable reasoning provider is still transient (Decision 7) | `visual-instructions.test.ts` › classifies a network error as transient (no mark) |
| app-telemetry: Retryable HTTP answer stays transient (JOS-257 AC3) | `unresponsive-provider-contract.test.ts` › exports a 503 as transient (image, voice); `video-provider.test.ts` › a refused task answer carries no mark; existing HTTP-status tests |
| JOS-257 AC4 / alert spec: Retry rate still counts calls that got no answer | `grafana-alert-rule.test.ts` › the providers dashboard counts unresponsive in the retry rate |
| alert spec: Provider stops responding; Below the threshold; Thresholds per provider and stage; Development ignored (JOS-258 AC1–AC2) | `grafana-alert-rule.test.ts` › query, window, threshold, environment filter; firing behavior on the live stack: step 9 |
| alert spec: Provider recovers | step 9 (live) |
| alert spec: Alert reaches the Developer (JOS-258 AC3, JOS-259 AC2) | `grafana-alert-rule.test.ts` › routes to vid4you-critical; delivery: step 9 |
| alert spec: No address in the repository (JOS-258 AC4) | `grafana-alert-rule.test.ts` › the Grafana folder contains no email address |
| alert spec: Rule reproducible from the repository (JOS-258 AC5) | README import steps; step 9 (live import) |
| alert spec: CI sees an unanswered request / a timed-out attempt (JOS-259 AC1) | `unresponsive-provider-contract.test.ts`; `telemetry-hooks.test.ts` › timeOutAttempt |
| alert spec: Live alert test (JOS-259 AC2–AC3) | step 9 |

## Coverage (task 6.3)
No coverage tool is installed or configured (`@vitest/coverage-v8` is absent), so module coverage could not be compared with the propose commit. This is the same as in earlier changes (`report-estimated-cost` step 8). Instead, every branch this change adds has a named test above:
- the flag and `timed-out` cases of `normalizeOutcome`;
- the flag in `recordProviderCall`;
- the mark in each marked `catch`, and its absence on 503, a malformed body and the reasoning adapter;
- the hand-off on each of the four recording paths;
- `timeOutAttempt`, both when its update wins and when it loses.

## Database State Verification
- Pre-test baseline (`backend/data/skeleton.sqlite`, read-only queries):
  - row counts: `active_providers 0`, `app_settings 1`, `final_video_builds 0`, `narration_timestamps 1`, `phase_instants 4`, `provider_changes 0`, `provider_profiles 5`, `provider_requests 92`, `runs 1`, `scene_pause_edits 0`, `scene_results 46`, `scene_video_results 46`, `scenes 46`, `schema_migrations 26`, `stage_attempts 8`, `telemetry_settings 1`, `voice_overs 1`
  - applied migrations: 26; `data/projects/`: 1 entry; file checksum prefix `9d1f0aa625a4`
- Post-test validation: identical on every line (`diff` empty)
- State restored: not needed
- Restoration actions: none. Every run used a scratch `DB_PATH` and `PROJECTS_ROOT`, deleted afterwards.

## Documentation check (task 11.3)
`docs/PRD.md` §12.4 and `PRIVACY.md` list the provider-call outcome values, so both gain `unresponsive` (group 11). No new kind of data leaves the machine: the existing outcome field gets one more value.

## Outcome
- Step 7 status: PASS
- Blocking issues: none
