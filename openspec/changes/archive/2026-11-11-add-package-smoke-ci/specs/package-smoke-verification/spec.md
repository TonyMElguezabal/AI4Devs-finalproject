## ADDED Requirements

### Requirement: Smoke run of the packaged executable
The repository SHALL contain a script that starts the smoke flavor of the packaged application on a scratch data folder, checks that it answers `/health` and serves the embedded page, runs one session to `final-video` through its API, downloads the final video, and stops the executable. It SHALL send no request to any provider and need no provider key.

#### Scenario: A session runs through the executable
- **WHEN** the script is run on the folder `npm run package:smoke` produced
- **THEN** it prints that the session reached `final-video` with a non-empty video and exits 0

#### Scenario: The executable cannot serve a session
- **WHEN** the executable exits early, does not answer `/health`, or the session does not reach `final-video` within the bound
- **THEN** the script prints the reason and the executable's log and exits 1

### Requirement: The smoke run is isolated
The script SHALL keep the data of the run in a scratch folder, SHALL NOT use the product's default port or the user's data folder, and SHALL stop the executable and remove the scratch folder when it ends, whether it passed or failed.

#### Scenario: Nothing is left behind
- **WHEN** the script has ended
- **THEN** no process listens on its port and the scratch folder no longer exists

### Requirement: CI runs the smoke run on pull requests that can affect it
CI SHALL build the smoke flavor on a macOS runner and run the script, as a job of its own, on every pull request that changes `backend/`, `frontend/` or the job's workflow file. A failure SHALL fail the check.

#### Scenario: A pull request that breaks the packaged entry
- **WHEN** a change makes the executable fail at start
- **THEN** the `package-smoke` job fails and its log shows the executable's output

#### Scenario: A documentation-only pull request
- **WHEN** a pull request changes no file under `backend/` or `frontend/`
- **THEN** the `package-smoke` job does not run
