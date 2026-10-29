## Why

ADR 0007 makes `main` the single official environment and leaves open how releases are built and published from it (JOS-206). Today nothing is published automatically: `.github/workflows/` holds only `ci.yml` and `telemetry-relay.yml`, and the release flow exists only as an archived sketch for a two-channel model the product owner has since dropped. Without a workflow no one can obtain a Windows or macOS executable that was built from a known source tree and approved by a person.

## What Changes

- Add `.github/workflows/release.yml`: on a push to `main`, run the checks, build macOS arm64, macOS x64 and Windows x64 once for that source tree, and publish them as one GitHub release after a reviewer approves on a protected environment.
- Key everything on the source tree hash (`git rev-parse HEAD^{tree}`): the release tag is derived from it, and a tree that already has a release is neither rebuilt nor published again.
- Publish a `SHA256SUMS.txt` with the release and verify the downloaded assets against it after publishing.
- Pass the channel (`production`), version and release tag to the build so `GET /app/update` works in released executables.
- Add a manual dry run (`workflow_dispatch`) that builds on any branch and uploads the files as workflow artifacts without publishing, and a test publication that creates a pre-release (never returned by the update check's `latest` lookup).
- Write the release and rollback procedure in `readme.md` and re-amend ADR 0007.
- **BREAKING (spec only):** the two-channel requirement "Production releases are the artifacts UAT validated" in `deployment-foundation` is removed and replaced by a single-channel requirement. It was never implemented.

Non-goals: signing and notarization (JOS-207), the build script itself (JOS-205, a dependency), auto-update, publishing from any branch other than `main`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deployment-foundation`: replaces the two-channel UAT-then-production requirement with one channel from `main` (built once per source tree, published as the same files that were built, after a manual approval) and extends the "pipeline declared as code" requirement with idempotency, checksums and pinned actions.

## Impact

- New: `.github/workflows/release.yml`, a small tree-lookup script it calls (tested offline), repository settings (protected `release` environment with a required reviewer; documented, not code).
- Changed: `readme.md` sections 1.4 and 2.4, `docs/adr/0007-deployment.md`, delta of `openspec/specs/deployment-foundation/spec.md`.
- Depends on JOS-205 (`npm run package:<target>` in `backend/`) and on that build reading `VID4YOU_CHANNEL`, `VID4YOU_VERSION` and `VID4YOU_RELEASE_TAG` into the bundle.
- No application code, API or database change. `update-notice` is unchanged: in the `production` channel it already compares the release tag with `/releases/latest`.
