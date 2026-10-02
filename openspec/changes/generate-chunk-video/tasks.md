# Tasks — Generate a chunk's video clip

Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every requirement scenario in `specs/chunk-video-generation/spec.md` has at least one functional test. Automated tests use the stubbed provider only.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/generate-chunk-video` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations this phase stands on

- [ ] 1.1 Confirm `generate-chunk-image` has landed; chunks reach `image-complete` with a stored image
- [ ] 1.2 Confirm `define-backend-stack`, `define-persistence` have landed
- [ ] 1.3 Confirm `define-provider-configuration` has landed; locate the video provider id, its hardcoded discrete admitted-durations set and maximum, its not-retryable signal, and the hardcoded acceptable speed-factor limit (provisional if `define-media-assembly` has not yet measured it — record the dependency, do not block on it)
- [ ] 1.4 Confirm `bounded-retry-policy`, `stage-execution-time-limit`, and the shared phase-launch gate are available to extend
- [ ] 1.5 If any of the above is missing, stop and record the blocker rather than building against a guess

## 2. Domain: duration selection function (TDD, pure logic)

- [ ] 2.1 Write a failing test for the worked example in design.md Decision 1 (6s narrated, {5, 10}s admitted → 5s selected, not 10s)
- [ ] 2.2 Write a failing test for the exact-tie case, expecting the longer duration
- [ ] 2.3 Write a failing test for the below-minimum case, expecting the smallest admitted duration with no special-case branch (design.md Decision 2)
- [ ] 2.4 Write a failing test that the computed speed factor is always ≥ 1 (design.md Decision 3)
- [ ] 2.5 Implement the pure duration-selection function, run the group 2 tests and confirm they pass

## 3. Persistence: chunk video fields and stage instance (TDD)

- [ ] 3.1 Write failing tests for `Chunk.video_result_path`, `requested_duration_seconds`, `speed_factor`, `speed_factor_warning` (fields already modeled in `readme.md` §3; this change is the first to populate them)
- [ ] 3.2 Write a failing test for a `StageExecution` row keyed `(session, chunk, stage=video)`, independent of the chunk's image-stage budget
- [ ] 3.3 Add the migration if needed, implement the repository changes
- [ ] 3.4 Run the group 3 tests and confirm they pass

## 4. Provider port and adapter (TDD)

- [ ] 4.1 Define the `VideoProvider` port: animate an image with an instruction at a requested duration, returning clip bytes or a temporary link, failing with a classified error
- [ ] 4.2 Extend the stubbed provider with scenarios: success (bytes), success (temporary link), transient failure, not-retryable failure
- [ ] 4.3 Write failing classification tests for the real adapter, one per not-retryable signal recorded by `define-provider-configuration`
- [ ] 4.4 Implement the real adapter, reading the credential from the local environment or the local secrets file only

## 5. Application: video generation phase (TDD)

- [ ] 5.1 Write a failing test that reaching `image-complete` launches video generation with no User action, chunk `video-generating` before the request is sent
- [ ] 5.2 Write a failing test that the request carries the generated image, the `VIDEO` instruction, and the duration selected by the group 2 function
- [ ] 5.3 Write a failing test that a temporary-link result is downloaded and stored before the stage is marked `chunk-complete`
- [ ] 5.4 Write a failing test that success records `video_result_path`, `requested_duration_seconds`, `speed_factor`, and sets `chunk-complete`
- [ ] 5.5 Write a failing test that a speed factor above the hardcoded limit records `speed_factor_warning = true` without failing the stage
- [ ] 5.6 Write a failing test that a video retry reuses the existing image and requests no new one
- [ ] 5.7 Write a failing test that one chunk's video failure does not change any other chunk's processing
- [ ] 5.8 Implement the phase, wired to `stage-retry-policy`, `stage-execution-time-limit` and the shared phase-launch gate
- [ ] 5.9 Publish each state change to the live-update mechanism, matching `consult-session`'s expected shape
- [ ] 5.10 Run the group 5 tests and confirm they pass

## 6. Application: visual correction (TDD)

- [ ] 6.1 Write a failing test that a failed video stage accepts a retry with the same `VIDEO` instruction, reusing the existing image
- [ ] 6.2 Write a failing test that a failed video stage accepts a replacement `VIDEO` instruction and retries with it
- [ ] 6.3 Write a failing test that no operation offers `VIDEO` correction when the stage is not `failed`
- [ ] 6.4 Write a failing test that a correction request cannot alter `ID`, `PROMPT`, `IMAGE`, or scene order
- [ ] 6.5 Implement the correction action, reusing `generate-chunk-image`'s correction-as-manual-retry pattern
- [ ] 6.6 Run the group 6 tests and confirm they pass

## 7. API: session representation exposes video results

- [ ] 7.1 Write a failing test that a chunk's representation includes its video stage status, requested duration, speed factor, and speed-factor warning
- [ ] 7.2 Write a failing test that a completed chunk's clip is downloadable individually while other chunks are processing or failed
- [ ] 7.3 Write a failing test that a video result is never returned for a chunk of a different session than requested
- [ ] 7.4 Add the fields and the download route to the session/chunk read consumed by `consult-session`
- [ ] 7.5 Run the group 7 tests and confirm they pass

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 8.1 Review `generate-chunk-image` tests for any assumption that nothing launches after `image-complete`, and update for the automatic video launch
- [ ] 8.2 Confirm every scenario in `specs/chunk-video-generation/spec.md` has at least one functional test
- [ ] 8.3 Confirm module test coverage has not decreased
- [ ] 8.4 Document the test command

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 9.1 Capture the pre-test state of the store and the project folders on disk
- [ ] 9.2 Run the targeted tests for this module and capture the pass/fail summary
- [ ] 9.3 Run the full suite and record totals, failures and runtime
- [ ] 9.4 Verify the post-test state matches the baseline, restoring the store and removing any test clips left behind
- [ ] 9.5 Create the report `openspec/changes/generate-chunk-video/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md`
- [ ] 9.6 Mark this step complete only after the tests pass and the report file exists

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Start the backend wired to the stubbed video provider and confirm it is reachable
- [ ] 10.2 POST a valid project through image generation; GET the session and verify chunks reach `chunk-complete` with a downloadable clip and recorded `requested_duration_seconds`/`speed_factor`
- [ ] 10.3 Configure a narrated duration that exercises the Decision 1 worked example and verify the selected duration matches the smallest-speed-change rule, not the numerically closest one
- [ ] 10.4 With the stub set to reject as not retryable, verify the affected chunk reaches `failed` while its image is preserved and siblings keep processing
- [ ] 10.5 Correct the failed chunk's `VIDEO` and retry; verify the existing image is reused and `ID`/`PROMPT`/`IMAGE`/order are unchanged
- [ ] 10.6 Delete the sessions and files created above and confirm the store and disk match the pre-test state
- [ ] 10.7 Save the transcript as `openspec/changes/generate-chunk-video/reports/YYYY-MM-DD-step-10-curl-endpoint-testing.md`

## 11. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 Decide applicability: if the session page can render clips, durations, and the correction form, run the steps below; otherwise record why not
- [ ] 11.2 Ensure backend (with the stubbed provider) and frontend are running
- [ ] 11.3 Start a project and assert the session page shows chunks reaching `chunk-complete` with their speed factor shown, without reloading
- [ ] 11.4 Force one chunk's video to fail, correct its `VIDEO` through the UI, and assert it recovers without regenerating the image
- [ ] 11.5 Restore the environment and save the report as `openspec/changes/generate-chunk-video/reports/YYYY-MM-DD-step-11-e2e-playwright.md`

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 Add `Chunk.video_result_path`, `requested_duration_seconds`, `speed_factor`, `speed_factor_warning` and the `video` stage instance to `docs/data-model.md`
- [ ] 12.2 Add the video fields, correction endpoint and download route to `docs/api-spec.yml`
- [ ] 12.3 Record the duration-selection function and its worked example in `docs/backend-standards.md`, if not already documented there

## 13. Close out

- [ ] 13.1 Confirm with `generate-chunk-image` that `IMAGE` and its result remain untouched by this story's correction path
- [ ] 13.2 Record for the assembly story exactly how `chunk-complete` and the per-chunk result paths are exposed, so it can consume them directly
- [ ] 13.3 Open the PR with a description linking to this change
- [ ] 13.4 Obtain review by at least one human, not only AI agents
- [ ] 13.5 Archive the OpenSpec change after merge
