# Step 4 — unit tests and database verification (raise-video-time-limit, JOS-197)

- Date: 2026-10-14
- Branch: `feature/jos-197-raise-video-time-limit` (stacked on `feature/jos-194-production-deployment`, `e330be3`)

## Commands
- Targeted: `DB_PATH=/tmp/j197.sqlite PROJECTS_ROOT=/tmp/j197p npx vitest run test/providerConfig.test.ts test/attempt-deadline.test.ts test/video-time-limit.test.ts`
- Full backend, fresh temporary store, no `.secrets.json`, `ffprobe` on `PATH`: `npx vitest run`
- `cd backend && npx tsc --noEmit`; `cd frontend && npm run typecheck && npm test`

## Results
| Run | Passed | Failed | Skipped |
|---|---|---|---|
| Targeted, tests first (video only, then voice and decomposition added) | 34 | 5 | 0 |
| Backend, full, after the change | 1488 | 0 | 5 |
| Frontend | 162 | 0 | 0 |
| Typecheck | clean | | |

The first full run after the constants changed found three existing tests that encoded the old numbers: two in `attempt-deadline.test.ts` (a literal `10 s` deadline, and "video deadline later than voice", now both 600 s) and one in `restart-settle.test.ts` (an attempt sent 60 s ago was meant to be past the 10 s voice limit). They now derive from `PER_PHASE_MAX_TIME_SECONDS`; what they check is unchanged.

## Tests changed or added
- `providerConfig.test.ts`: floors video 344 s, voice 151 s, decomposition 208.6 s (the real-scale measurements); the PRD comparison reads `docs/PRD.md` instead of the frozen `PRD-v1.4.md`.
- `attempt-deadline.test.ts`: derives from the constants; new group "an attempt at the product's real script size" (151 s voice, 209 s decomposition and 344 s video not expired; each expires past 600 s).
- `restart-settle.test.ts`: the lost voice-over attempt is sent past the limit by derivation.
- New `video-time-limit.test.ts` (3 tests, fake timers) for the stage's own poll check.

## Database state
Fresh temporary stores under `/tmp/`, removed afterwards; nothing else changed.
