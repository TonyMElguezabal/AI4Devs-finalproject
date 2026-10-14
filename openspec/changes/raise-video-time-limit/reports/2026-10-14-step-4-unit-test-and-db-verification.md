# Step 4 — unit tests and database verification (raise-video-time-limit, JOS-197)

- Date: 2026-10-14
- Branch: `feature/jos-197-raise-video-time-limit` (stacked on `feature/jos-194-production-deployment`, `e330be3`)

## Commands
- Targeted: `DB_PATH=/tmp/j197.sqlite PROJECTS_ROOT=/tmp/j197p npx vitest run test/providerConfig.test.ts test/video-time-limit.test.ts test/attempt-deadline.test.ts`
- Full backend, fresh temporary store, no `.secrets.json`, `ffprobe` on `PATH`: `npx vitest run`
- `cd backend && npx tsc --noEmit`; `cd frontend && npm run typecheck && npm test`

## Results
| Run | Passed | Failed | Skipped |
|---|---|---|---|
| Targeted, before the change (tests first) | 20 | 3 | 0 |
| Targeted, after | 36 | 0 | 0 |
| Backend, full | 1482 | 0 | 5 |
| Frontend | 162 | 0 | 0 |
| Typecheck | clean | | |

The three tests that failed first were the right ones: `is 600 s`, "still pending after 344 s" (the constant was 240, so the second attempt had started) and the slow-tail floor of 344 s.

## Tests changed
`providerConfig.test.ts`: the video floor is 344 s, and the PRD comparison reads `docs/PRD.md` instead of the frozen `docs/PRD-v1.4.md`. New: `video-time-limit.test.ts` (3 tests, fake timers). `attempt-deadline.test.ts` derives its numbers from the constant and needed no change; no other test mentioned 240.

## Database state
Fresh temporary stores under `/tmp/`, removed afterwards; nothing else changed.
