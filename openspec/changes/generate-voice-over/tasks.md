# Tasks — Generate the full voice-over

The first story that calls a real provider. Group 1 is a hard gate: the foundations this story stands on must have landed before any code is written. The voice provider's input limit is not a gate: the product owner decided there is none (task 1.5).

Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every requirement scenario has at least one functional test. Automated tests use the stubbed provider only.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-136-generate-voice-over` from `feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`)
- [x] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations

- [x] 1.1 Confirm `start-video-project` (JOS-134) has landed and sessions are registered in `submitted` — confirmed: `POST /sessions` registers a session with zero scenes, state derives to `submitted` (`backend/src/routes.ts`, `orchestrator.ts`)
- [x] 1.2 Confirm `define-backend-stack` (JOS-179) has landed (confirmed: `docs/backend-standards.md`, `backend/`, Fastify + Zod, baseline `npm test` 70/70 passing); take the framework, layering, validation approach and the stubbed provider from `docs/backend-standards.md`
- [x] 1.3 Confirm `define-persistence` (JOS-181) has landed (confirmed: SQLite `db.ts`, append-only `provider_requests`, `scene_results` PK guarantee, versioned migrations, relative-path artefacts); take the store, the attempt-record shape and the migration approach from `docs/data-model.md`
- [x] 1.4 Confirm `define-provider-configuration` (JOS-165) has landed; locate the voice provider id, voice, quality and speed in the constants module, and its recorded not-retryable signal — confirmed: `VOICE_PROVIDER` in `backend/src/config/providers.ts` (ElevenLabs, `eleven_multilingual_v2`, voice `4YYIPFl9wE5c4L2eu2Gb`, `mp3_44100_128`, default speed). No content-rejection signal is recorded for voice; product owner decided on 2026-09-28 to classify by HTTP status only (design Decision 4)
- [x] 1.5 Voice input limit: resolved by the product owner on 2026-09-28 — no script-length limit (credits are the only bound, and they renew monthly); no cap and no split-and-join. Recorded in design.md Decision 5 and open question 1
- [x] 1.6 Confirm US-30 (JOS-162) provides the session's project folder; if not, stop and record the blocker rather than re-implementing the §12.2 naming rule — JOS-162 is still Backlog; product owner decided on 2026-09-28 to use the folder that `backend/src/db.ts` already creates (`deriveAndCreateProjectFolder`, `writeArtefact`, `resolveArtefactPath`, added by JOS-134). This story reuses those functions and does not change the naming rule
- [x] 1.7 Confirm the media tooling from `define-media-assembly` (JOS-182) can probe an MP3's duration (Decision 7) — confirmed: ffmpeg is the recorded media tool (`docs/backend-standards.md`, ADR 0001 C10); `ffprobe` ships with it and is installed at `/opt/homebrew/bin/ffprobe`. Its use for MP3 duration is not yet written down; task 11.3 records it
- [x] 1.8 If any of the above is missing, stop and record the blocker rather than building against a guess — nothing is missing; the gate is passed

## 2. Domain: session state machine (TDD)

- [x] 2.1 Write failing tests for the allowed transitions `submitted → voice-over-generating`, `voice-over-generating → voice-over-complete` and `voice-over-generating → failed` — `backend/test/session-state-machine.test.ts`
- [x] 2.2 Write failing tests that every other transition out of these states is refused — all 61 other pairs of the 8 session states, generated from the table
- [x] 2.3 Write a failing test that a failure carries phase `voice-over`, a cause and its retryability — also asserts `occurredAt` (design Decision 9) and refuses a blank cause
- [x] 2.4 Implement the transitions and the failure value, then run the group 2 tests and confirm they pass — `backend/src/sessionStateMachine.ts`; 70/70 new tests pass, full suite 140/140, `npm run typecheck` clean

## 3. Persistence: records and migration (TDD)

- [ ] 3.1 Write a failing test that a second voice-over for the same session is rejected by the store, including two concurrent inserts (Decision 8)
- [ ] 3.2 Write a failing test that the session's bound voice provider, once set, is not overwritten (Decision 3)
- [ ] 3.3 Add the migration: session `voiceProviderId` and `failure`; the voice-over record unique on session; the append-only stage-attempt record
- [ ] 3.4 Implement the repositories for the voice-over and attempt records
- [ ] 3.5 Run the group 3 tests and confirm they pass

## 4. Provider port and adapters (TDD)

- [ ] 4.1 Define the `VoiceProvider` port: `synthesize` with text, language, voice, quality and speed, returning audio, optional native timestamps and the provider request id, and failing with a classified error (Decision 4)
- [ ] 4.2 Extend the stubbed provider from `define-backend-stack` to implement the port, with scenarios for success with and without timestamps, transient failure, not-retryable failure, undecodable audio and duplicate confirmation
- [ ] 4.3 Write failing classification tests for the real adapter, one per HTTP status class (design Decision 4): 4xx except 408/429 → not retryable; 408, 429, 5xx, network error and timeout → transient. No content-rejection or length-limit signal is recorded, so a length refusal is tested only as a generic 4xx not-retryable response with its cause reported (no cap or split is built)
- [ ] 4.4 Implement the real adapter, reading the credential from the local environment or the local secrets file only
- [ ] 4.5 Write an opt-in contract test against the real provider (one success, one known rejection), excluded from the default test run and documented as costing money

## 5. Application: the voice-over phase (TDD)

- [ ] 5.1 Write a failing test that registering a session launches generation with no User action, and the session is `voice-over-generating` before the stub receives the request
- [ ] 5.2 Write a failing test that an `in-flight` attempt record exists while the stub hangs (Decision 2)
- [ ] 5.3 Write a failing test that the text the stub receives is identical to the stored script, including a script far beyond 1500 words, with the hardcoded voice, quality and speed and the session's language
- [ ] 5.4 Write a failing test that the first attempt binds the provider and a later attempt uses the binding
- [ ] 5.5 Write a failing test that success stores exactly one MP3 in the project folder, records the measured duration and size, and reaches `voice-over-complete`
- [ ] 5.6 Write failing tests that native timestamps are stored unmodified when returned, and that their absence is recorded
- [ ] 5.7 Write a failing test that undecodable or zero-length audio fails the attempt and does not reach `voice-over-complete`
- [ ] 5.8 Write failing tests that a not-retryable rejection records the attempt, fails the session with phase `voice-over` and its cause, stores no MP3, leaves the script unchanged and makes no retry
- [ ] 5.9 Write a failing test that a transient failure is recorded as transient and, with the default retry hook, fails the session (Decision 10)
- [ ] 5.10 Write a failing test that a missing credential sends no request and fails the session with a cause naming the credential and containing no secret
- [ ] 5.11 Write failing tests that a repeated or concurrent success confirmation stores one voice-over and launches nothing again
- [ ] 5.12 Write a failing test that requesting generation for a session in `voice-over-complete` sends nothing and leaves the MP3 unchanged
- [ ] 5.13 Implement the phase-launch gate, admitting every launch in this story, as the single entry point for US-20, US-37 and US-22 (Decision 1)
- [ ] 5.14 Implement the phase: state change, provider binding and attempt record persisted together before sending; streaming to a temporary file, then renaming into place; audio probing; recording the outcome
- [ ] 5.15 Hook registration so a committed `submitted` session is handed to the gate
- [ ] 5.16 Publish each state change to the live-update mechanism from `define-live-updates` (JOS-183)
- [ ] 5.17 Log every transition and attempt with session id, stage, provider, attempt sequence, external request id, outcome and latency; log script length and hash, never the text or a credential
- [ ] 5.18 Write a test asserting neither the script text nor a credential appears in the logs
- [ ] 5.19 Run the group 5 tests and confirm they pass

## 6. API: session representation (TDD)

- [ ] 6.1 Write a failing test that a completed session's representation carries `voiceOver` with provider, duration, native-timestamp availability and completion time
- [ ] 6.2 Write a failing test that a failed session's representation carries `failure` with phase `voice-over`, cause and retryability
- [ ] 6.3 Add the fields to the session read (US-02), validating the response with the approach from the backend standards
- [ ] 6.4 Confirm no route serves the MP3 (§12.3)

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review the `start-video-project` tests that assert a session stays in `submitted`, and update them for the automatic launch
- [ ] 7.2 Confirm every scenario in `specs/voice-over-generation/spec.md` has at least one functional test
- [ ] 7.3 Confirm module test coverage has not decreased
- [ ] 7.4 Document the test command, and the separate command for the opt-in contract test
- [x] 7.5 Make `npm run typecheck` pass: the `Record<string, unknown> | undefined` return-type error in `backend/src/config/credentials.ts` (from JOS-165) is fixed with no behaviour change, covered by the existing `credentials.test.ts`

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test state of the store (session, voice-over and attempt counts) and the project folders on disk
- [ ] 8.2 Run the targeted tests for this module and capture the pass/fail summary
- [ ] 8.3 Run the full suite and record totals, failures and runtime
- [ ] 8.4 Verify the post-test state matches the baseline, restoring the store and removing any test project folders or MP3 files left behind
- [ ] 8.5 Create the report `openspec/changes/generate-voice-over/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the backend wired to the stubbed voice provider and confirm it is reachable
- [ ] 9.2 Capture the pre-test session, voice-over and attempt counts
- [ ] 9.3 POST a valid project; GET the session and verify it passes through `voice-over-generating` and reaches `voice-over-complete` with the `voiceOver` fields populated
- [ ] 9.4 With the stub set to reject as not retryable, POST a project; GET it and verify `failed`, phase `voice-over`, the cause and `retryable: false`
- [ ] 9.5 With the stub set to fail transiently, POST a project; GET it and verify `failed` with `retryable: true`
- [ ] 9.6 Start without the voice credential, POST a project; GET it and verify the cause names the credential and contains no secret
- [ ] 9.7 Verify no route returns the MP3
- [ ] 9.8 Verify on disk that each completed session has exactly one MP3 in its own project folder
- [ ] 9.9 Delete the sessions, records and files created above and confirm the store and disk match the pre-test state
- [ ] 9.10 Save the transcript as `openspec/changes/generate-voice-over/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: this story adds no screen of its own; if the session page from US-02/US-18 exists, run the steps below, otherwise record in the report that E2E is not applicable and why
- [ ] 10.2 Ensure backend (with the stubbed provider) and frontend are running
- [ ] 10.3 Start a valid project through the form and assert the session page shows it progressing to `voice-over-complete` without reloading
- [ ] 10.4 Start a project with the stub set to reject, and assert the failure and its cause are shown
- [ ] 10.5 Restore the environment and save the report as `openspec/changes/generate-voice-over/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Add the voice-over and stage-attempt records and the new session fields to `docs/data-model.md`
- [ ] 11.2 Add `voiceOver` and `failure` to the session schema in `docs/api-spec.yml`, and confirm it matches what the implementation returns
- [ ] 11.3 Record the provider port-and-adapter convention and the phase-launch gate in `docs/backend-standards.md`, if the standards do not already define them
- [ ] 11.4 Record the logging rule for script text and credentials in `docs/backend-standards.md`

## 12. Close out

- [ ] 12.1 Confirm with `start-video-project` task 12.2 that the transition out of `submitted` is implemented only here
- [ ] 12.2 Record for US-20, US-22 and US-37 where the phase-launch gate and the retry hook live, so they extend them rather than wrap the phase
- [ ] 12.3 Record for US-05/US-06 where raw native timestamps are stored and in what form
- [ ] 12.4 Open the PR with a description linking to JOS-136
- [ ] 12.5 Obtain review by at least one human, not only AI agents
- [ ] 12.6 Archive the OpenSpec change after merge
