## ADDED Requirements

### Requirement: Released Windows executables are signed

Every executable in a released Windows archive (`Vid4You.exe`, `ffmpeg.exe`, `ffprobe.exe`) SHALL carry a valid Authenticode signature made after the single executable blob was injected, with a trusted timestamp. The release build SHALL fail when any of them is not validly signed.

#### Scenario: Signed executable on a clean machine

- **WHEN** a released Windows archive is downloaded and its executable is started on a clean Windows machine
- **THEN** `Get-AuthenticodeSignature` reports a valid signature and SmartScreen does not block the application or shows the verified publisher name

#### Scenario: Signature is invalid

- **WHEN** the signing step produces a file whose signature does not validate
- **THEN** the release build fails and nothing is published

### Requirement: Released macOS executables are signed and notarized

Every executable in a released macOS archive SHALL be signed with a Developer ID Application certificate, the hardened runtime and a secure timestamp, and the archive SHALL be notarized by Apple. The release build SHALL fail when notarization is rejected or does not finish.

#### Scenario: Notarized build on a clean Mac

- **WHEN** a released macOS archive is downloaded and the application is opened on a clean Mac with network access
- **THEN** Gatekeeper opens it without an override and `spctl --assess` accepts it

#### Scenario: Notarization is rejected

- **WHEN** Apple rejects the submission
- **THEN** the release build fails, the rejection log is shown, and nothing is published

### Requirement: Signing credentials are confined

Signing credentials SHALL be held only as secrets of a protected environment that runs from `main`, SHALL NOT appear in logs, artifacts or the repository, and SHALL NOT be available to runs on forks or other branches. Where credentials are unavailable the signing step SHALL be skipped and the produced files SHALL be labeled unsigned; a signature SHALL NOT be simulated.

#### Scenario: Dry run on a branch

- **WHEN** the release workflow is run by hand on a branch other than `main`
- **THEN** the signing steps are skipped and the uploaded files are named as unsigned

#### Scenario: Fork pull request

- **WHEN** a pull request comes from a fork
- **THEN** no signing step runs and no secret is exposed

### Requirement: Signing is required once enabled

A repository setting SHALL declare whether signing is required. When it is required, a release from `main` SHALL be published only if every executable is signed, and a missing credential SHALL fail the build. When it is not required, a release SHALL state in its notes that the executables are unsigned.

#### Scenario: Signing required and credential missing

- **WHEN** signing is required and a signing secret is not set
- **THEN** the release build fails before anything is published

#### Scenario: Signing not yet required

- **WHEN** signing is not required
- **THEN** the release is published with a note that the executables are unsigned

### Requirement: Published checksums describe the signed files

The checksum file of a release SHALL be computed after signing, over the archives as published.

#### Scenario: Checksum of a signed archive

- **WHEN** a signed archive is downloaded from a release
- **THEN** its SHA-256 equals the one in the release's checksum file
