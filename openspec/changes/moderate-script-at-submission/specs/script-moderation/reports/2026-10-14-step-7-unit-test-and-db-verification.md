# Step 7 — Unit tests and database verification

**Change:** moderate-script-at-submission (JOS-187)
**Date:** 2026-10-14
**Branch:** `feature/jos-187-moderate-script-at-submission`

## DB baseline (7.1, 7.4)

Local `DB_PATH` (`backend/data/skeleton.sqlite` in the JOS-187 worktree), counted before and
after the full backend run:

| Table | Before | After |
|---|---|---|
| `runs` | 0 | 0 |
| `scenes` | 0 | 0 |
| `stage_attempts` | 0 | 0 |

No restore was needed.

## Results

| Run | Result |
|---|---|
| Baseline before any change (0.2) | backend 1483 passed / 5 skipped; frontend 167 passed |
| Targeted: `script-moderation`, `script-moderation-gate`, `providerConfig`, `adapters-no-hidden-retries` (7.2) | all passed |
| Full backend, `OPENAI_KEY` unset, no `backend/.secrets.json` in the worktree (6.1, 6.2, 7.3) | 97 files passed, 4 skipped; 1507 passed / 5 skipped |
| `npm run typecheck` (backend) | clean |
| Full frontend (7.3) | 169 passed (167 + 2 new) |

## Notes

- 6.1: every existing test that calls `POST /sessions` passes unchanged with the default `clean`
  moderator that `test/setup.ts` installs.
- 6.2: the worktree has no secrets file and `OPENAI_KEY` was unset, so a test that reached the
  real moderation endpoint would have produced a `503`. None did.
- New tests: `test/script-moderation.test.ts` (12), `test/script-moderation-gate.test.ts` (5),
  one more case in `test/adapters-no-hidden-retries.test.ts` per failure kind, two in
  `providerConfig.test.ts`, two in `frontend/test/components.test.tsx`.
