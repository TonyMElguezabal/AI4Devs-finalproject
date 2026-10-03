# Tasks — Assemble the final video from completed scenes

Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every requirement scenario in `specs/final-video-assembly/spec.md` has at least one functional test. Automated tests use a stand-in for the assembly tool until `define-media-assembly` lands (design.md Open Question 2).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/assemble-final-video` from `main`
- [x] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations this phase stands on

- [x] 1.1 Confirm `generate-chunk-video` has landed; chunks reach `chunk-complete` with recorded result paths, requested durations and speed factors
- [x] 1.2 Confirm `define-backend-stack`, `define-persistence` have landed
- [x] 1.3 Confirm `define-media-assembly` status; if landed, take the chosen assembly tool from its ADR; if not, use a documented stand-in and record the dependency explicitly, per design.md
- [x] 1.4 Confirm `bounded-retry-policy`, `stage-execution-time-limit`, and the shared phase-launch gate are available to extend
- [x] 1.5 If any of 1.1, 1.2, or 1.4 is missing, stop and record the blocker rather than building against a guess

## 2. Domain: all-scenes-complete gate (TDD)

- [x] 2.1 Write a failing test that assembly launches only when every chunk of a session is `chunk-complete`
- [x] 2.2 Write a failing test that assembly does not launch while any chunk is `failed` or still processing
- [x] 2.3 Write a failing test that the check re-evaluates on every chunk-completion event (design.md Decision 1), not on a poll
- [x] 2.4 Implement the gate as a listener on chunk-completion events, launching through the shared phase-launch gate

## 3. Persistence: session assembly fields and stage instance (TDD)

- [x] 3.1 Write a failing test for `Session.final_video_path` (nullable until success)
- [x] 3.2 Write a failing test for a `StageExecution` row keyed `(session, stage=assembly)`, with a nullable `provider` field (design.md Decision 5)
- [x] 3.3 Add the migration if needed, implement the repository changes
- [x] 3.4 Run the group 3 tests and confirm they pass

## 4. Assembly tool port and adapter (TDD)

- [x] 4.1 Define the `AssemblyTool` port: given an ordered list of (clip path, narration start, narration duration) and the voice-over path, produce one output file, failing with a classified error
- [x] 4.2 Implement a stand-in/stub satisfying the port for tests (per design.md Open Question 2), with scenarios for success, transient failure, and not-retryable failure
- [x] 4.3 Once `define-media-assembly` lands, implement the real adapter against its chosen tool

## 5. Application: assembly phase (TDD)

- [x] 5.1 Write a failing test that clips are ordered by ascending `sequence_number`, independent of completion order
- [x] 5.2 Write a failing test that each clip's placement comes from its chunk's persisted `narration_start_seconds`/`narration_duration_seconds`, never recomputed from the clip's measured duration (design.md Decision 2)
- [x] 5.3 Write a failing test that each clip's own audio is discarded and the output's only audio track is the voice-over
- [x] 5.4 Write a failing test that the output is produced at the hardcoded format (H.264/AAC, expected resolution/frame rate) regardless of any per-session input
- [x] 5.5 Write a failing test that the result covers the complete narration and every scene with no omission, duplication, or gap, for a session with N chunks
- [x] 5.6 Write a failing test that a successful assembly persists the file, sets `final-video`, and makes it downloadable
- [x] 5.7 Write a failing test that a failed assembly attempt writes only to the `assembly` stage instance and, on later success, to `Session.final_video_path` — never to any `Chunk` or voice-over record (design.md Decision 4)
- [x] 5.8 Write a failing test that a retried assembly reuses the same voice-over, images, and clips without regenerating any of them
- [x] 5.9 Implement the phase, wired to `stage-retry-policy`, `stage-execution-time-limit`, and the group 2 launch gate
- [x] 5.10 Publish each state change to the live-update mechanism, matching `consult-session`'s expected shape
- [x] 5.11 Run the group 5 tests and confirm they pass

## 6. API: session representation exposes the final video

- [x] 6.1 Write a failing test that a session's representation includes the final video download route only once in `final-video`
- [x] 6.2 Write a failing test that a failed assembly is exposed with cause and retryability, phase `assembly`
- [x] 6.3 Write a failing test that no route ever serves the MP3, timestamps, or generated texts, regardless of session state
- [x] 6.4 Add the fields and the download route to the session read consumed by `consult-session`
- [x] 6.5 Run the group 6 tests and confirm they pass

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review `generate-chunk-video` tests for any assumption that nothing launches after all chunks complete, and update for the automatic assembly launch
- [x] 7.2 Confirm every scenario in `specs/final-video-assembly/spec.md` has at least one functional test
- [x] 7.3 Confirm module test coverage has not decreased
- [x] 7.4 Document the test command

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test state of the store and the project folders on disk
- [ ] 8.2 Run the targeted tests for this module and capture the pass/fail summary
- [ ] 8.3 Run the full suite and record totals, failures and runtime
- [ ] 8.4 Verify the post-test state matches the baseline, restoring the store and removing any test videos left behind
- [ ] 8.5 Create the report `openspec/changes/assemble-final-video/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the backend wired to the stand-in assembly tool and confirm it is reachable
- [ ] 9.2 POST a valid project through every chunk reaching `chunk-complete`; GET the session and verify it reaches `final-video` with a downloadable file
- [ ] 9.3 Verify the downloaded file's audio track is the voice-over only, and that its scenes are in ascending `sequence_number` order
- [ ] 9.4 With one chunk forced to `failed`, verify the session never reaches `final-video-generating`
- [ ] 9.5 With the assembly stand-in set to fail, verify the session's voice-over and completed chunks are unchanged, then retry and verify success without regeneration
- [ ] 9.6 Verify no route returns the MP3, timestamps, or generated texts at any session state
- [ ] 9.7 Delete the sessions and files created above and confirm the store and disk match the pre-test state
- [ ] 9.8 Save the transcript as `openspec/changes/assemble-final-video/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: if the session page can show `final-video` and offer the download, run the steps below; otherwise record why not
- [ ] 10.2 Ensure backend (with the assembly stand-in) and frontend are running
- [ ] 10.3 Start a project end to end and assert the session page shows the final video becoming available, without reloading, once every scene completes
- [ ] 10.4 Restore the environment and save the report as `openspec/changes/assemble-final-video/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Add `Session.final_video_path` and the `assembly` stage instance to `docs/data-model.md`
- [ ] 11.2 Add the final-video download route and the assembly failure fields to `docs/api-spec.yml`
- [ ] 11.3 Record the assembly contract (ordering, interval trust, audio replacement, fixed format) in `docs/backend-standards.md`, if not already documented there

## 12. Close out

- [ ] 12.1 Confirm with `generate-chunk-video` that chunk and voice-over records remain untouched by any assembly attempt, successful or failed
- [ ] 12.2 Record that this is the MVP flow's terminal producing story — no downstream story consumes its output within the MVP
- [ ] 12.3 Open the PR with a description linking to this change
- [ ] 12.4 Obtain review by at least one human, not only AI agents
- [ ] 12.5 Archive the OpenSpec change after merge
