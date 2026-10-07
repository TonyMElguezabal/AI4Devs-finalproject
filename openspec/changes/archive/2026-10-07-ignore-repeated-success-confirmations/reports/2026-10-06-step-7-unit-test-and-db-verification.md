# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-10-06
- Change: ignore-repeated-success-confirmations (JOS-161)
- Agent: Claude Opus 5

## Commands Executed

    cd backend
    D=$(mktemp -d); export DB_PATH=$D/t.sqlite PROJECTS_ROOT=$D/projects
    npx vitest run                                  # full suite
    npx tsc --noEmit
    npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/**'   # at the proposal commit 417563b and at head
    cd ../frontend && npm run typecheck && npm test

Every run used an isolated store with a separate projects folder. The worktree has no `backend/.secrets.json` and no `ELEVENLABS_KEY`, `FAL_API_KEY` or `OPENAI*` variables.

## Unit Test Results

- Full backend suite: 82 files passed, 3 skipped; 1325 passed, 4 skipped, 0 failed.
- New tests: `test/repeated-confirmations.test.ts` (10) and `test/stub-assembly-slow.test.ts` (3).
- Frontend: typecheck clean; 2 files, 101 passed.
- Backend typecheck clean.

## Database State Verification

| | Before | After |
|---|---|---|
| Default store of the main checkout (read-only counts) | 2 runs, 0 scenes, 0 stage_attempts, 13 migrations, 17 triggers, 2 entries in `data/projects` | identical |
| This worktree's default store | absent | still absent; every run used an isolated `DB_PATH` |

Cleanup: the temporary base worktree for the coverage comparison was removed. The scratch stores are in the session scratchpad, outside the repository.

## Coverage (task 6.3)

Base is the proposal commit `417563b`, head is this branch. Per-module comparison, with a 0.005 tolerance:

| | Statements | Branches | Functions |
|---|---|---|---|
| Base | 92.19% | 92.79% | 98.68% |
| Head | 92.27% | 92.99% | 98.69% |

No module decreased. An earlier head run showed `videoProvider.ts` branches dropping to 84.05%; a re-run gave 85.29%, equal to the base. `server.ts` briefly dropped because the new `slow-success` mapping sat in untested startup code; it moved into `assemblyStubModeFor`, which is unit-tested.

## Spec scenario to test map (task 6.2)

| Scenario | Test |
|---|---|
| The same confirmation arrives twice (image) | `repeated-confirmations.test.ts` "leaves a completed chunk as chunk-complete" and "leaves a scene whose clip is generating…" |
| The same confirmation arrives twice (clip, voice-over, timestamps, decomposition) | `repeated-confirmations.test.ts` "stores one clip…"; `voice-over-phase.test.ts` "a repeated success confirmation…"; `obtain-narration-timestamps.test.ts` "already-obtained"; `decomposition-phase.test.ts` "already-registered" |
| Two confirmations arrive concurrently | `voice-over-phase.test.ts` "two concurrent success confirmations store exactly one voice-over"; `video-persistence.test.ts` "refuses a second commit" |
| A refused image confirmation leaves the scene as it is | `repeated-confirmations.test.ts` (both duplicate cases) |
| The final video is recorded once | `repeated-confirmations.test.ts` "records the first final video and refuses a second one"; "a late assembly whose final video is refused ends superseded…" |
| Assembly is not started twice | `repeated-confirmations.test.ts` the three "Assembly is not started twice" cases |
| A scene is assembled once (AC3) | `repeated-confirmations.test.ts` "a clip confirmed twice contributes exactly one clip…" |

AC1 (no duplicate result stored): image, clip and voice-over cases above. AC2 (next stage not launched again): image queue cases, clip assembly-count case, and the assembly launch cases. AC3: the assembly-input case.

## Existing tests

Task 6.1 review: the 15 existing assembly, stage and persistence files (176 tests) passed without any change, so none needed updating.

## API contract (task 10.1)

No route or schema changed, so `docs/api-spec.yml` needs no change. The `USE_STUB_ASSEMBLY_TOOL=slow-success` mode and `ASSEMBLY_STUB_DELAY_MS` are manual-testing switches, not API.
