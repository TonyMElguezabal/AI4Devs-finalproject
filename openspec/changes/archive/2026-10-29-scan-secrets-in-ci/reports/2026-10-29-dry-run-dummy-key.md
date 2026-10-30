# Task 4 Report - Dry run with a dummy key

- Date: 2026-10-29
- Change: scan-secrets-in-ci
- Scanner: gitleaks 8.30.1, run locally with the committed `.gitleaks.toml` and `.gitleaksignore`
- Branch: throwaway `dryrun/jos-211-dummy-key` from the feature branch, deleted afterwards. No GitHub pull request was opened.

## Task 2.5 - range logic of the CI step

The `run` block of the scan step was extracted from `ci.yml` and executed with a stub `gitleaks` that prints its arguments:

| Event | Inputs | Arguments passed |
|---|---|---|
| pull_request | base, head | `git --redact --no-banner --log-opts=<base>..<head> .` |
| push | known `before` | `git --redact --no-banner --log-opts=<before>..<after> .` |
| push, new branch | `before` = 40 zeros | `git --redact --no-banner .` (full history) |
| push, force push | `before` unknown to the clone | `git --redact --no-banner .` (full history) |

(`--verbose` was added after task 4.1, below.)

## Task 4.1 - key added in one commit, removed in the next

Commit 1 added `dummy.env.txt` with an OpenAI-shaped dummy key; commit 2 removed it. `gitleaks git --redact --verbose --no-banner --log-opts="<base>..HEAD" .` exited non-zero and reported:

```
Finding:     OPENAI_API_KEY=REDACTED
Secret:      REDACTED
RuleID:      generic-api-key
File:        dummy.env.txt
Line:        1
Commit:      bfa974ab...   (the commit that added it)
```

The dummy key text appears 0 times in the output. The final tree was clean, so a tree-only scan would have missed it.

**Finding from this run:** without `--verbose` the same scan prints only `leaks found: 1`, not file or rule. `--verbose` was added to the CI step, the design (Decision 3) and the README command.

## Task 4.2 - new key-shaped line in a fingerprinted file

A key-shaped line appended to `readme.md` (which has historical fingerprints in `.gitleaksignore`) was reported (`generic-api-key`, `readme.md`, line 732, its own commit). The fingerprints do not hide new findings.

## Task 4.3 - checksum mismatch

`shasum -a 256 -c` against a wrong digest for the real downloaded 8.30.1 archive printed `FAILED` and exited 1; the CI step runs `sha256sum -c -` under bash's default `set -e`, so the job stops before the scanner runs.

## Clean-up

`git branch -D dryrun/jos-211-dummy-key`; `git status` clean on the feature branch.
