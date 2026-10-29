## Context

`.github/workflows/ci.yml` runs typecheck, lint and tests for `backend` and `frontend` on pull requests into, and pushes to, `main`, `feature/entrega-2-JAME` and `feature/entrega-3-JAME`, with `permissions: contents: read` and actions pinned by commit SHA. There is no secrets scan.

A gitleaks 8.30.1 scan of the full history on 2026-10-29 (887 commits, from `feature/entrega-3-JAME` at `fd4f251e`, `--redact`) reports 88 findings, none real:

| Findings | File | Rule | Cause |
|---|---|---|---|
| 80 | `graphify-out/cache/stat-index.json` | `generic-api-key` | file hashes in the graph cache; the file is rewritten on most commits, so the count grows with every commit (16 findings on 2026-10-20) |
| 3 | `docs/development_guide.md`, `packages/specboot/template/docs/development_guide.md` (commits `015902ab`, `7ba30485`) | `generic-api-key` | example database password in the inherited guide, replaced in PR #73 |
| 5 | `readme.md`, `prompts.md` (commit `64a9d6a4`) | `curl-auth-header`, `generic-api-key` | placeholder bearer tokens in old curl examples |

A scan of the current working tree reports only the two `stat-index.json` findings. A trial with a path allowlist for `stat-index.json` and a `.gitleaksignore` holding the eight fingerprints, each under a `#` comment line, gave "no leaks found" over the full history: gitleaks loads both files from the scanned directory without flags, and accepts comment lines in `.gitleaksignore`.

## Goals / Non-Goals

**Goals:**

- Fail a pull request or push that adds a non-allowlisted finding, in any of its commits.
- Pinned, checksum-verified scanner; read-only job with no secrets.
- Every false positive listed in the repository with a reason.
- One-line local command in `readme.md`.

**Non-Goals:**

- Rewriting history to remove the old example strings (they are not secrets; JOS-203 decided not to rewrite).
- A pre-commit hook (local use stays opt-in through the documented command).
- Custom rules for provider key formats: the default rule set already has OpenAI and generic API key rules, and the dry run (task group 4) checks they fire.
- Scrubbing key-shaped text from telemetry (JOS-212).
- GitHub's own secret scanning or push protection (repository setting, not code; can be enabled independently).

## Decisions

### Decision 1: Run the gitleaks binary, not `gitleaks/gitleaks-action`

The job downloads `gitleaks_8.30.1_linux_x64.tar.gz` from the GitHub release, checks it with `sha256sum -c` against `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` (from the release `checksums.txt`, verified locally on 2026-10-29), and runs it.

- **Why:** the ticket asks for a pinned version with a verified checksum; the binary gives both in two lines, keeps the exact CLI the README documents for local use, and needs no token. The action needs `GITHUB_TOKEN`, a license key for organization repositories, and hides the scan range behind its own logic.
- **Alternative:** the action pinned by SHA. Rejected for the reasons above.
- **Version:** 8.30.1 is the version of the JOS-203 scan and the trial above, so the allowlist fingerprints are known to match it. Upgrading is a one-line change of version and checksum, followed by a full-history local scan.

### Decision 2: A `secrets` job in the existing `ci.yml`

A second job in `ci.yml`, not a new workflow file.

- **Why:** same triggers and permissions as the test job; one workflow to read and one check list on the pull request. The job does not depend on the test matrix, so it runs in parallel.
- **Alternative:** `.github/workflows/secrets.yml`. Rejected: duplicates the trigger block for no gain.

### Decision 3: Scan the commit range, full history as fallback

`actions/checkout` with `fetch-depth: 0` (same pinned SHA as the test job), then one shell step:

- `pull_request`: `--log-opts="<base.sha>..<head.sha>"` — every commit of the pull request; commits merged in from the base branch are excluded because they are reachable from the base.
- `push`: `--log-opts="<before>..<after>"`; if `before` is all zeros (new branch) or not in the clone (force push), no `--log-opts`, which scans the full history.

Always `gitleaks git --redact --no-banner .`; the default output lists file, line, rule and commit, and the exit code is non-zero on a finding.

- **Why:** criterion 3 asks for every commit, not the final tree (`gitleaks dir` would miss a key added and removed). Range scans take seconds, while the full history takes about 70 s and grows with every graph rewrite.
- **Alternative:** full history on every run. Rejected for cost; it is the fallback and the documented local command instead.

### Decision 4: Two allowlist files, split by kind of false positive

- `.gitleaks.toml`: `[extend] useDefault = true` and one `[[allowlists]]` entry with a `description` and `paths = ['''^graphify-out/cache/stat-index\.json$''']`. A path entry is needed because the file gets new hashes on most commits, so fingerprints would go stale on every graph build. The path is anchored to that one file, which only holds hashes and modification times written by graphify.
- `.gitleaksignore`: the eight historical fingerprints (`<commit>:<file>:<rule>:<line>`), each under a `# <reason>` line. A fingerprint matches one finding in one commit, so a new key in `readme.md` or the guides is still reported.
- **Alternative:** allowlist the whole `graphify-out/` folder or the documents by path. Rejected: `graph.json` and the wiki contain text copied from source files, so a real key in source would be hidden there too, and a path entry for `readme.md` would hide future leaks in the most edited file.

### Decision 5: Local command

`readme.md` 2.6 adds, next to the test commands, `gitleaks git --redact .` from the repository root (full history, about 70 s, same config and ignore files), with the version CI pins and a note to install it with `brew install gitleaks` or from the release page.

## Risks / Trade-offs

- [graphify starts writing other cache files with hash-like strings] → the scan fails on the new path; add an anchored path entry with a reason in the same pull request. Not pre-emptively widened (Decision 4).
- [A force push to a protected branch drops the previous head from the clone] → the step falls back to the full history, which is slower but still correct.
- [A real key is committed and the pull request fails] → the key is already exposed on GitHub; the fix is to revoke and rotate it at the provider, then rewrite the branch. The README note says so in one line.
- [The default rule set misses a provider key format] → the dry run checks an OpenAI-shaped key; Fal.ai, RunningHub and ElevenLabs keys fall under `generic-api-key` when assigned to a key-like name. A custom rule is added only if the dry run shows a gap.
- [gitleaks release asset disappears or changes] → the checksum check fails the job closed; pin a new version deliberately.

## Migration Plan

Merge the workflow and allowlist files together; the first run on the pull request itself proves the allowlist. Rollback is reverting the commit. No data migration.

## Open Questions

None.
