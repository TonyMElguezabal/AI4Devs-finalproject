## Context

ADR 0007 (amended 2026-10-20) makes `main` the only official environment. The sketch in `openspec/changes/archive/2026-10-19-define-production-deployment/poc/workflows/release.yml` was written for two channels (a UAT branch builds pre-releases, `main` promotes them) and still builds with the archived proof-of-concept script. JOS-206's acceptance criteria 1 to 5 describe that two-channel flow; the product owner chose, when this change was proposed, to follow the ADR instead: one channel from `main`. The ticket text should be updated to match when the change is applied.

Facts the design relies on:

- `backend/src/config/build.ts` reads `VID4YOU_VERSION`, `VID4YOU_CHANNEL` (`development`, `uat`, `production`) and `VID4YOU_RELEASE_TAG` and expects the bundler to replace them at build time.
- `backend/src/telemetry/updateCheck.ts`, in the `production` channel, calls `GET /repos/<repo>/releases/latest` and reports an update whenever the latest tag differs from the running tag. That endpoint ignores pre-releases and drafts, and its answer is the most recently created release.
- GitHub merges create new commit SHAs, so identical content can arrive on `main` as a different commit. The tree hash (`git rev-parse HEAD^{tree}`) is stable across that.
- `ci.yml` already runs type checks, lint and tests for both packages on every push to `main`.
- The build command is JOS-205's `npm run package:<target>` in `backend/`; that change decides how the macOS targets are signed (host-bound) and where the output goes.

## Goals / Non-Goals

**Goals:**

- A push to `main` yields, after one human approval, a GitHub release with the three executables and a checksum file, built once per source tree.
- Re-running for an already released tree does nothing.
- Released executables report channel `production`, version and tag.
- A dry run and a test publication that cannot affect users.
- A written release and rollback procedure.

**Non-Goals:**

- Signing and notarization (JOS-207), the packaged build (JOS-205), automatic updates, installers, publishing from other branches.
- Rebuilding the CI checks; the release workflow calls them.

## Decisions

### Decision 1: One workflow, one channel

`.github/workflows/release.yml` runs on `push` to `main` and on `workflow_dispatch`. The branch that feeds the channel is one `env` value at the top of the file (`RELEASE_BRANCH: main`). Jobs: `checks` (reuse of `ci.yml` through `workflow_call`, so there is one definition of "the tests pass"), `tree` (compute the hash, look up an existing release), `build` (matrix of three runners), `publish` (gated), `verify` (download and compare).

*Alternatives:* keep the two-channel model of the ticket (rejected by the product owner: the ADR dropped it and the integration branch it fed is code-closed); copy the test steps into the release workflow (two places to drift).

### Decision 2: Tree hash keys idempotency; the tag is derived from it

The release tag is `release-<tree hash>`. The `tree` job runs `gh release view release-<hash>`; when it exists, `build`, `publish` and `verify` are skipped and the run succeeds. The tag is opaque to the update check, which only compares tags for equality. The release title carries the date and the short hash. The version string is `<YYYY.MM.DD>-<first 7 of tree hash>`.

Concurrent pushes: the workflow uses `concurrency: { group: release, cancel-in-progress: false }` so two runs for different trees queue, and the second re-checks existence after the first finishes.

*Alternatives:* tag by commit SHA (a merge commit with identical content would rebuild); version numbers bumped by hand (a manual step that can be forgotten).

### Decision 3: Native runners, no cross-building

Each target builds on its own runner: `macos-15` (arm64), `macos-15-intel` (x64) and `windows-2025`. macOS signing is host-bound (JOS-205 Decision 8), and a Windows executable built on Windows avoids the `postject` cross-build the proof of concept relied on. Each job runs `npm ci` in `backend/` and `frontend/` and then `npm run package:<target>` with `VID4YOU_CHANNEL=production`, `VID4YOU_VERSION` and `VID4YOU_RELEASE_TAG` in the environment, zips `Vid4You`(`.exe`), `ffmpeg` and `ffprobe` into `Vid4You-<target>.zip`, and uploads it as a workflow artifact. Runner labels are verified when the workflow is first run; the Intel macOS runner label has changed before.

The build must read those three variables into the bundle. JOS-205 has to define them (its `build.ts` is where `config/build.ts` expects the bundler to do it); if it does not, this change adds it there.

### Decision 4: Approval gate is a GitHub Environment

`publish` declares `environment: release`. The environment is configured in repository settings with a required reviewer; the build runs before the approval so the reviewer approves files that already exist and can download the workflow artifacts to try them. A rejected or unanswered approval leaves no release. The settings step is documented in the README, since it is not code. Environment reviewers need a public repository or a paid plan; the repository is public. If the owner is the only reviewer, "prevent self-review" must stay off, and the pull request review before merging to `main` is where the second human looks.

*Alternative:* approve before building (the reviewer would approve something no one has seen).

### Decision 5: Checksums and a verify job

The `publish` job creates `SHA256SUMS.txt` for the three zips, then `gh release create release-<hash> <zips> SHA256SUMS.txt --target $GITHUB_SHA`. `verify` runs on a clean runner, downloads the assets with `gh release download`, and checks them with `sha256sum -c`. The files published are the files built in this run, so there is no rebuild between build and release.

### Decision 6: Dry run and test publication

`workflow_dispatch` takes `mode`: `dry-run` (default, any branch) builds the three targets and uploads the workflow artifacts only; `test-release` publishes a **pre-release** tagged `test-<hash>` through the same gate, so the update check's `latest` lookup never returns it and it can be deleted afterwards. Publishing a real release from a dispatch is not allowed: the `release` publish step is guarded by `github.ref == refs/heads/main && mode == release`.

### Decision 7: Least privilege and pinned actions

Top-level `permissions: {}`; `build` has `contents: read`; `publish` and `verify` have `contents: write` and `contents: read` respectively. Every `uses:` is pinned to a commit with the version in a comment, as `ci.yml` does.

### Decision 8: Offline-testable tree lookup

The decision "does this tree have a release" is a small script, `.github/scripts/release-state.sh` (or a typed function in `backend/packaging/` if JOS-205 has landed), that takes the hash and the list of existing tags and prints `build` or `skip`. It is exercised by a test with fixed inputs, so the idempotency rule is checked without GitHub.

## Risks / Trade-offs

- [Release workflow is hard to test end to end] → The dry run and the test pre-release exercise every job except the real tag; the real release is the first production publication and is watched.
- [The requested runner labels change or disappear] → Labels live in one matrix; the first dry run fails loudly.
- [A bad release becomes `latest` and users are told to update to it] → Rollback procedure: delete the bad release (or turn it into a pre-release) so `/releases/latest` returns the previous one; the README states the exact `gh` commands. Users already on the bad build then see the previous tag as an update, which is the intended rollback path.
- [Unsigned executables show OS warnings] → Accepted until JOS-207; the release notes say so.
- [The only reviewer is also the author] → Pull request review of the merge to `main` is the second check; recorded in the README.
- [JOS-205 not merged yet] → This change is applied after JOS-205; its tasks include confirming the three variables reach the bundle.

## Open Questions

- Whether `ci.yml` can be called with `workflow_call` as is (it triggers on `push` and `pull_request` only); if not, add a `workflow_call` trigger to it.
- Whether to keep the ticket's acceptance criteria 2 to 4 in Linear as written or rewrite them to the single-channel model; this change specifies the single-channel version.
