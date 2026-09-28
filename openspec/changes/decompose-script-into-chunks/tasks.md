# Tasks — Decompose the script into chunks with their visual instructions

Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every requirement scenario in `specs/script-decomposition/spec.md` has at least one functional test. Automated tests use the stubbed providers only.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/decompose-script-into-chunks` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations this phase stands on

- [ ] 1.1 Confirm `start-video-project` has landed and sessions are registered in `submitted`
- [ ] 1.2 Confirm `generate-voice-over` has landed; sessions reach `voice-over-complete` with an MP3, a duration, and a recorded native-timestamp availability flag
- [ ] 1.3 Confirm `define-backend-stack` has landed; take the framework, layering, validation approach and stubbed-provider convention from `docs/backend-standards.md`
- [ ] 1.4 Confirm `define-persistence` has landed; take the store and migration approach from `docs/data-model.md`
- [ ] 1.5 Confirm `define-provider-configuration` has landed; locate the reasoning and alignment provider ids, the video provider's admitted durations and maximum, and the hardcoded segmentation lower bound in the constants module
- [ ] 1.6 Confirm `bounded-retry-policy` and `stage-execution-time-limit` have landed, and locate their stage-instance and retry-hook interfaces to extend rather than reimplement
- [ ] 1.7 If any of the above is missing, stop and record the blocker rather than building against a guess

## 2. Domain: chunk and stage-instance model (TDD)

- [ ] 2.1 Write failing tests for the `Chunk` value: `sequence_number`, `prompt`, `image_instruction`, `video_instruction`, `narration_start_seconds`, `narration_duration_seconds`, `status`
- [ ] 2.2 Write failing tests that `sequence_number` is immutable once assigned
- [ ] 2.3 Write failing tests for the session state transition `voice-over-complete → chunk-decomposing`, and that every other transition out of `chunk-decomposing` besides its designated success/failure paths is refused
- [ ] 2.4 Implement the `Chunk` value and the state transition, then run the group 2 tests and confirm they pass

## 3. Persistence: chunks and stage-instance records (TDD)

- [ ] 3.1 Write a failing test that chunks are persisted with their session, in ascending `sequence_number` order
- [ ] 3.2 Write failing tests for two `StageExecution` rows per session (`stage_name = timestamps`, `stage_name = decomposition`), each with its own provider, attempts, status and error, per the entities in `readme.md` §3
- [ ] 3.3 Add the migration for the `Chunk` table and the two decomposition-related stage instances
- [ ] 3.4 Implement the repositories for chunks and stage instances
- [ ] 3.5 Run the group 3 tests and confirm they pass

## 4. Provider ports and adapters: reasoning and alignment (TDD)

- [ ] 4.1 Define the `ReasoningProvider` port: split a script into sentence-level narrated spans and generate `IMAGE`/`VIDEO` instructions per chunk, failing with a classified error
- [ ] 4.2 Define the `AlignmentProvider` port: align an MP3 against a script to produce timestamps, failing with a classified error
- [ ] 4.3 Extend the stubbed providers from `define-backend-stack` to implement both ports, with scenarios for success, transient failure, and not-retryable failure
- [ ] 4.4 Write failing classification tests for each real adapter, one per not-retryable signal recorded by `define-provider-configuration`
- [ ] 4.5 Implement the real adapters, reading credentials from the local environment or the local secrets file only

## 5. Application: timestamps sub-phase (TDD)

- [ ] 5.1 Write a failing test that reaching `voice-over-complete` launches the `timestamps` stage instance without further User action
- [ ] 5.2 Write a failing test that usable native timestamps are used directly, without calling the alignment provider
- [ ] 5.3 Write a failing test that missing or unusable native timestamps trigger a call to the alignment provider with the MP3 and the script, and never call the voice provider again
- [ ] 5.4 Write a failing test that a `timestamps` failure (either mechanism) is classified as a decomposition failure, not a voice failure
- [ ] 5.5 Implement the timestamps sub-phase, wired to `stage-retry-policy` and `stage-execution-time-limit` as its own stage instance
- [ ] 5.6 Run the group 5 tests and confirm they pass

## 6. Application: segmentation algorithm and edge cases (TDD)

- [ ] 6.1 Write failing tests for ordinary segmentation: sentence-boundary cuts only, each chunk's narrated duration within the admitted bounds, and the closest-admitted-duration preference among valid groupings
- [ ] 6.2 Write a failing test for the clause-boundary exception when one sentence alone exceeds the upper bound
- [ ] 6.3 Write a failing test for the whole-script-below-lower-bound edge case (single chunk)
- [ ] 6.4 Write a failing test for the short-sentence-borrows-from-next edge case
- [ ] 6.5 Write a failing test for the no-clause-boundary edge case: chunk kept whole, speed-factor warning recorded, no failure
- [ ] 6.6 Implement the segmentation algorithm per design.md Decision 2 and Decision 3 (one grouping loop with guard clauses, operating on narrated-second spans)
- [ ] 6.7 Run the group 6 tests and confirm they pass

## 7. Application: visual instructions and result invariants (TDD)

- [ ] 7.1 ~~Instructions for every chunk~~ moved to `assign-scene-identifiers` (JOS-144); hand the ordered fragments to its `registerDecomposition` instead
- [ ] 7.2 ~~Script reconstruction~~ moved to `assign-scene-identifiers` (JOS-144)
- [ ] 7.3 ~~Reconstruction mismatch as a system defect~~ moved to `assign-scene-identifiers` (JOS-144)
- [ ] 7.4 Write a failing test that the narration intervals form a contiguous, non-overlapping partition from 0 to the voice-over's total duration
- [ ] 7.5 Write a failing test that a gap or overlap fails decomposition as a system defect (the incomplete-chunk check moved to `assign-scene-identifiers` (JOS-144))
- [ ] 7.6 Implement the post-condition checks per design.md Decision 4, run after segmentation and instruction generation, before the `decomposition` stage instance can succeed
- [ ] 7.7 Write failing tests for the two manual-retry routes: `timestamps` retry with unusable-native-timestamps history goes straight to alignment; `decomposition` retry re-splits the same script and timestamps without touching the voice-over
- [ ] 7.8 Implement both manual-retry routes, reusing `stage-retry-policy`'s manual-retry mechanism
- [ ] 7.9 Publish each state change to the live-update mechanism, matching the shape `consult-session`'s resynchronisation read expects
- [ ] 7.10 Run the group 7 tests and confirm they pass

## 8. API: session representation exposes chunks

- [ ] 8.1 Write a failing test that a session's representation includes its chunks in ascending `sequence_number` order once decomposition completes
- [ ] 8.2 Write a failing test that a failed `timestamps` or `decomposition` stage instance is exposed with its cause, retryability and stage name, consistent with `stage-retry-policy`'s exposed shape
- [ ] 8.3 Add the fields to the session read consumed by `consult-session`, validating the response with the approach from the backend standards

## 9. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 9.1 Review `generate-voice-over` tests that assert nothing launches after `voice-over-complete`, and update them for the automatic decomposition launch
- [ ] 9.2 Confirm every scenario in `specs/script-decomposition/spec.md` has at least one functional test
- [ ] 9.3 Confirm module test coverage has not decreased
- [ ] 9.4 Document the test command

## 10. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 10.1 Capture the pre-test state of the store (session, chunk and stage-instance counts)
- [ ] 10.2 Run the targeted tests for this module and capture the pass/fail summary
- [ ] 10.3 Run the full suite and record totals, failures and runtime
- [ ] 10.4 Verify the post-test state matches the baseline, restoring the store
- [ ] 10.5 Create the report `openspec/changes/decompose-script-into-chunks/reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md`
- [ ] 10.6 Mark this step complete only after the tests pass and the report file exists

## 11. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Start the backend wired to the stubbed reasoning, voice and alignment providers and confirm it is reachable
- [ ] 11.2 POST a valid project with a script exercising a normal segmentation; GET the session and verify it passes through `chunk-decomposing` and reaches the chunk list with correct `sequence_number`, `PROMPT`, `IMAGE`, `VIDEO` and intervals
- [ ] 11.3 Repeat with a script engineered to trigger each of the three §6.1.1 edge cases; verify the expected chunking and, for the no-clause-boundary case, the recorded speed-factor warning
- [ ] 11.4 With the alignment stub set to fail, and native timestamps unavailable, verify the session reaches `failed` with phase `timestamps` (not `voice-over`)
- [ ] 11.5 Verify a manual retry of a failed `timestamps` instance whose native timestamps were unusable calls only the alignment provider
- [ ] 11.6 Delete the sessions and records created above and confirm the store matches the pre-test state
- [ ] 11.7 Save the transcript as `openspec/changes/decompose-script-into-chunks/reports/YYYY-MM-DD-step-11-curl-endpoint-testing.md`

## 12. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 12.1 Decide applicability: if the session page from `consult-session` exists and can render a chunk list, run the steps below; otherwise record in the report that E2E is not applicable and why
- [ ] 12.2 Ensure backend (with the stubbed providers) and frontend are running
- [ ] 12.3 Start a valid project through the form and assert the session page shows the chunk list appearing, in ascending order, once decomposition completes
- [ ] 12.4 Restore the environment and save the report as `openspec/changes/decompose-script-into-chunks/reports/YYYY-MM-DD-step-12-e2e-playwright.md`

## 13. Update Technical Documentation (MANDATORY)

- [ ] 13.1 Add the `Chunk` entity and the two decomposition stage-instance records to `docs/data-model.md`
- [ ] 13.2 Add the chunk list and decomposition failure fields to the session schema in `docs/api-spec.yml`, and confirm it matches what the implementation returns
- [ ] 13.3 Record the segmentation algorithm's shape (Decision 2/3 from `design.md`) in `docs/backend-standards.md`, if not already documented there

## 14. Close out

- [ ] 14.1 Confirm with `generate-voice-over` where the transition out of `voice-over-complete` is implemented only here
- [ ] 14.2 Record for the image- and video-generation stories where `chunks-processing` is launched from, so they extend the phase-launch gate rather than re-derive it
- [ ] 14.3 Open the PR with a description linking to this change
- [ ] 14.4 Obtain review by at least one human, not only AI agents
- [ ] 14.5 Archive the OpenSpec change after merge
