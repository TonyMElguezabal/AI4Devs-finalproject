# deployment-foundation Specification

## Purpose
TBD - created by archiving change define-production-deployment. Update Purpose after archive.
## Requirements
### Requirement: Single documented distribution decision

The project SHALL record exactly one chosen way of shipping and running the application in an ADR. The ADR SHALL state the evaluated options (including the hosted options that were proven and set aside), the reasons for the choice, the supported platforms, an estimate of running cost for the user, and the evidence behind the choice. `docs/backend-standards.md`, `docs/frontend-standards.md` and `docs/development_guide.md` SHALL describe the same decision. Implementation stories SHALL follow that record rather than choosing a packaging or hosting approach themselves.

#### Scenario: A delivery story begins

- **WHEN** work starts on a story that builds, packages, releases or runs the application
- **THEN** the ADR and the standards name the same distribution approach
- **AND** the story does not select its own

#### Scenario: An option is set aside

- **WHEN** an evaluated option is not chosen
- **THEN** the ADR names the reason and refers to a fact recorded in the change, not to preference

### Requirement: Runs on the supported platforms without installing a runtime

The application SHALL be delivered as one executable per supported platform, at least macOS (arm64 and x64) and Windows (x64), that starts the backend, serves the user interface and opens it in the default browser. The user SHALL NOT need to install Node.js, ffmpeg or any other runtime. The assembly stage SHALL find the ffmpeg and ffprobe shipped with the application.

#### Scenario: First launch on a clean laptop

- **WHEN** a user without Node.js or ffmpeg starts the executable on a supported platform
- **THEN** the user interface opens in the default browser and a session can be created

#### Scenario: Assembly on each platform

- **WHEN** a session reaches final assembly on macOS or Windows
- **THEN** the assembly tool runs the bundled ffmpeg and ffprobe successfully

### Requirement: Reachable only by the local user

The backend SHALL listen on the loopback interface only. It SHALL reject a request whose `Origin` header is present and is not the application's own origin, and a request whose `Host` header is not the loopback address and the application's port. The live-update stream SHALL apply the same checks. The application SHALL NOT require user accounts.

#### Scenario: A website the user visits calls the local backend

- **WHEN** a page from another origin, open in the user's browser, sends a request to the local backend
- **THEN** the backend rejects it and the page can neither read sessions nor start provider calls

#### Scenario: DNS rebinding

- **WHEN** a request reaches the backend with a `Host` other than the loopback address and port
- **THEN** the backend rejects it

#### Scenario: Another machine on the network

- **WHEN** another machine connects to the user's computer on the application's port
- **THEN** the connection is refused, because the backend listens on loopback only

### Requirement: Exactly one backend instance per user

Each user's installation SHALL run at most one backend process against its store. Launching the application while it is already running SHALL open the user interface of the running instance instead of starting a second backend. The backend SHALL keep processing sessions while no browser tab is open. After the process stops for any reason, the next launch SHALL resume every session from its persisted state through the existing boot-time reconciliation.

#### Scenario: Second launch

- **WHEN** the user starts the application while it is already running
- **THEN** no second backend process starts against the same store
- **AND** the browser opens on the running instance

#### Scenario: The tab is closed

- **WHEN** a session is processing and the user closes every browser tab
- **THEN** the session keeps progressing while the application runs

#### Scenario: The computer restarts mid-session

- **WHEN** the application stops while a session is processing and is started again
- **THEN** the session resumes from its persisted state without user action

### Requirement: Data kept in the user's data folder

The SQLite store, every project folder and the credentials file SHALL live in a per-user application-data folder (on macOS `~/Library/Application Support/Vid4You`, on Windows `%APPDATA%\Vid4You`), never in the installation folder, unless the user overrides the location through the documented environment variables. Upgrading, reinstalling or removing the executable SHALL NOT delete that folder. Project files keep PRD §12.2's rule: they are never deleted or expired automatically.

#### Scenario: Upgrade

- **WHEN** the user replaces the executable with a newer release
- **THEN** every session, scene result and project file present before is still present and usable

#### Scenario: Project folder names on Windows

- **WHEN** a video title contains characters or names Windows does not allow in a folder name
- **THEN** the project folder is still created and the session proceeds

### Requirement: Credentials stay on the user's computer

Provider credentials SHALL be read from the process environment first and from a credentials file in the user's data folder second. They SHALL NOT appear in the repository, in any release artifact or in logs. A missing credential SHALL fail the affected stage with a message naming the variable or file, never its value.

#### Scenario: The release artifact is inspected

- **WHEN** a released executable or the repository is searched for provider credentials
- **THEN** none are found

#### Scenario: A credential is missing

- **WHEN** a stage needs a credential the user has not provided
- **THEN** the stage fails with a message that names where to put it

### Requirement: Release builds are safe by construction

A released executable SHALL NOT expose test-only endpoints and SHALL NOT use stub providers, whatever environment variables are set on the user's computer. The interactive API documentation SHALL NOT be served by released executables.

#### Scenario: A test switch is set on the user's machine

- **WHEN** `ALLOW_TEST_ENDPOINTS` or a `USE_STUB_*` variable is present on the computer running a released executable
- **THEN** no test-only endpoint answers and no stub provider is active

### Requirement: Build and release pipeline declared as code

Building every platform's executable, running the tests, and publishing releases SHALL be declared in version-controlled pipeline code that runs without a developer's machine. Actions used by the pipeline SHALL be pinned to a commit and the pipeline SHALL request the least permissions each job needs. Signing credentials, when introduced, SHALL be supplied as pipeline secrets and never stored in the repository.

#### Scenario: A release is rebuilt from scratch

- **WHEN** the pipeline runs for a source tree on a clean runner
- **THEN** it produces every supported platform's executable without manual steps

#### Scenario: Pipeline definition is reviewed

- **WHEN** the workflow file is read
- **THEN** every third-party action is pinned to a commit and every job declares its permissions

### Requirement: Recorded evidence for the chosen approach

Before the decision is accepted, a proof of concept SHALL show a packaged executable on macOS running one session end to end (stubbed providers allowed) to a downloadable final video, the rejection of a cross-origin request, and recovery after the process is stopped mid-session. A Windows executable SHALL be built and started at least once, on a Windows machine or a Windows CI runner. Each outcome SHALL be recorded, failures included, with any observation that relied on a stand-in named as such.

#### Scenario: Packaged session on macOS

- **WHEN** the proof-of-concept executable runs on macOS
- **THEN** a session reaches its final video and the MP4 downloads

#### Scenario: Windows start

- **WHEN** the Windows executable is started
- **THEN** the backend answers its health check and the interface loads

### Requirement: Follow-up work is specified, not implied

The change SHALL finish with a list of implementation stories that turn the decision into released executables. Each story SHALL have acceptance criteria and SHALL name the requirement of this capability it satisfies. Any gap found during the spike and not closed by it SHALL appear either as a story or as a recorded risk.

#### Scenario: The spike closes

- **WHEN** the timebox ends
- **THEN** every blocker found (for example the entry-point check that fails on Windows, or the permissive CORS) is closed, turned into a story, or recorded as a risk

### Requirement: Releases come from main, built once per source tree

There SHALL be one release channel. A push to `main` SHALL build the executables for macOS arm64, macOS x64 and Windows x64 once for the pushed source tree and publish them as one GitHub release whose tag is derived from the tree hash. A source tree that already has a release SHALL be neither rebuilt nor published again. A release SHALL be published only after a person approves it, and only if the checks for that tree passed. The branch that feeds the channel SHALL be declared in one place.

#### Scenario: Push to main with a new source tree

- **WHEN** a push to `main` introduces a source tree with no release
- **THEN** the three executables are built once, and after a reviewer approves, one release containing them and their checksums is published

#### Scenario: Push to main with a source tree already released

- **WHEN** a push to `main` has the same source tree as an existing release (for example a merge that creates a new commit with identical content)
- **THEN** nothing is built or published and the run succeeds

#### Scenario: Approval is not given

- **WHEN** the reviewer rejects the approval or it is not given
- **THEN** no release is published

#### Scenario: Checks fail

- **WHEN** the tests, type checks or lint of the pushed tree fail
- **THEN** nothing is built and nothing is published

#### Scenario: Push to another branch or a skipped push

- **WHEN** a push is to a branch other than the release branch, or its head commit message contains `[skip release]`
- **THEN** nothing is built or published and the run succeeds

#### Scenario: The fed branch changes

- **WHEN** a different branch is assigned to the channel
- **THEN** only the declared mapping changes

### Requirement: Published files are verifiable

Every release SHALL include a checksum file listing the SHA-256 of each published executable archive, and the pipeline SHALL download the published assets and compare them with that file before it finishes.

#### Scenario: Assets match their checksums

- **WHEN** the release has been published
- **THEN** the pipeline downloads each asset, and its SHA-256 equals the one in the checksum file

#### Scenario: Asset differs from its checksum

- **WHEN** a downloaded asset does not match its listed checksum
- **THEN** the run fails and names the asset

### Requirement: Released executables report their channel and version

A released executable SHALL be built with the channel `production`, a version and its release tag, so the update check compares the running tag with the latest release.

#### Scenario: Update check in a released executable

- **WHEN** a released executable starts and a newer release exists
- **THEN** `GET /app/update` returns `available: true` with the newer tag

### Requirement: Release procedure and rollback are documented

The README SHALL describe how a release is approved and published and what to do when a bad release has been published.

#### Scenario: A bad release is published

- **WHEN** a published release is found to be faulty
- **THEN** the documented procedure removes it from the latest-release lookup and restores the previous release as the latest

