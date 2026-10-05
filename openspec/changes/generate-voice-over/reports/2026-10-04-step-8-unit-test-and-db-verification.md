# Step 8 Report - Unit Tests and Database State Verification

- Date: 2026-10-04
- Change: generate-voice-over (JOS-136)
- Agent: Claude Sonnet 5

## Commands Executed

```
cd backend
export DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects
npx vitest run test/voice-over-phase.test.ts test/voice-over-session-state.test.ts test/voice-over-session-read.test.ts \
  test/voice-provider.test.ts test/voice-launch-guard.test.ts test/voice-over-persistence.test.ts \
  test/session-creation.test.ts test/session-read.test.ts
npx vitest run                  # full suite, run four times
npx tsc --noEmit
```

The isolated `DB_PATH` and `PROJECTS_ROOT` follow `docs/backend-standards.md` (Persistence, test isolation). A second full-suite series ran in a fresh `git worktree` of the branch head with no `backend/.secrets.json` and no `ELEVENLABS*` variable in the environment, to rule out a pass that depends on local secrets.

## Database State Verification

| | Before | After |
|---|---|---|
| Isolated store `data/test.sqlite` | absent | present with 0 runs, 0 scenes, 0 voice_overs, 0 stage_attempts (each test file ends on its own `resetAll`), then deleted |
| Isolated folders `data/test-projects/` | absent | present with one leftover folder from the last test, then deleted |
| `*.mp3` files under `data/` after the run | none | none |
| Default store `data/skeleton.sqlite` | 0 runs, 0 scenes, 0 voice_overs, 0 stage_attempts | not touched by this step |

Cleanup actions: deleted `data/test.sqlite`, its `-shm` and `-wal` files and `data/test-projects/`; confirmed `ls data` shows only the default store files. The two temporary worktrees were removed.

**Process note**: earlier groups of this change (2 to 7) ran `npx vitest run` without the isolation variables, so those runs wrote to and reset the default `data/skeleton.sqlite` and `data/projects/`. It holds only test debris (0 rows) and the `*.pre-curl-backup` copies from a previous story were left untouched. This step ran isolated, and the default store was not used.

## Unit Test Results

- Targeted: 8 files, 149/149 passed, 3.7 s.
- Full suite, run 1 (isolated paths): 947 passed, 4 skipped, **1 failed** (`orchestrator.test.ts`, "a long pause leaves a completed result unchanged"). Runs 2 to 4: 948 passed, 4 skipped, 0 failed (about 17 s).
- Typecheck: `tsc --noEmit` clean.
- Fresh worktree, no secrets: runs 1 and 3 had 3 and 1 failures, all in `orchestrator.test.ts` (retry budget and visual correction tests); runs 2 and 4 had 948 passed, 0 failed.
- The failing tests pass when `orchestrator.test.ts` runs alone (24/24, at the base commit and at this branch).
- **Same flake at the base commit**: at `ecfe430` (before this change), 1 of 2 full runs failed in `orchestrator.test.ts` ("a manual retry after failure starts a fresh 1 + RETRY_BUDGET cycle"). These tests wait on real timers, and the failures appear when the full run is slow (about 20 s against about 17 s). It is a timing flake that exists before this change, not a defect introduced by it. The voice launcher only holds work for sessions with no scenes, and these tests use sessions with a scene.
- Totals: 952 tests (948 pass, 4 skipped opt-in contract tests); the base had 864.

## Outcome

- Step 8 status: PASS
- Blocking issues: none. The pre-existing `orchestrator.test.ts` timing flake is recorded here and is not fixed by this change.
