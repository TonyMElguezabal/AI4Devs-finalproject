## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-206-release-workflow` from `main` (no upstream)
- [x] 0.2 Verify the current branch
- [x] 0.3 Confirm JOS-205 (`package:<target>` scripts) is merged to `main`, or stack this branch on it

## 1. Tests first (TDD)

- [x] 1.1 Test the release-state decision: no release for the tree prints `build`; a `release-<hash>` tag present prints `skip`; a different tree's tag prints `build`
- [x] 1.2 Test the version and tag derivation from a tree hash and a date
- [x] 1.3 Test that the checksum file lists each zip and that a tampered zip fails `sha256sum -c`
- [x] 1.4 Test that the packaged bundle carries channel `production`, the version and the tag when the three variables are set, and `development` when they are not (extends the JOS-205 bundle test)

## 2. Workflow and scripts

- [x] 2.1 Add the release script (`.github/scripts/release.sh`: state, tag, version, checksums, verify) and make tests 1.1 and 1.2 pass
- [x] 2.2 Add a `workflow_call` trigger to `ci.yml` if needed so `release.yml` reuses it
- [x] 2.3 Add `.github/workflows/release.yml` with the `checks`, `tree`, `build`, `publish`, `verify` jobs, the `RELEASE_BRANCH` value, concurrency, top-level empty permissions and per-job permissions
- [x] 2.4 Pin every action to a commit with its version in a comment
- [x] 2.5 Build matrix: `macos-15` (arm64), `macos-15-intel` (x64), `windows-2025`; each passes the three build variables to `npm run package:<target>` and uploads `Vid4You-<target>.zip`
- [x] 2.6 `publish` job on `environment: release`: write `SHA256SUMS.txt`, create the release at the tag `release-<hash>`; guard it so only `main` pushes or an explicit `test-release` dispatch can run it
- [x] 2.7 `verify` job: download the published assets and run `sha256sum -c`
- [x] 2.8 `workflow_dispatch` with `mode` (`dry-run`, `test-release`); a test release is a pre-release tagged `test-<hash>`
- [x] 2.9 JOS-205 did not embed the three variables: `bundleBackend` now defines `process.env.VID4YOU_*` from the build environment and `config/build.ts` names each variable
- [x] 2.10 Trigger on a push to every branch; the `tree` job reports `skip` for a branch other than `RELEASE_BRANCH` and for a head commit message containing `[skip release]`
- [x] 2.11 Release notes and README state that the archives carry the non-redistributable ffmpeg build (design Decision 9)
- [x] 2.12 Fix the pre-existing lint error in `backend/test/provider-usage-billed-units.test.ts` so the `checks` job can pass

## 3. Review and Update Existing Unit Tests (MANDATORY)

- [x] 3.1 Review the update-check and build-config tests for assumptions about channels and tags (none; both pass unchanged)
- [x] 3.2 Update affected tests (none needed)

## 4. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 4.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [x] 4.2 Run targeted tests for the changed modules and the new release scripts
- [x] 4.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend`
- [x] 4.4 Verify post-test database state and restore if needed
- [x] 4.5 Create report `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md`
- [x] 4.6 Mark the step complete only after tests pass and the report exists

## 5. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Start a packaged executable built locally (Actions unavailable) for the host platform with the stubbed build variables set (AGENT MUST EXECUTE)
- [x] 5.2 curl `GET /app/update` against the real API (no local stand-in is possible: the URL is fixed): `available: false` with the 404 logged; the flip stays covered by unit tests until a real release exists
- [x] 5.3 Confirm `GET /health` still answers `{"ok":true}`
- [x] 5.4 Restore the data folder and document commands and responses in `reports/YYYY-MM-DD-step-5-curl-endpoint-testing.md`

## 6. E2E Testing with Playwright MCP

- [x] 6.1 Not applicable: this change has no interface. Record that in `reports/` with the reason

## 7. Exercise the pipeline

- [x] 7.1 Configure the `release` environment with a required reviewer in repository settings (record the setting in the README, no secrets)
- [x] 7.2 Run the workflow by `workflow_dispatch` in `dry-run` mode on the feature branch; the three zips are uploaded — run on `main` (2026-10-27, run 40451130814): `success`, three workflow artifacts (`Vid4You-darwin-arm64` 83 MB, `Vid4You-darwin-x64` 96 MB, `Vid4You-win32-x64` 100 MB), `publish` and `verify` skipped
- [ ] 7.3 Run `test-release` once: approve, the pre-release `test-<hash>` appears with the three zips and `SHA256SUMS.txt`, `verify` passes; delete the test pre-release
- [x] 7.4 Re-run for the same tree and confirm nothing is rebuilt or published — re-run of the push run 40451094054 (attempt 3) after the first release: `tree` succeeded, `checks`, `build`, `publish` and `verify` skipped, `gh release list` still shows one release (done on the real release rather than on a test release)
- [x] 7.5 Reject an approval once and confirm no release is created — push run 40451094054 (attempt 1), all three builds green, `release` approval rejected: the run ended failed at `publish`, `verify` skipped, `gh release list` empty
- [x] 7.6 Confirm a failing check (temporary failing test on the branch) stops the run before any build — confirmed without a temporary test: the dry-run of 2026-10-26 on `main` (run 40445693575) failed `checks / test (frontend)` at `npm run lint` (2 existing errors: `ReportsSection.tsx` setState in an effect, unused `API_BASE` in `reports-section.test.tsx`) and `build`, `publish` and `verify` were skipped; `tree` and `checks / test (backend)` passed

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 Add the release and rollback procedure to `readme.md` section 1.4 and update 2.4 (keep it in Spanish): who approves, how, how to remove or demote a bad release
- [x] 8.2 Re-amend `docs/adr/0007-deployment.md`: single channel from `main`, tag by tree hash, approval gate, workflow location
- [x] 8.3 Update the JOS-206 ticket text so its acceptance criteria match the single-channel model
- [x] 8.4 Run `graphify update .`
- [ ] 8.5 Open the pull request linking JOS-206; archive the change after merge
