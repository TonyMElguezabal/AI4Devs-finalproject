# Task 1.3 Report - Full-history scan with the committed allowlist

- Date: 2026-10-29
- Change: scan-secrets-in-ci
- Scanner: gitleaks 8.30.1 (darwin_arm64, archive checksum verified against the release `checksums.txt`)

## Command

`gitleaks git --redact --no-banner .` from the repository root (reads `.gitleaks.toml` and `.gitleaksignore`).

## Result

- Before the allowlist files: 88 findings over 887 commits (80 in `graphify-out/cache/stat-index.json`, 8 historical examples listed in `.gitleaksignore`).
- With the allowlist files: `889 commits scanned`, `no leaks found`, exit code 0, about 71 s.
- Working tree alone (`gitleaks dir`): 2 findings, both in `stat-index.json`, covered by the path allowlist.
