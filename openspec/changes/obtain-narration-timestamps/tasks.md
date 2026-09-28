# Tasks — Obtain narration timestamps for the script (JOS-139)

Tests come first throughout: each behaviour gets a failing test before the code that makes it pass, and every scenario in `specs/narration-timestamps/spec.md` has at least one functional test. Automated tests use a stub alignment provider or a mocked HTTP layer; the real alignment provider is called only by the opt-in contract test (task 3.6), once.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-139-obtain-narration-timestamps` from `feature/jos-144-assign-scene-identifiers` (stacked: it reuses JOS-144's `DecompositionFailure`; rebase onto `feature/entrega-2-JAME` once PR #10 merges; MVP changes never target `main`)
- [x] 0.2 Verify the branch was created and is the current branch — `feature/jos-139-obtain-narration-timestamps`, cut from `feature/jos-144-assign-scene-identifiers` at `cd9f2ef`

## 1. Gate and umbrella carve-out

- [x] 1.1 Record on JOS-138 that its question is answered by JOS-165 reports step 4 and step 5a (product owner decision, 2026-09-28), so the spike can be closed — posted on JOS-138 (with the limitation that both mechanisms were verified on one short English script) and the proposal's decisions on JOS-139
- [x] 1.2 Confirm the base: `voice_overs` (with `audio_path`, `timestamps_path`, `duration_seconds`) and `stage_attempts` exist; `ALIGNMENT_PROVIDER` endpoint `/v1/forced-alignment`, `PER_PHASE_MAX_TIME_SECONDS.alignment` 5, credential `ELEVENLABS_KEY` present (name only); `DecompositionFailure` and `deriveSessionState(scenes, failure)` from JOS-144 — confirmed: `voice_overs` (`audio_path`, `timestamps_path`, `duration_seconds`, `native_timestamps_available`), `stage_attempts.stage` is free text (no CHECK), `ALIGNMENT_PROVIDER` `/v1/forced-alignment`, `PER_PHASE_MAX_TIME_SECONDS.alignment` 5, `ELEVENLABS_KEY` present (name only), `DecompositionFailure`, `deriveSessionState(scenes, failure)`, `writeArtefactOnce`; only the TypeScript `AttemptStage` type needs the new stage
- [x] 1.3 Remove the timestamps requirements from `decompose-script-into-chunks` (phase start, native vs alignment, failure attribution, and the automatic part of the retry rule; the manual-retry requirement stays for JOS-156), point it here, and validate both changes — three requirements removed from the umbrella spec (9 remain: phase start, native-vs-alignment and failure attribution moved; the manual-retry and separate-stage-instance requirements stay), proposal, design Decision 1 and tasks 5.1-5.5 updated; both changes validate

## 2. Persistence (TDD) — design Decisions 2 and 7

- [x] 2.1 Write failing tests that `recordStageAttempt` accepts the stage `timestamps` and numbers its attempts separately from `voice-over` — `backend/test/narration-timestamps-persistence.test.ts`; the three runtime tests passed from the start because the database takes any stage name, the TypeScript stage type is what failed typecheck
- [x] 2.2 Write failing tests for migration 8: `narration_timestamps` keyed on the session, a second row refused, update and delete refused by triggers naming the table, a pre-existing database upgraded, re-running migrations a no-op — also the mechanism CHECK, and that the primary key refuses a second row even by raw SQL
- [x] 2.3 Write a failing test that `resetAll()` empties `narration_timestamps` and leaves its delete trigger in place — also that a record stored after a reset is locked again
- [x] 2.4 Implement the stage type, migration 8, the triggers from named constants, the repository functions and the `resetAll()` change — `AttemptStage` gains `timestamps`; `NarrationTimestampsInput`; `NARRATION_TIMESTAMPS_*_TRIGGER_DDL` and migration 8; `insertNarrationTimestamps`, `getNarrationTimestamps`, `countNarrationTimestamps`; `resetAll()` lifts and recreates the new delete trigger
- [x] 2.5 Run the group 2 tests and confirm they pass — 15/15 (12 failed before); typecheck clean; full suite 324 passed, 1 skipped when green, with the known intermittent `orchestrator.test.ts` failure seen once in three runs

## 3. Usability check and alignment adapter (TDD) — Decisions 3 and 6

- [x] 3.1 Write failing tests that parse the native (`alignment` with parallel arrays) and forced-alignment (`characters` with `text`, `start`, `end`) shapes into the common per-character form, and reject malformed shapes with Zod — `backend/test/narration-timestamps-check.test.ts`; native (whole response or the `alignment` object) and forced-alignment shapes, with malformed shapes rejected
- [x] 3.2 Write failing tests for `checkTimestamps`: usable when they reproduce the script (exactly for native, apart from whitespace for alignment) with valid times; unusable for an empty list, a text mismatch, a negative or non-finite time, an end before its start, starts going backwards, and an end beyond the duration plus 0.5 s; gaps are allowed — plus that the script is compared as stored (no trimming) and that alignment need not start at 0
- [x] 3.3 Define the typed `AlignmentProvider` port (MP3 bytes and script in, character timestamps or a classified failure out) — `AlignmentProvider` and `AlignmentResult` (`success`, `failed_transient`, `failed_not_retryable`, `invalid_output`) in `backend/src/alignmentProvider.ts`
- [x] 3.4 Write failing adapter tests against a mocked `fetch`: one multipart request with `file` and `text` and the `xi-api-key` header; HTTP-status classification (4xx except 408/429 not retryable; 408, 429, 5xx, network error, 5 s time limit transient); a missing credential sends nothing; the reason never carries the raw body or the key — `backend/test/alignment-provider.test.ts`; also that the script is sent unaltered and that the MP3 bytes arrive intact
- [x] 3.5 Implement the parsers, the check and the adapter — `backend/src/narrationTimestamps.ts` (pure) and the ElevenLabs adapter; the adapter passes the MP3 as a plain `ArrayBuffer` copy because `Blob` rejects other buffer types
- [x] 3.6 Write an opt-in contract test against the real forced-alignment endpoint (`RUN_PROVIDER_CONTRACT_TESTS=1`), excluded from the default run — `backend/test/alignment-provider.contract.test.ts`, skipped by default; it needs an MP3, its script and its duration, and runs once in step 8
- [x] 3.7 Run the group 3 tests and confirm they pass — 49/49 (both modules were missing before); the contract test is skipped by default; typecheck clean

## 4. Obtaining timestamps (TDD) — Decisions 1, 4, 5 and 8

- [x] 4.1 Write failing tests that usable native timestamps are stored with mechanism `native`, the file is written once in the project folder, and the alignment provider is not called — `backend/test/obtain-narration-timestamps.test.ts`; also one `elevenlabs-native` attempt completed as a success and the voice-over untouched
- [x] 4.2 Write failing tests that missing native timestamps call the alignment provider with the stored MP3 bytes and the locked script, and store mechanism `alignment` — also whitespace-only differences and an alignment that starts late or has gaps
- [x] 4.3 Write failing tests that unusable native timestamps call the alignment provider in the same attempt, and the attempt records `native-unusable` — five unusable shapes (text mismatch, negative time, an end beyond the narration, not JSON, an unexpected shape); the attempt records `native-unusable`
- [x] 4.4 Write failing tests that when alignment fails or returns unusable timestamps, nothing is stored, the attempt is failed, the session gets a `decomposition` failure with the right retryability, and the voice-over row is unchanged — five failure shapes plus a missing MP3; also that no voice failure is recorded, and that a later success clears the failure
- [x] 4.5 Write a failing test that after a `native-unusable` finding, the next attempt calls the alignment provider directly without reading the native timestamps — the native file is replaced by a usable one before the second attempt, which still goes straight to alignment; also every later attempt
- [x] 4.6 Write failing tests that a session without a voice-over, an unknown session and a session with stored timestamps are refused without recording anything — also that each session's timestamps stay apart
- [x] 4.7 Write a failing test that the attempt is recorded in-flight before the alignment provider is called
- [x] 4.8 Implement `obtainNarrationTimestamps` and publish the session state after success and failure — `backend/src/narrationTimestampsPhase.ts` plus `clearRunFailure` in `db.ts`. Added beyond the tasks: adoption of a valid stored file that has no record (a crash between the file and its record would otherwise leave a file that can never be written again), with a test. The voice provider is not a dependency, so it cannot be called
- [x] 4.9 Run the group 4 tests and confirm they pass — 31/31; four mutations (ignoring the earlier finding, not recording it, skipping the native check, recording a voice failure) each made 2 to 9 tests fail and were reverted; typecheck clean

## 5. Session state (TDD) — Decision 8, AC1

- [ ] 5.1 Write failing tests for `deriveSessionState` with no chunks: failure → `failed`; stored timestamps or a `timestamps` attempt → `chunk-decomposing`; a voice-over only → `voice-over-complete`; nothing → `submitted`; existing callers unchanged
- [ ] 5.2 Write failing tests that the state machine allows `voice-over-complete -> chunk-decomposing`, `chunk-decomposing -> chunks-processing` and `chunk-decomposing -> failed`, and still refuses every other new pair
- [ ] 5.3 Write a failing test that `GET /sessions/:id` shows `chunk-decomposing` during the phase and `failed` with failed phase `decomposition` after a failure
- [ ] 5.4 Implement, then run the group 5 tests and confirm they pass

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 6.1 Update tests that assumed a session with a voice-over derives to `submitted`, and the state-machine tests for the three new allowed transitions
- [ ] 6.2 Confirm every scenario in `specs/narration-timestamps/spec.md` has at least one functional test; list the mapping in the step 7 report
- [ ] 6.3 Confirm module test coverage has not decreased, measured against the base on scratch databases
- [ ] 6.4 Run `npm run typecheck` and the server runtime-load test

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 7.1 Capture the pre-test state of the default test store (counts, triggers, migrations, project folders)
- [ ] 7.2 Run the targeted tests and capture the summary
- [ ] 7.3 Run the full suite and record totals, failures and runtime (the known intermittent `orchestrator.test.ts` failure is reported, not hidden)
- [ ] 7.4 Verify the post-test state matches the baseline; restore it if not
- [ ] 7.5 Write `openspec/changes/obtain-narration-timestamps/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [ ] 7.6 Mark this step complete only after the tests pass and the report exists

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Start the real server on a scratch database and confirm it responds
- [ ] 8.2 Create a session, store a voice-over from a real ElevenLabs `/with-timestamps` call (one request, a short script), then call `obtainNarrationTimestamps` from a script; `GET /sessions/:id` shows `chunk-decomposing`, and the stored file has mechanism `native`
- [ ] 8.3 For a second session with the same MP3 and no native timestamps, obtain them through the real forced-alignment endpoint (one request); record the mechanism and the latency against the 5 s limit
- [ ] 8.4 For a third session, make alignment fail (a stub provider); `GET` shows `failed`, failed phase `decomposition`, and the voice-over is unchanged
- [ ] 8.5 With `sqlite3`, try updating and deleting a `narration_timestamps` row; record the refusals
- [ ] 8.6 Clean up through the test-only reset; confirm the scratch store is empty with all triggers and the default store untouched
- [ ] 8.7 Save `openspec/changes/obtain-narration-timestamps/reports/YYYY-MM-DD-step-8-curl-endpoint-testing.md`

## 9. E2E Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Decide applicability: this story adds no screen; if the session page shows the state, check it displays `chunk-decomposing` and the decomposition failure; otherwise record why not
- [ ] 9.2 Save `openspec/changes/obtain-narration-timestamps/reports/YYYY-MM-DD-step-9-e2e.md`

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/data-model.md`: `narration_timestamps`, its triggers, the `timestamps` stage, the derived states
- [ ] 10.2 `docs/api-spec.yml`: regenerate from `GET /docs/json` and review the diff
- [ ] 10.3 `docs/backend-standards.md`: the alignment adapter and the usability rule, if not already covered

## 11. Close out

- [ ] 11.1 Comment on JOS-136 (call `obtainNarrationTimestamps` when a narration completes; the raw native-timestamps format assumed; `deriveSessionState` now has `voice-over-complete`), JOS-140 (read the stored timestamps), JOS-156 (the retry rule) and JOS-165 (the 5 s alignment limit observed on a longer clip)
- [ ] 11.2 Update Linear with progress, decisions and agreements on the tickets touched
- [ ] 11.3 Open the PR (against `feature/entrega-2-JAME` once PR #10 has merged, otherwise stacked on it) linking to JOS-139
- [ ] 11.4 Get a review from at least one human
- [ ] 11.5 Archive the OpenSpec change after merge
