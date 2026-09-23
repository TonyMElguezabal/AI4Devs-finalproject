# Tasks — Consult a session by its identifier

Group 1 is a hard gate: the foundations this story stands on must have landed before any code is written. Tests come first throughout: each behaviour gets a failing test before the code that satisfies it, and every requirement scenario has at least one functional test.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-135-consult-session` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations

- [ ] 1.1 Confirm `start-video-project` (JOS-134) has landed and sessions can be registered
- [ ] 1.2 Confirm `define-backend-stack` (JOS-179) has landed; take the framework, validation approach and API conventions from `docs/backend-standards.md`
- [ ] 1.3 Confirm `define-persistence` (JOS-181) has landed; take the session and scene records and the project-folder reference from `docs/data-model.md`
- [ ] 1.4 Confirm `define-frontend-stack` (JOS-180) has landed; take the framework, routing and accessible naming convention from `docs/frontend-standards.md`
- [ ] 1.5 Confirm `define-live-updates` (JOS-183) has landed; locate the session and scene payload shapes and the snapshot-read contract (Decision 1)
- [ ] 1.6 If any of the above is missing, stop and record the blocker rather than building against a guess

## 2. Backend: data access scoped by session (TDD)

- [ ] 2.1 Write a failing test that two sessions with the same title each return only their own scenes
- [ ] 2.2 Write a failing test that two sessions each with a scene ID 1 return only their own scene 1
- [ ] 2.3 Write a failing test that a file reference resolving outside the session's project folder is refused
- [ ] 2.4 Implement repository reads that require the session identifier, keyed by `(sessionId, sceneId)` (Decision 2)
- [ ] 2.5 Implement file-reference resolution against the session's recorded folder, refusing paths outside it
- [ ] 2.6 Run the group 2 tests and confirm they pass

## 3. Backend: the session read (TDD)

- [ ] 3.1 Write a failing test that `GET /api/sessions/{sessionId}` returns title, script, language, state, paused marker, creation time and scenes
- [ ] 3.2 Write a failing test that the returned script is identical to the stored script
- [ ] 3.3 Write a failing test that a session with no scenes returns an empty scene list, not an error
- [ ] 3.4 Write a failing test that scenes are returned in ascending identifier order when they completed out of order (Decision 3)
- [ ] 3.5 Write failing tests that an unknown identifier and a malformed identifier both return the not-found response, with no other session's data (Decision 4)
- [ ] 3.6 Write a failing test that no MP3, timestamp or generated-text path or content appears in the response (Decision 7)
- [ ] 3.7 Write a failing test that the request needs no credential or authentication header
- [ ] 3.8 Write a failing test that a session with an old creation time is returned normally (§12.2)
- [ ] 3.9 Write a failing test that the session and scene fields match the payload shapes from `define-live-updates` (Decision 1)
- [ ] 3.10 Implement the read, reusing the payload shapes from JOS-183 rather than restating them
- [ ] 3.11 Validate the identifier on the way in and the representation on the way out (Decision 8)
- [ ] 3.12 Run the group 3 tests and confirm they pass

## 4. Frontend: the session page (TDD)

- [ ] 4.1 Write failing component tests that the page shows title, script, state and the available results for a session
- [ ] 4.2 Write a failing component test that a session with no scenes shows "not yet available" rather than an error (Decision 6)
- [ ] 4.3 Write a failing component test that scenes render in the order received
- [ ] 4.4 Write a failing component test that the not-found state is shown with a way to start a new project
- [ ] 4.5 Add the session page at an address containing the identifier (Decision 5)
- [ ] 4.6 Change the start form so a successful registration navigates to the session page
- [ ] 4.7 Load through the session read and expose one seam for US-18 to attach live updates, without subscribing here
- [ ] 4.8 Apply the accessible naming convention from the frontend standards to every region, heading and message
- [ ] 4.9 Run the group 4 tests and confirm they pass

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Update `start-video-project` tests that assert the identifier is only displayed, to cover the navigation to the session page
- [ ] 5.2 Update `generate-voice-over` tests that stubbed the session read, to use the real read
- [ ] 5.3 Confirm every scenario in `specs/session-consultation/spec.md` has at least one functional test
- [ ] 5.4 Confirm module test coverage has not decreased

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test state of the store (session and scene counts) and project folders on disk
- [ ] 6.2 Run the targeted tests for this module and capture the pass/fail summary
- [ ] 6.3 Run the full suite and record totals, failures and runtime
- [ ] 6.4 Verify the post-test state matches the baseline, restoring the store and removing test folders if needed
- [ ] 6.5 Create the report `openspec/changes/consult-session/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 6.6 Mark this step complete only after the tests pass and the report file exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the backend and confirm it is reachable
- [ ] 7.2 Capture the pre-test session count
- [ ] 7.3 Create two sessions with the same title through the start endpoint
- [ ] 7.4 GET each by identifier; verify status, fields, byte-identical script, and that each returns only its own data
- [ ] 7.5 GET an unknown identifier and a malformed one; verify both return the not-found response with no other session's data
- [ ] 7.6 Verify the response contains no MP3, timestamp or generated-text path
- [ ] 7.7 Verify no authentication header is required
- [ ] 7.8 Delete the sessions created above and confirm the store matches its pre-test state
- [ ] 7.9 Save the transcript as `openspec/changes/consult-session/reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md`

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Ensure backend and frontend are running from their documented commands
- [ ] 8.2 Start a project through the form and assert the browser lands on the session page for its identifier
- [ ] 8.3 Assert the title, the script and the current state are shown
- [ ] 8.4 Reopen the same address in a new page and assert the same session is shown
- [ ] 8.5 Start a second project with the same title and assert each page shows only its own session
- [ ] 8.6 Open the page for an unknown identifier and assert the not-found message and the way to start a new project
- [ ] 8.7 Confirm every interaction located its target through the accessibility tree, with no test-only selectors
- [ ] 8.8 Delete the sessions created, restore the environment, and save the report as `openspec/changes/consult-session/reports/YYYY-MM-DD-step-8-e2e-playwright.md`

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 Add `GET /api/sessions/{sessionId}` to `docs/api-spec.yml` with the session and scene schemas and the not-found response, and confirm it matches what the implementation returns
- [ ] 9.2 Record in `docs/backend-standards.md` that every data-access method takes the session identifier, and that file references are resolved against the session folder
- [ ] 9.3 Record the session page route in `docs/frontend-standards.md`
- [ ] 9.4 Confirm `docs/data-model.md` states that scenes are keyed by session and scene identifier

## 10. Close out

- [ ] 10.1 Record the missing project-list screen as a product question for the owner (design open question 1)
- [ ] 10.2 Record for US-18 where the live-update seam on the session page lives
- [ ] 10.3 Open the PR with a description linking to JOS-135
- [ ] 10.4 Obtain review by at least one human, not only AI agents
- [ ] 10.5 Archive the OpenSpec change after merge
