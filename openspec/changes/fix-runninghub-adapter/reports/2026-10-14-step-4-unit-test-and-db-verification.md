# Step 4 — unit tests and database verification (fix-runninghub-adapter, JOS-196)

- Date: 2026-10-14
- Branch: `feature/jos-196-fix-runninghub-adapter` (base `2fa63dc`)

## Commands
- Targeted: `DB_PATH=/tmp/j196/s.sqlite PROJECTS_ROOT=/tmp/j196/p npx vitest run test/video-provider.test.ts test/adapters-no-hidden-retries.test.ts` (rewritten tests seen failing against the old adapter first, 12 of them, then passing)
- Full backend with a fresh temporary store, no `.secrets.json`: `npx vitest run`
- `cd backend && npx tsc --noEmit`; `cd frontend && npm run typecheck && npm test`

## Results
| Run | Passed | Failed | Skipped |
|---|---|---|---|
| Backend, targeted (2 files) | 56 | 0 | 0 |
| Backend, full | 1446 | 0 | 5 (4 existing + the new key-gated contract test) |
| Frontend | 162 | 0 | 0 |
| Typecheck | clean | | |

The integration head has 1439 passed, 4 skipped; this change adds 7 net tests (the RunningHub adapter group went from 8 to 15) and one contract file.

## Tests whose assertions changed
`video-provider.test.ts` (RunningHub group, rewritten to the live shapes); `adapters-no-hidden-retries.test.ts` needed no change (its upload path `/media/upload` is the same). No other test mentioned the old paths or fields.

## Database state
Fresh temporary store under `/tmp/j196/`, removed afterwards; this worktree has no `backend/data`. Nothing else changed.
