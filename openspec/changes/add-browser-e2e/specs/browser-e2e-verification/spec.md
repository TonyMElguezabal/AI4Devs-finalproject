## ADDED Requirements

### Requirement: Browser test of the User's main flow
The repository SHALL contain a Playwright test that opens the frontend in a real browser, creates a session from a title, a script and a language, waits for the session to reach the final video, and downloads that video. The test SHALL run against the real backend and the real frontend, with every provider stubbed, so it sends no request to any provider and needs no provider key.

#### Scenario: A session runs from the page to its downloaded video
- **WHEN** the test submits the start form with a title, a script of at most 19 characters and the language `en`
- **THEN** the page shows the session, all four phases (voice-over, decomposition, scenes, assembly) end as complete, and the final-video link downloads a non-empty file

#### Scenario: No provider is called
- **WHEN** the test runs on a machine without `.secrets.json` or provider environment variables
- **THEN** it passes, and the backend's log shows only stub providers

### Requirement: The test is isolated from the developer's data
The test SHALL start its own backend on scratch folders for the database, the projects and the settings and secrets files, and SHALL remove them when it ends. It MUST NOT read or write `backend/data/` or `backend/.secrets.json`, and MUST NOT reuse a server already running on its ports.

#### Scenario: The developer's data is untouched
- **WHEN** the test has run
- **THEN** the top-level entries and modification times of `backend/data/` are the same as before, and the scratch folders no longer exist

#### Scenario: A server already on a port
- **WHEN** another process listens on the frontend or backend port of the test
- **THEN** the test fails at start-up naming the port, and does not run against that server

### Requirement: CI runs the browser test
The CI workflow SHALL run the browser test as its own job on every pull request into the branches CI already covers and on every push it already covers, and a failure SHALL fail the check. A failed run SHALL upload the Playwright report and trace as a build artifact.

#### Scenario: A pull request that breaks the page
- **WHEN** a change makes the start form unable to create a session
- **THEN** the `e2e` job fails and its report shows the step that failed

#### Scenario: A green run
- **WHEN** the test, lint, typecheck and secrets jobs pass and the browser test passes
- **THEN** the pull request's checks are all green
