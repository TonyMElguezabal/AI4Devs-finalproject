## Why

The MVP closure (JOS-203, item I1) ran gitleaks once over the whole history and found no real secret, but nothing stops a real provider key (OpenAI, Fal.ai, RunningHub, ElevenLabs) from being committed tomorrow: CI runs only type checks, lint and tests. JOS-211 makes the scan a CI gate so a leak fails the pull request before it merges.

## What Changes

- New `secrets` job in `.github/workflows/ci.yml`, on the same pull request and push triggers as the test job. It installs gitleaks at a pinned version, verifies the archive checksum, and scans the commits of the pull request (or of the push), not only the final tree. Findings are redacted: the log names the file, line and rule, never the value.
- New `.gitleaks.toml` at the repository root: the default gitleaks rules plus one path allowlist for `graphify-out/cache/stat-index.json`, whose file hashes are rewritten on every graph build and match the generic key rule.
- New `.gitleaksignore` at the repository root: the eight historical false positives outside the graph cache (an example database password in two copies of an inherited development guide, and placeholder curl bearer examples in old `readme.md` and `prompts.md` revisions), each by fingerprint with a one-line reason.
- `readme.md` section 2.6 documents the one-line local command; section 2.5 and the release documents (`docs/release/mvp-closure-report.md`, `mvp-release-gates.md`, `cleanup-inventory.md`) stop listing the scan as a gap.

## Capabilities

### New Capabilities

- `secrets-scanning`: the CI secrets scan, its scope (commits of the pull request or push), the pinned and verified scanner, redacted output, and the reviewed allowlist.

### Modified Capabilities

None. The lint gate (`static-analysis`) and the test job are not changed.

## Impact

- CI: one more job, read-only `contents` permission (already the workflow default), no secrets. Range scans take seconds; a full-history scan (887 commits, about 865 MB of diffs, mostly `graphify-out/graph.json` rewrites) takes about 70 s and runs only when the push range cannot be resolved.
- Contributors: a pull request that adds a key-shaped string fails until the string is removed from every commit of the branch (rewrite the branch) or, if it is a false positive, added to the allowlist with a reason in the same pull request.
- No application code, API, database or packaged executable changes.
