# secrets-scanning Specification

## Purpose
Fail a pull request or push that adds a secret to the repository, by scanning the commits of the change with a pinned gitleaks in CI and keeping known false positives in a reviewed allowlist (JOS-211).

## Requirements
### Requirement: Secrets scan gate in continuous integration

The CI workflow SHALL run a secrets scan on every pull request and on every push to the branches the CI workflow already protects, and SHALL fail the run when the scan reports a finding that is not allowlisted. The scan output SHALL name the file, line and rule of each finding and SHALL NOT print the matched value.

#### Scenario: A pull request adds a key-shaped string

- **WHEN** a pull request adds a string shaped like a provider or cloud key, such as an OpenAI key, to any file
- **THEN** the secrets scan job fails
- **AND** its log names the file, the line and the rule
- **AND** the matched value appears in the log only as `REDACTED`

#### Scenario: A pull request without secrets

- **WHEN** a pull request adds no key-shaped string
- **THEN** the secrets scan job passes

### Requirement: Scan covers every commit of the change

For a pull request the scan SHALL check every commit between the base and the head of the pull request. For a push it SHALL check every commit between the previous and the new head of the branch, and SHALL scan the full history when the previous head is absent or unknown to the repository.

#### Scenario: A key is added and removed in the same pull request

- **WHEN** one commit of a pull request adds a key and a later commit of the same pull request removes it
- **THEN** the secrets scan job fails and names the commit that added it

#### Scenario: A new branch is pushed

- **WHEN** a push creates a protected branch, so there is no previous head
- **THEN** the scan checks the full history of the branch

### Requirement: Pinned and verified scanner

The workflow SHALL install the scanner at a pinned version and SHALL verify the downloaded archive against a SHA-256 checksum written in the workflow before running it. Any third-party action the job uses SHALL be pinned to a commit SHA. The job SHALL have read-only repository permissions and SHALL NOT use repository secrets.

#### Scenario: The downloaded archive does not match

- **WHEN** the downloaded scanner archive does not match the checksum in the workflow
- **THEN** the job fails before the scanner runs

#### Scenario: Reviewing the workflow

- **WHEN** a reviewer reads the secrets scan job
- **THEN** the scanner version, its checksum and the action commit SHAs are written in it
- **AND** its permissions are `contents: read`

### Requirement: Reviewed allowlist

Known false positives SHALL be listed in files committed to the repository, each entry with a one-line reason. A path allowlist SHALL be limited to files whose content is generated and cannot hold a credential; any other false positive SHALL be listed by its individual finding fingerprint. The scan of the current protected branches, including their full history, SHALL pass with the committed allowlist.

#### Scenario: Full-history scan of the main branch

- **WHEN** the scanner runs over the full history of `main` with the committed allowlist
- **THEN** it reports no finding

#### Scenario: Reviewing the allowlist

- **WHEN** a contributor reads the allowlist files
- **THEN** every entry has a one-line reason next to it

#### Scenario: A new finding in an allowlisted document

- **WHEN** a new commit adds a key-shaped string to a file that already has a fingerprinted false positive, such as `readme.md`
- **THEN** the scan still reports the new finding

### Requirement: Documented local scan

`readme.md` SHALL document, next to the test commands, the one-line command that runs the same scan locally with the committed allowlist, and the scanner version CI uses.

#### Scenario: A developer checks before pushing

- **WHEN** a developer runs the documented command from the repository root
- **THEN** the scan uses the committed allowlist and reports the same result as CI for the same commits
