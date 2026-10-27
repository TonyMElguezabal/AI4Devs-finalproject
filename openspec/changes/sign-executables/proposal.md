## Why

The executables are unsigned, so Windows SmartScreen shows "Windows protected your PC" and macOS Gatekeeper asks the user to override on first launch (README sections 1.4 and 2.4, MVP closure item M6). The Windows executable is also made by injecting a blob into the official `node.exe`, which invalidates that file's original signature. A non-technical user can reasonably refuse to run an application that warns them. Signing is the last gate before the executables are fit to hand to someone other than the author.

## What Changes

- Sign the Windows executables (`Vid4You.exe`, `ffmpeg.exe`, `ffprobe.exe`) after the blob injection, through one provider-neutral script, and fail the release build if a signature is not valid.
- Sign the macOS executables with a Developer ID Application certificate, hardened runtime and a secure timestamp, notarize the archive with Apple, and fail the release build if notarization is rejected.
- Add the signing steps to the release workflow, with credentials held as environment secrets on a protected `signing` environment that only `main` can use; signing is skipped, never faked, in dry runs and on forks.
- Make signing required through a repository variable, so releases can still be published (and labeled unsigned) until the certificates exist.
- Record the certificate decision and cost in `docs/adr/0007-deployment.md`; write the renewal procedure; remove the signing limitation from the README once verified.
- Verify on a clean Windows 11 machine and a clean Mac and record the results.

Non-goals: choosing the Windows certificate provider in this change (the design fixes a provider-neutral contract and leaves the provider to the owner's decision), the packaged build (JOS-205), the release workflow itself (JOS-206), an installer or `.dmg`, automatic updates.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment-foundation`: adds requirements that released executables are signed and, on macOS, notarized; that signing failures stop the release; and that signing credentials are available only to approved runs and never appear in logs or the repository.

## Impact

- New: signing script(s) and a macOS entitlements file under `backend/packaging/` or `.github/scripts/`, a `signing` GitHub Environment (settings, not code), secrets for the chosen providers.
- Changed: `.github/workflows/release.yml` (from JOS-206), `docs/adr/0007-deployment.md`, `readme.md` sections 1.4, 1.6 and 2.4.
- Depends on JOS-205 (packaged build) and JOS-206 (release workflow), and on the product owner obtaining an Apple Developer membership and a Windows signing identity (paid).
- No application code, API or database change.
