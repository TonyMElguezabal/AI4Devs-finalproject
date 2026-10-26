## Context

ADR 0007 and `deployment-foundation` already say that signing credentials, when introduced, are pipeline secrets and never in the repository. This change introduces them. It builds on two changes that precede it:

- `package-executables-build` (JOS-205) produces `Vid4You` (`.exe`), `ffmpeg` and `ffprobe` per target by injecting a Node single-executable blob into the official Node binary with `postject`, and ad-hoc signs macOS builds so they run locally.
- `enable-release-workflow` (JOS-206) builds the three targets on native runners, zips them, publishes one release behind a reviewer approval from `main`, and publishes `SHA256SUMS.txt`.

Facts that shape the design:

- Injecting a blob invalidates the original signature of `node.exe` and of the macOS Node binary, so signing must come after injection, and any signature present before it must be removed first.
- Windows SmartScreen judges the downloaded file and the reputation of its signer. Files extracted from a downloaded archive inherit the "downloaded from the Internet" mark, so `ffmpeg.exe` and `ffprobe.exe` are judged too.
- Apple notarization requires every Mach-O in the submission to be signed with a Developer ID Application certificate, the hardened runtime and a secure timestamp. A loose executable cannot be stapled (stapling works for apps, packages and disk images), so Gatekeeper finds the notarization ticket online on first launch.
- A V8-based executable under the hardened runtime needs the entitlements `com.apple.security.cs.allow-jit` and `com.apple.security.cs.allow-unsigned-executable-memory`.
- The Windows signing provider is not chosen yet (the product owner decides and pays). The choice changes the CI step (cloud signing service, hardware-token proxy or an Azure action) but not what is signed or when.

## Goals / Non-Goals

**Goals:**

- Windows and macOS executables that start on a clean machine with no security override.
- Credentials reachable only by approved runs from `main`, never in logs.
- A provider-neutral Windows signing contract, so choosing or changing the provider touches one script.
- Releases keep working before the certificates exist, honestly labeled.

**Non-Goals:**

- Choosing and buying the Windows certificate; that decision and its cost are recorded in the ADR by the owner (task 1.1).
- A `.dmg`, `.pkg` or `.app` wrapper, an installer, or auto-update.
- Signing the frontend assets (they are inside the executable).

## Decisions

### Decision 1: Sign inside the build job, before zipping

Each platform job in `release.yml` runs: build, remove old signatures, sign, verify, zip, upload. Signing before the zip means the checksum file and the published archives describe signed files with no extra step, and the reviewer approving the release is approving the signed files.

*Alternative:* a separate `sign` job after the build (adds an artifact round-trip, and then the zips would have to be rebuilt and re-hashed).

### Decision 2: A protected `signing` environment, separate from `release`

Secrets live in a GitHub Environment named `signing`, restricted by deployment branch policy to `main`, with no reviewer (the reviewer gate stays on `release`). The build job selects it with `environment: ${{ github.ref == 'refs/heads/main' && github.event_name == 'push' && 'signing' || '' }}`. On a dry run or any other ref the environment is not attached, the secrets are empty, and the signing steps are skipped by an `if` on a non-secret signal. Forks never run this workflow on pull requests, and fork runs have no secrets in any case.

*Alternatives:* repository-level secrets (readable by any workflow run on any branch); putting the secrets on the `release` environment (they would then be available only after approval, which is after the build and signing).

### Decision 3: Signing required by a repository variable

`vars.SIGNING_REQUIRED` (`true` or unset). When `true`, the signing steps must succeed and a missing secret fails the job with a message naming the missing secret (never its value). When unset, signing is skipped if secrets are absent and the publish step adds "These executables are not signed." to the release notes. This lets JOS-205 and JOS-206 ship before the certificates exist, and flipping the variable is the switch that closes the limitation.

### Decision 4: Windows signing behind one script

`.github/scripts/sign-windows.ps1` takes a list of files and signs each with a timestamp. Its body is the only provider-specific code and is written when the owner has chosen a provider (task 1.1 to 1.3); candidate implementations are an Azure signing action, a CA's cloud-signing client or `signtool` with a certificate held in a cloud key store. The contract is fixed now:

- inputs: file paths; secrets and configuration from environment variables set by the workflow step;
- before signing `Vid4You.exe`, any existing signature is removed (`signtool remove /s`);
- output: every file signed with SHA-256 and an RFC 3161 timestamp;
- then `verify-windows.ps1` runs `Get-AuthenticodeSignature` on each file and fails unless the status is `Valid`.

`ffmpeg.exe` and `ffprobe.exe` are signed with the same identity as the application, since they ship in the same archive and are launched by it.

### Decision 5: macOS signing and notarization

On the macOS runners a step creates a temporary keychain, imports the Developer ID Application certificate (base64 `.p12` and its password from `signing` secrets), and signs `ffmpeg`, `ffprobe` and then `Vid4You` with `codesign --force --options runtime --timestamp --entitlements backend/packaging/entitlements.plist --sign "$IDENTITY"`. `codesign --verify --strict` follows. The archive is submitted with `xcrun notarytool submit --wait` using an App Store Connect API key (key id, issuer id, `.p8` as secrets); on `Invalid` the step prints `notarytool log` and fails. The temporary keychain is deleted in an `always()` step. `spctl --assess` is not run in CI because Gatekeeper's assessment of a quarantined download is only meaningful on a real Mac; it is part of the manual verification.

*Alternatives:* an app-specific password instead of an API key (tied to a person's Apple ID and harder to rotate); wrapping the binaries in a `.dmg` or `.pkg` so the ticket can be stapled (a different distribution layout, out of scope; recorded as a follow-up if offline first launch matters).

### Decision 6: No secrets in logs

Secrets are passed to steps only through `env:` of the step that needs them, never on a command line; scripts do not echo them; GitHub masks them. The signing scripts have a self-check test that runs them with fake values against a stub and asserts the output contains none of the values.

### Decision 7: What is automatable and what is manual

Automated (offline, no certificate): the "required but missing" check, the unsigned labeling, the checksum-after-signing ordering, the temporary-keychain cleanup, and the log-masking test. Manual, recorded in `reports/`: signing and notarizing with real certificates, and first launch on a clean Windows 11 machine and a clean Mac with the downloaded release.

## Risks / Trade-offs

- [SmartScreen reputation: even a signed file can warn until its signer or file has reputation (an ordinary certificate builds it slowly)] → The acceptance criterion allows "shows the verified publisher name"; the provider decision records which kind of certificate was chosen and what to expect; verification records what was actually seen.
- [Notarization needs the network on first launch because the ticket cannot be stapled to loose binaries] → Documented in the README; a `.dmg` wrapper is the recorded follow-up.
- [Hardened runtime breaks the executable at runtime (JIT, loading `node:sqlite`)] → The entitlements file is tested by running the signed binary through `/health` and a stubbed session on a real Mac before enabling `SIGNING_REQUIRED`.
- [Re-signing `ffmpeg` and `ffprobe` with our identity] → They remain unmodified third-party builds; their license obligations are recorded in the ADR (see JOS-205).
- [Certificate expiry silently breaks releases] → The renewal procedure lists each expiry and where to set a reminder; a failed signing step fails the release loudly rather than publishing unsigned once `SIGNING_REQUIRED` is true.
- [The conditional `environment:` expression may not behave as intended] → Verified in the first dry run on a branch (must skip signing) and on `main` (must attach `signing`); fallback is a dedicated `sign` job.

## Open Questions

- Windows provider and certificate type, cost and owner: the product owner decides before task 2.1; the design does not depend on the answer beyond Decision 4's script.
- Apple Developer account holder and whether it is an individual or an organization (affects the name shown by Gatekeeper).
- Whether offline first launch on macOS matters enough to wrap the binaries in a notarized `.dmg`.
