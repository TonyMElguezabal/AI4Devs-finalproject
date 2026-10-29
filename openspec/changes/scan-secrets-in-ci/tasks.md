## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Fetch, then create branch `feature/jos-211-scan-secrets-in-ci` from `origin/feature/entrega-3-JAME` with `--no-track`, in the worktree `../AI4Devs-jos-211`
- [x] 0.2 Verify the current branch and that it has no upstream

## 1. Allowlist files

- [x] 1.1 Create `.gitleaks.toml`: a header comment naming JOS-211 and this change, `[extend] useDefault = true`, and one `[[allowlists]]` entry with a `description` and the anchored path `^graphify-out/cache/stat-index\.json$` (design Decision 4)
- [x] 1.2 Create `.gitleaksignore` with the eight historical fingerprints from a fresh `gitleaks git --redact -f json` run, each under a `# <reason>` line: the example database password (3) and the placeholder curl bearer examples (5)
- [x] 1.3 Run gitleaks 8.30.1 over the full history from the repository root with no flags beyond `--redact`; it reports no finding. Save the command and summary in `reports/YYYY-MM-DD-full-history-scan.md`

## 2. CI job

- [x] 2.1 Add a `secrets` job to `.github/workflows/ci.yml`: `ubuntu-latest`, `actions/checkout` at the SHA the test job uses with `fetch-depth: 0`, workflow-level `contents: read` kept, no secrets
- [x] 2.2 Add the install step: download the 8.30.1 `linux_x64` archive, `sha256sum -c` against the checksum in design Decision 1, extract
- [x] 2.3 Add the scan step with the range logic of design Decision 3 (pull request base..head; push before..after; full history when `before` is all zeros or missing) and `gitleaks git --redact --no-banner .`
- [x] 2.4 Update the workflow header comment to mention the secrets scan (JOS-211)
- [x] 2.5 Check the step's range logic locally with the same shell on three inputs (a two-commit range, an all-zeros `before`, an unknown `before`) and record the `--log-opts` each one produces

## 3. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 3.1 Confirm no application code or test changes; the spec scenarios in `specs/secrets-scanning/spec.md` are covered by the scans in 1.3, 2.5 and group 4 and by the CI run in group 7 (no unit test is written)

## 4. Dry run with a dummy key (Definition of Done)

- [x] 4.1 On a throwaway local branch from this branch, commit a file with an OpenAI-shaped dummy key, then a second commit removing it; run the range scan of 2.3 over the two commits and confirm it fails, names file, line, rule and the adding commit, and prints `REDACTED` instead of the value
- [x] 4.2 In the same range, add a new key-shaped line to `readme.md` and confirm it is still reported despite the readme fingerprints in `.gitleaksignore`
- [x] 4.3 Corrupt the expected checksum in a local copy of the install step and confirm `sha256sum -c` fails before the scanner runs
- [x] 4.4 Delete the throwaway branch; record commands and redacted output in `reports/YYYY-MM-DD-dry-run-dummy-key.md`. A test pull request on GitHub is opened only if the user approves it

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 5.1 Record in `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md` that no application code changes, so the backend and frontend suites are not affected; the CI test job on the pull request is the regression check. No database is touched

## 6. Manual Endpoint Testing with curl and E2E with Playwright (MANDATORY if applicable)

- [ ] 6.1 Record in the step 5 report that no endpoint and no user workflow changes, so curl and Playwright checks do not apply

## 7. Update Technical Documentation (MANDATORY)

- [ ] 7.1 `readme.md` section 2.6: add `gitleaks git --redact --verbose .` next to the test commands, with the CI version, install hint, and the one-line note that a real leaked key must be revoked and rotated, not only removed; mention the secrets job in the CI sentence
- [ ] 7.2 `readme.md` section 2.5 (Secretos): add that every pull request and push is scanned with gitleaks, with the allowlist files named
- [ ] 7.3 `docs/release/mvp-closure-report.md` I1 row and action 9, `docs/release/mvp-release-gates.md` security gap, and `docs/release/cleanup-inventory.md` K1: state that the scan runs in CI (JOS-211) and the graph cache is allowlisted
- [ ] 7.4 Run `graphify update .`

## 8. Pull request

- [ ] 8.1 Commit on the feature branch in separate commits: allowlist files, CI job, docs and reports
- [ ] 8.2 After approval, confirm no PR for this branch is already merged, push with an explicit upstream, and open the PR into `feature/entrega-3-JAME` linking JOS-211; the `secrets` job must be green on it. Note in the PR that the check should be made required on `main` and the integration branches
- [ ] 8.3 Add a comment on JOS-203 updating the I1 note
