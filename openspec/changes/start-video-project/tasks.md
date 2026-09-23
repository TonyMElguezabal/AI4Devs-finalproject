# Tasks — Start a video project from a title, a script, and its language

The project's first implementation story. Group 1 is a hard gate: four spikes must have landed before any code is written, and none of them had at the time these artifacts were created.

Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every acceptance criterion has at least one functional test.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-134-start-video-project` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations this story stands on

- [ ] 1.1 Confirm `define-backend-stack` (JOS-179) has landed, and take the framework, validation approach and project structure from `docs/backend-standards.md`
- [ ] 1.2 Confirm `define-persistence` (JOS-181) has landed, and take the store and the session record shape from `docs/data-model.md`
- [ ] 1.3 Confirm `define-frontend-stack` (JOS-180) has landed, and take the framework, the start command and the accessible naming convention from `docs/frontend-standards.md`
- [ ] 1.4 Confirm `define-provider-configuration` (JOS-165) has landed, and locate the constants module holding the supported language list
- [ ] 1.5 Determine whether a spike's skeleton was kept as the project seed; if so extend it rather than starting a second source tree
- [ ] 1.6 Take the ruling on whether the OpenAPI and validation-library expectations are binding from `define-backend-stack`, rather than re-opening it
- [ ] 1.7 If any of the above has not landed, stop and record the blocker rather than building against a guess

## 2. Backend: validation tests first (TDD)

- [ ] 2.1 Write a failing test that a non-empty title, script and supported language register a session with an identifier in state `submitted` (AC01)
- [ ] 2.2 Write a failing test that a script with no tags, delimiters or visual instructions is accepted as-is (AC02)
- [ ] 2.3 Write a failing test that an empty title starts no session, and one for an empty script (AC03)
- [ ] 2.4 Write a failing test that a whitespace-only title and a whitespace-only script each start no session (Decision 1)
- [ ] 2.5 Write a failing test that a script far longer than the 1500-word reference is not rejected for length (AC04)
- [ ] 2.6 Write a failing test that a request without a language starts no session (AC05)
- [ ] 2.7 Write a failing test that a language outside the hardcoded list is refused even when submitted directly to the endpoint (AC05, Decision 5)
- [ ] 2.8 Write a failing test that the stored script is identical to the submitted script (Decision 1)
- [ ] 2.9 Write a failing test that two identical submissions produce two sessions with different identifiers (Decision 7, §12.2)

## 3. Backend: implement registration

- [ ] 3.1 Define the session record: identifier, title, script, language, state, creation instant
- [ ] 3.2 Generate an opaque, creation-ordered identifier (Decision 3)
- [ ] 3.3 Record the creation instant at the precision the project folder name needs (Decision 4, §12.2)
- [ ] 3.4 Implement input validation with the approach the backend standards prescribe, judging emptiness on a trimmed view without storing the trimmed value (Decision 1)
- [ ] 3.5 Validate the language against the constants module from task 1.4, never against a copy (Decision 5)
- [ ] 3.6 Register the session in state `submitted` and return its identifier
- [ ] 3.7 Make the title, script and language write-once in the record, with no operation offering a path to change them (Decision 2)
- [ ] 3.8 Confirm no provider is called anywhere in this path (AC05, Decision 8)
- [ ] 3.9 Confirm the session is left at `submitted` and nothing here starts the voice-over (Decision 8)
- [ ] 3.10 Run the group 2 tests and confirm they now pass

## 4. Backend: make the absence of a size limit real

- [ ] 4.1 Determine the actual ceiling imposed by the chosen stack and store — request body size, column type, or transport limit (design open question 3)
- [ ] 4.2 Raise or remove product-side limits so no script is refused for length by our own configuration (Decision 6)
- [ ] 4.3 Where an external ceiling remains, return a response naming the cause, distinguishable from a validation refusal (§4.1)
- [ ] 4.4 Write a test asserting that response, so a generic framework error cannot silently take its place
- [ ] 4.5 Record the ceiling found, so later stories inherit the finding

## 5. API contract

- [ ] 5.1 Reset `docs/api-spec.yml` so it describes this product, scoped to what this endpoint needs rather than a full contract for the unwritten API (Decision 9)
- [ ] 5.2 Document the start-project endpoint: request, success response carrying the identifier and state, and each refusal case
- [ ] 5.3 Confirm the documented shapes match what the implementation returns, rather than what it was intended to return

## 6. Frontend: the start form

- [ ] 6.1 Build the form with title, script and language, following the frontend standards from task 1.3
- [ ] 6.2 Populate the language selector from the same source as the server, never a second list (Decision 5)
- [ ] 6.3 Prevent submission without a language, and apply the same emptiness rule the server applies (Decision 1)
- [ ] 6.4 Show the session identifier on success, so the User can return to the session (§12.3)
- [ ] 6.5 Show refusals with their cause, including the infrastructure-limit case from task 4.3
- [ ] 6.6 Apply the accessible naming convention from the frontend standards to every field, control and message
- [ ] 6.7 Write component tests for the empty-field, missing-language and successful-start cases

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Confirm which test suites exist at this point and whether any spike skeleton's tests are affected
- [ ] 7.2 Confirm every acceptance criterion AC01 to AC05 has at least one functional test
- [ ] 7.3 Confirm module test coverage has not decreased
- [ ] 7.4 Document the test command that runs them

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test state of the store (session count and key records)
- [ ] 8.2 Run the targeted tests for this module and capture the pass/fail summary
- [ ] 8.3 Run the full suite and record totals, failures and runtime
- [ ] 8.4 Verify the post-test state matches the baseline, restoring it if the tests left sessions behind
- [ ] 8.5 Create the report `openspec/changes/start-video-project/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the backend and confirm it is reachable
- [ ] 9.2 Capture the pre-test session count
- [ ] 9.3 POST a valid title, script and language; verify the status code, the returned identifier and the `submitted` state
- [ ] 9.4 POST an empty title, then an empty script; verify each is refused and no session is created
- [ ] 9.5 POST a whitespace-only title; verify it is refused
- [ ] 9.6 POST without a language, then with an unsupported language; verify both are refused
- [ ] 9.7 POST a script far longer than the 1500-word reference; verify it is accepted, or that the response names an infrastructure cause rather than a product limit
- [ ] 9.8 POST the same valid payload twice; verify two distinct sessions exist
- [ ] 9.9 Verify the stored script matches what was sent, byte for byte
- [ ] 9.10 Delete the sessions created above and confirm the store matches its pre-test state
- [ ] 9.11 Save the transcript as `openspec/changes/start-video-project/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Ensure both backend and frontend are running from their documented commands
- [ ] 10.2 Navigate to the start form with `browser_navigate` and snapshot the initial state
- [ ] 10.3 Assert the language selector offers only the hardcoded supported languages
- [ ] 10.4 Attempt to start without a language and assert no session is created
- [ ] 10.5 Attempt to start with an empty title, then an empty script, asserting each is refused with its reason shown
- [ ] 10.6 Start a valid project and assert the identifier is shown to the User
- [ ] 10.7 Verify the session exists in the store with state `submitted` and the script intact
- [ ] 10.8 Confirm every interaction located its target through the accessibility tree, with no test-only selectors
- [ ] 10.9 Delete the sessions created, restore the environment, and save the report as `openspec/changes/start-video-project/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Add the session record to `docs/data-model.md`, as the first entry describing this product's own data
- [ ] 11.2 Confirm `docs/api-spec.yml` reflects the endpoint as built
- [ ] 11.3 Record in `docs/backend-standards.md` the ceiling found in task 4.5 and how an infrastructure refusal is reported
- [ ] 11.4 Confirm the result stays consistent with what the foundation changes wrote to their standards files

## 12. Close out

- [ ] 12.1 Record the identifier-access gap: with no project-list screen specified, the identifier shown at creation is the User's route back (design open question 1)
- [ ] 12.2 Agree with the voice-over story where the transition out of `submitted` is triggered, so neither story implements it twice (design open question 2)
- [ ] 12.3 Create a follow-up for the remainder of the API contract reset, which this story scoped to one endpoint (design open question 4)
- [ ] 12.4 Open the PR with a description linking to JOS-134
- [ ] 12.5 Obtain review by at least one human, not only AI agents
- [ ] 12.6 Archive the OpenSpec change after merge
