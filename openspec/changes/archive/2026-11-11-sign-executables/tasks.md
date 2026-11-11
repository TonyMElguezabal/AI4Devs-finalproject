## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-207-sign-executables` from `main` (no upstream)
- [x] 0.2 Verify the current branch
- [x] 0.3 Confirm JOS-205 and JOS-206 are merged to `main`, or stack this branch on them

## 1. Decisions and accounts (owner)

> **Deferred (owner decision, 2026-10-26):** no Windows certificate and no Apple Developer account for now, to avoid the subscription cost; the owner expects to buy them in the coming months. Until then releases stay unsigned and labeled so (`SIGNING_REQUIRED` unset, no `signing` environment). Tasks marked `[deferred]` resume when the owner says so.

- [ ] [deferred] 1.1 Owner decides the Windows certificate type and provider, its cost and who holds it; record the decision in `docs/adr/0007-deployment.md`
- [ ] [deferred] 1.2 Owner enrolls in the Apple Developer Program and creates a Developer ID Application certificate and an App Store Connect API key
- [ ] [deferred] 1.3 Create the `signing` GitHub Environment restricted to `main` and store the secrets (Windows provider values, base64 `.p12` and its password, API key id, issuer id and `.p8`); record the secret names, not the values, in the README

## 2. Tests first (TDD)

- [x] 2.1 Test the signing-required rule: required and secret missing fails naming the secret; not required and secret missing skips and marks unsigned; secrets present signs
- [x] 2.2 Test that release notes carry the "not signed" line only when the files are unsigned
- [x] 2.3 Test that signed archives are hashed after signing (the checksum step runs after the sign step in the workflow definition)
- [x] 2.4 Test the log-masking self-check: running the signing scripts with fake secret values against a stub never prints those values
- [x] 2.5 Test that the keychain cleanup step is declared with `always()`

## 3. Signing implementation

- [x] 3.1 Add `backend/packaging/entitlements.plist` with `allow-jit` and `allow-unsigned-executable-memory`
- [x] 3.2 Add the macOS signing step: temporary keychain, certificate import, `codesign` of `ffmpeg`, `ffprobe`, `Vid4You` with hardened runtime and timestamp, `codesign --verify --strict`, keychain cleanup in `always()`
- [x] 3.3 Add the notarization step with `notarytool submit --wait`, printing `notarytool log` and failing on `Invalid`
- [ ] [deferred] 3.4 Add `.github/scripts/sign-windows.ps1` implementing the contract for the provider chosen in 1.1, including removal of the existing signature before signing
- [x] 3.5 Add `.github/scripts/verify-windows.ps1` that fails unless `Get-AuthenticodeSignature` is `Valid` for every file
- [ ] [deferred] 3.6 (macOS and wiring done; Windows secrets pending 3.4) Wire the steps into `release.yml`: conditional `environment`, `SIGNING_REQUIRED`, sign before zip, unsigned labeling of artifacts and release notes
- [x] 3.7 Confirm the zip, `SHA256SUMS.txt` and `verify` job run after signing and cover the signed files

## 4. Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Review the packaging and release tests from JOS-205 and JOS-206 for assumptions that change when files are signed (ad-hoc signature replaced, hash after signing)
- [x] 4.2 Update affected tests (none needed: no existing test names a zip or assumes unsigned output; full suite green)

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] [deferred] 5.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [ ] [deferred] 5.2 Run targeted tests for the signing and release scripts
- [ ] [deferred] 5.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend`
- [ ] [deferred] 5.4 Verify post-test database state and restore if needed
- [ ] [deferred] 5.5 Create report `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [ ] [deferred] 5.6 Mark the step complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] [deferred] 6.1 Run the signed macOS executable produced by the workflow on the agent's Mac with the hardened runtime on (AGENT MUST EXECUTE)
- [ ] [deferred] 6.2 curl `GET /health` returns `{"ok":true}`; the interface loads; one stubbed session reaches `final-video` (confirms the entitlements are enough)
- [ ] [deferred] 6.3 Restore the data folder and document commands and responses in `reports/YYYY-MM-DD-step-6-curl-endpoint-testing.md`

## 7. E2E Testing with Playwright MCP

- [ ] 7.1 Not applicable: no interface change. Record the reason in `reports/`

## 8. Exercise the pipeline and verify on clean machines

- [ ] [deferred] 8.1 Dry run on a branch: signing steps are skipped, files are named unsigned
- [ ] [deferred] 8.2 Run on `main` (or a test release) with `SIGNING_REQUIRED=true`: all three archives are signed, macOS notarization is accepted, the checksums match
- [ ] [deferred] 8.3 Remove one secret and confirm the build fails naming it and publishes nothing
- [ ] [deferred] 8.4 Clean Windows 11 machine: download the archive, start the executable, record SmartScreen behavior and the `Get-AuthenticodeSignature` output
- [ ] [deferred] 8.5 Clean Mac: download the archive, open the application, record Gatekeeper behavior and the `spctl --assess` output; repeat once with the network off and record the result
- [ ] [deferred] 8.6 Record all results in `reports/`

## 9. Update Technical Documentation (MANDATORY)

- [ ] [deferred] 9.1 Remove the signing limitation from `readme.md` sections 1.4 and 2.4 (Spanish) once 8.4 and 8.5 pass; keep the note about online first launch on macOS if it applies
- [ ] [deferred] 9.2 Write the certificate renewal procedure: each expiry date, who renews, where the reminder is, how to rotate the secrets
- [ ] [deferred] 9.3 Update `docs/adr/0007-deployment.md` with the provider decision, cost and the signing flow
- [ ] 9.4 Run `graphify update .`
- [ ] 9.5 Open the pull request linking JOS-207; archive the change after merge
