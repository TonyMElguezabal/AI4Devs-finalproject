## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Build and release pipeline declared as code

Building every platform's executable, running the tests, and publishing releases SHALL be declared in version-controlled pipeline code that runs without a developer's machine. Actions used by the pipeline SHALL be pinned to a commit and the pipeline SHALL request the least permissions each job needs. Signing credentials, when introduced, SHALL be supplied as pipeline secrets and never stored in the repository.

#### Scenario: A release is rebuilt from scratch

- **WHEN** the pipeline runs for a source tree on a clean runner
- **THEN** it produces every supported platform's executable without manual steps

#### Scenario: Pipeline definition is reviewed

- **WHEN** the workflow file is read
- **THEN** every third-party action is pinned to a commit and every job declares its permissions

## REMOVED Requirements

### Requirement: Production releases are the artifacts UAT validated

**Reason**: ADR 0007 was amended on 2026-10-20: `main` is the single official environment and the UAT-then-production flow was never enabled. Promotion of UAT files cannot exist without a UAT channel.
**Migration**: Use "Releases come from main, built once per source tree"; the tree hash still keys idempotency, and the manual approval is kept.
