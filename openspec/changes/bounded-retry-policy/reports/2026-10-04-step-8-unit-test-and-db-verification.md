# Step 8 Report - Unit Tests and Database State Verification

- Date: 2026-10-04
- Change: bounded-retry-policy (JOS-184)
- Agent: Claude Sonnet 5

## Commands Executed

```
cd backend
D=$(mktemp -d); export DB_PATH=$D/t.sqlite PROJECTS_ROOT=$D
npx vitest run test/retry-policy.test.ts test/stage-attempt-cycles.test.ts test/stage-attempt-recorder.test.ts \
  test/retry-scheduler.test.ts test/adapters-no-hidden-retries.test.ts test/failure-representation.test.ts \
  test/voice-over-phase.test.ts test/voice-over-session-read.test.ts
npx vitest run                                   # full suite
npx vitest run --coverage --coverage.include='src/**'   # here and at the merge base, for task 7.3
npx tsc --noEmit
```

Every run used an isolated `DB_PATH` and `PROJECTS_ROOT`, because the default store `data/skeleton.sqlite` already carries another branch's migration 13. A second series ran in a fresh `git worktree` of the branch head, which has no `backend/.secrets.json`, with `ELEVENLABS_KEY` unset, to rule out a pass that depends on local secrets.

## Database State Verification

| | Before | After |
|---|---|---|
| Default store `data/skeleton.sqlite` (read-only count) | 0 runs, 0 scenes, 0 stage_attempts, 0 provider_requests, 13 migrations | identical, not touched |
| Isolated store | absent | 0 runs, 0 scenes, 0 stage_attempts (each test file ends on `resetAll`); migrations 1-12 and 14 applied (13 is reserved for JOS-149), then discarded |

Cleanup actions: the temporary worktrees were removed; the isolated directories are under the OS temp folder. The migration backfills each pre-existing `stage_attempts` row into cycle 1 with a sequence number, which `test/stage-attempt-cycles.test.ts` checks.

## Unit Test Results

- Targeted: 8 files, 139/139 passed, about 4 s.
- Full suite: 54 files passed, 3 skipped; 1053 passed, 4 skipped, 0 failed, about 20 s. The base before this change had 948 passed.
- Fresh worktree, no secrets: two full runs, 1053 passed, 4 skipped, 0 failed each.
- Typecheck: `tsc --noEmit` clean.

## Coverage (task 7.3)

| | Statements | Branches | Functions |
|---|---|---|---|
| Merge base with the JOS-136 branch | 92.50 % | 91.16 % | 97.38 % |
| This branch | 93.17 % | 91.85 % | 97.97 % |

Coverage did not decrease in any metric.

## Spec scenario to test mapping (task 7.2)

Every scenario in `specs/stage-retry-policy/spec.md` has a test: budget per stage instance (`retry-policy`, `stage-attempt-recorder` two scenes and image/video); automatic retry, success after three failures and `Retry-After` (`stage-attempt-recorder`, `retry-policy`, `voice-over-phase`); exhaustion and not-retryable (`stage-attempt-recorder`, `voice-over-phase`, `failure-representation`); concurrent notification, hidden retries, redelivery (`stage-attempt-recorder` ignored, `adapters-no-hidden-retries`, `voice-over-phase` redelivery plus the store constraints in `stage-attempt-cycles`); resume at the failed instance and the bound provider (`retry-scheduler`, `stage-attempt-recorder`); manual retry, earlier attempts kept, refusal when not failed (`stage-attempt-recorder` `startNewCycle`); pause (`retry-scheduler`, `voice-over-phase`); restart (`retry-scheduler` rebuild); failure representation and sensitive detail (`failure-representation`).
