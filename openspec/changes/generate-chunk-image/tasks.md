# Tasks — Generate a chunk's image

Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every requirement scenario in `specs/chunk-image-generation/spec.md` has at least one functional test. Automated tests use the stubbed provider only.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/generate-chunk-image` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations this phase stands on

- [ ] 1.1 Confirm `decompose-script-into-chunks` has landed; chunks exist with a non-empty `IMAGE` instruction
- [ ] 1.2 Confirm `define-backend-stack`, `define-persistence` have landed; take framework, store and stubbed-provider convention from `docs/backend-standards.md` / `docs/data-model.md`
- [ ] 1.3 Confirm `define-provider-configuration` has landed; locate the image provider id and its not-retryable signal
- [ ] 1.4 Confirm `bounded-retry-policy` and `stage-execution-time-limit` have landed, and locate the phase-launch gate `generate-voice-over` established, to extend rather than reimplement
- [ ] 1.5 If any of the above is missing, stop and record the blocker rather than building against a guess

## 2. Persistence: chunk image fields and stage instance (TDD)

- [ ] 2.1 Write a failing test for `Chunk.image_result_path` (nullable until success)
- [ ] 2.2 Write a failing test for a `StageExecution` row keyed `(session, chunk, stage=image)`, independent of any other chunk's or stage's budget
- [ ] 2.3 Add the migration, implement the repository changes
- [ ] 2.4 Run the group 2 tests and confirm they pass

## 3. Provider port and adapter (TDD)

- [ ] 3.1 Define the `ImageProvider` port: generate from a text instruction, returning either image bytes or a temporary link, and failing with a classified error
- [ ] 3.2 Extend the stubbed provider from `define-backend-stack` with scenarios: success (bytes), success (temporary link), transient failure, not-retryable failure, sub-1920×1080 result
- [ ] 3.3 Write failing classification tests for the real adapter, one per not-retryable signal recorded by `define-provider-configuration`
- [ ] 3.4 Implement the real adapter, reading the credential from the local environment or the local secrets file only

## 4. Application: image generation phase (TDD)

- [ ] 4.1 Write a failing test that a chunk with an `IMAGE` instruction launches generation with no User action, chunk `image-generating` before the request is sent
- [ ] 4.2 Write a failing test that a returned image below 1920×1080 or not 16:9 is rejected and recorded as a failed attempt
- [ ] 4.3 Write a failing test that a temporary-link result is downloaded and stored in the project folder before the stage is marked `image-complete`
- [ ] 4.4 Write a failing test that a download failure after a successful provider response is recorded as a failed attempt, chunk not reaching `image-complete`
- [ ] 4.5 Write a failing test that success records `image_result_path` and sets `image-complete`
- [ ] 4.6 Write a failing test that a video-generation request is refused for a chunk not in `image-complete`
- [ ] 4.7 Write a failing test that one chunk's image failure does not change any other chunk's processing
- [ ] 4.8 Implement the phase, wired to `stage-retry-policy`, `stage-execution-time-limit` and the shared phase-launch gate
- [ ] 4.9 Publish each state change to the live-update mechanism, matching `consult-session`'s expected shape
- [ ] 4.10 Run the group 4 tests and confirm they pass

## 5. Application: visual correction (TDD)

- [ ] 5.1 Write a failing test that a failed image stage accepts a retry with the same `IMAGE` instruction
- [ ] 5.2 Write a failing test that a failed image stage accepts a replacement `IMAGE` instruction and retries with it
- [ ] 5.3 Write a failing test that no operation offers `IMAGE` correction when the stage is not `failed`
- [ ] 5.4 Write a failing test that a correction request cannot alter `ID`, `PROMPT`, or scene order even if it attempts to
- [ ] 5.5 Implement the correction action as a variant of `stage-retry-policy`'s manual retry (design.md Decision 3)
- [ ] 5.6 Run the group 5 tests and confirm they pass

## 6. API: session representation exposes image results

- [ ] 6.1 Write a failing test that a chunk's representation includes its image stage status, provider, attempts, and (if failed) cause and retryability
- [ ] 6.2 Write a failing test that a completed chunk's image is downloadable individually while other chunks are processing or failed
- [ ] 6.3 Write a failing test that a provider error's raw payload/credentials never reach the exposed cause
- [ ] 6.4 Add the fields and the download route to the session/chunk read consumed by `consult-session`
- [ ] 6.5 Write a failing test that an image result is never returned for a chunk of a different session than requested
- [ ] 6.6 Run the group 6 tests and confirm they pass

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review `decompose-script-into-chunks` tests for any assumption that nothing launches after decomposition, and update for the automatic image launch
- [ ] 7.2 Confirm every scenario in `specs/chunk-image-generation/spec.md` has at least one functional test
- [ ] 7.3 Confirm module test coverage has not decreased
- [ ] 7.4 Document the test command

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test state of the store and the project folders on disk
- [ ] 8.2 Run the targeted tests for this module and capture the pass/fail summary
- [ ] 8.3 Run the full suite and record totals, failures and runtime
- [ ] 8.4 Verify the post-test state matches the baseline, restoring the store and removing any test images left behind
- [ ] 8.5 Create the report `openspec/changes/generate-chunk-image/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the backend wired to the stubbed image provider and confirm it is reachable
- [ ] 9.2 POST a valid project through decomposition; GET the session and verify chunks progress to `image-complete` with a downloadable image
- [ ] 9.3 With the stub set to reject as not retryable, verify the affected chunk reaches `failed` while sibling chunks keep processing
- [ ] 9.4 Correct the failed chunk's `IMAGE` and retry; verify a new attempt is made and `ID`/`PROMPT`/order are unchanged
- [ ] 9.5 Verify on disk that a temporary-link result was persisted as a local file before being reported complete
- [ ] 9.6 Delete the sessions and files created above and confirm the store and disk match the pre-test state
- [ ] 9.7 Save the transcript as `openspec/changes/generate-chunk-image/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: if the session page can render chunk images and the correction form, run the steps below; otherwise record why not
- [ ] 10.2 Ensure backend (with the stubbed provider) and frontend are running
- [ ] 10.3 Start a project and assert the session page shows chunk images appearing as they complete, without reloading
- [ ] 10.4 Force one chunk to fail, correct its `IMAGE` through the UI, and assert it recovers
- [ ] 10.5 Restore the environment and save the report as `openspec/changes/generate-chunk-image/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Add `Chunk.image_result_path` and the `image` stage instance to `docs/data-model.md`
- [ ] 11.2 Add the image fields, correction endpoint and download route to `docs/api-spec.yml`
- [ ] 11.3 Record the provider port/adapter convention for image generation in `docs/backend-standards.md`, if not already documented there

## 12. Close out

- [ ] 12.1 Confirm with `decompose-script-into-chunks` that chunk fields (`ID`, `PROMPT`, order) remain untouched by this story's correction path
- [ ] 12.2 Record for `generate-chunk-video` exactly how `image-complete` is exposed, so it can gate on it directly
- [ ] 12.3 Open the PR with a description linking to this change
- [ ] 12.4 Obtain review by at least one human, not only AI agents
- [ ] 12.5 Archive the OpenSpec change after merge
