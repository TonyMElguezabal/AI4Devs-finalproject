# Step 9 — unit tests and database verification (run-session-end-to-end, JOS-195)

- Date: 2026-10-13
- Change: `run-session-end-to-end`
- Branch: `feature/jos-195-run-session-end-to-end` (base `2fa63dc`)

## Commands
- Targeted, during groups 2-7: `DB_PATH=/tmp/j195/s.sqlite PROJECTS_ROOT=/tmp/j195/p npx vitest run test/<file>` for the six new files and the decomposition, restart, orchestrator, image-stage, video-stage and assembly files.
- Full backend, three times, each with its own `DB_PATH`/`PROJECTS_ROOT` under `/tmp/j195/run<n>/`, no `.secrets.json`, `ffprobe` on `PATH`: `npx vitest run`.
- `cd backend && npx tsc --noEmit`; `cd frontend && npm run typecheck && npm test`.

## Results
| Run | Passed | Failed | Skipped |
|---|---|---|---|
| Backend, first full run after groups 3-7 (before group 8) | 1461 | 11 | 4 |
| Backend, after group 8, run 1 | 1472 | 0 | 4 |
| Backend, after group 8, run 2 | 1472 | 0 | 4 |
| Backend, after group 8, run 3 | 1472 | 0 | 4 |
| Frontend | 162 | 0 | 0 |
| Typecheck, backend and frontend | clean | | |

New tests: 33 (`decomposition-stubs` 4, `narration-handoff-launcher` 10, `narration-handoff-voice` 5, `narration-handoff-boot` 6, `assembly-default` 6, `session-end-to-end` 2). Integration head before: 1439 passed, 4 skipped.

## The 11 failures after the hand-off, and what they were
| File | Failing | Cause | Fix |
|---|---|---|---|
| `voice-over-phase.test.ts` | 6 | the stored narration now starts decomposition; with the default key-less providers it ends `failed` (phase `decomposition`), so "reaches voice-over-complete", "no failure" and the published-state order no longer held | `launchDecompositionFor` mocked as a no-op in the file (design Decision 6); assertions untouched |
| `voice-over-retry.test.ts` | 1 | same | same |
| `voice-over-session-read.test.ts` | 1 | same | same |
| `late-result.test.ts` | 1 | same | same |
| `orchestrator.test.ts` | 1 | timing: passes 3 of 3 alone, on this branch and on the integration head, and in all three later full runs; the known flake of that file | none |
| `restart-concurrency.test.ts` | 1 | timing under full-run load: passes 3 of 3 alone on both trees and in all three later full runs | none |

Both timing failures appeared only in the first full run, and not in three later ones; neither file touches the code changed here other than through `recoverOnBoot`, which their alone-runs exercised.

## Database state
Every run used a fresh temporary store under `/tmp/j195/` (created before, discarded after); the repository's own `backend/data/` does not exist in this worktree and was not created. The suite resets the store at the start of each test. Nothing was restored because nothing outside the temporary directories changed. `git status` shows only the intended source, test and artifact files.

## Cleanup
Temporary stores under `/tmp/j195/` removed at the end of the step.
