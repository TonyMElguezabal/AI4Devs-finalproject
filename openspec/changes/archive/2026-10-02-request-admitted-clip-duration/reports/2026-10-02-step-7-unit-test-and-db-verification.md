# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-10-02
- Change: request-admitted-clip-duration (JOS-147)
- Agent: Claude Sonnet 5

## Commands Executed

- `npx vitest run test/admitted-durations.test.ts test/scene-registration.test.ts test/scene-registration-persistence.test.ts test/content-lock.test.ts test/scene-api-surface.test.ts` (targeted)
- `npm run typecheck`
- `npm test` (full suite, default store, no env override)

## Unit Test Results

- Targeted tests: 150 passed, 0 failed, 0 skipped (5 files)
- Full suite: 630 passed, 0 failed, 2 skipped (intentional contract-test skips, pre-existing), 632 total
- Runtime: ~9.2s
- Notes: no flaky behaviour observed in this run. (A real-timer `orchestrator.test.ts` retry-budget test flaked once earlier in this session under full-suite load, confirmed in task 2.3 as a pre-existing timing issue unrelated to this change — not observed in this step's runs.)

## Database State Verification

Default store (`backend/data/skeleton.sqlite`, `backend/data/projects/`), no `DB_PATH`/`PROJECTS_ROOT` override.

- Pre-test baseline (after restoring a stray leftover from an earlier split-segmentation test run in this session — "Clause split test", 1 run / 2 scenes, via `resetAll()`):
  - Row counts: `runs` 0, `scenes` 0, `narration_timestamps` 0, `voice_overs` 0, `provider_requests` 0, `scene_results` 0, `stage_attempts` 0
  - Applied migrations: `[2, 3, 4, 5, 6, 7, 8, 9, 10]` — migration 10 (this change) already present and correctly idempotent
  - Triggers: 15, including the two new ones, `scenes_requested_duration_seconds_locked` and `scenes_duration_warning_locked`
  - `data/projects/`: empty
- Post-test validation: identical row counts (all 0), identical migration list, identical trigger count (15)
- One stray empty folder found after the full suite run, `data/projects/Traversal Test 2026-10-01 18-17` (from a path-traversal security test that creates a project folder outside the per-file `resetAll()` ordering under parallel test execution — the same category of harmless artifact `generate-chunk-image`'s own step-8 report documented and removed)
- State restored: Yes
- Restoration actions: ran `resetAll()` once before capturing the baseline (to clear the pre-existing "Clause split test" leftover), and removed the stray empty `Traversal Test ...` folder after the full-suite run

## Scenario-to-test mapping (task 6.4)

All 11 scenarios across `specs/clip-duration-request/spec.md`'s 5 requirements:

| Requirement | Scenario | Test |
|---|---|---|
| Smallest speed change | Smallest speed change, not fewest seconds | `admitted-durations.test.ts` › "picks the admitted duration by smallest speed change, not fewest seconds" |
| Smallest speed change | A shorter admitted duration is chosen when it is closer | `admitted-durations.test.ts` › "picks a shorter admitted duration when it is closer" |
| Smallest speed change | An exact tie goes to the longer duration | `admitted-durations.test.ts` › "gives an exact tie to the longer duration" |
| Stays within range | Below the minimum | `admitted-durations.test.ts` › "requests the smallest admitted duration below the minimum, with no warning" |
| Stays within range | At the maximum | `admitted-durations.test.ts` › "requests the maximum at exactly the maximum, with no warning" |
| Over the maximum | Unsplittable sentence | `admitted-durations.test.ts` › "requests the maximum with exceeds-maximum above it"; `scene-registration.test.ts` › "stores the maximum with exceeds-maximum for an unsplittable chunk, without failing the chunk or the session" |
| Stored and never changes | Stored and read back | `scene-registration-persistence.test.ts` › "reads each registered chunk back with the requested duration and warning registration chose" |
| Stored and never changes | Direct update refused | `scene-registration-persistence.test.ts` › "refuses a change of %s, naming the field, and leaves the stored value unchanged" |
| Stored and never changes | A different admitted set later | `scene-registration.test.ts` › "stays unchanged under a later, different admitted-durations set, and refuses a second registration (AC5)" |
| Readable | Exposed on the session read | `scene-api-surface.test.ts` › "is carried by every scene of the session read" |
| Readable | Skeleton scene | `scene-api-surface.test.ts` › "is omitted for a scene created without a decomposition" |

## Coverage check (task 6.5)

Base `b5ec062` (isolated git worktree) vs head, each run with its own scratch `DB_PATH`/`PROJECTS_ROOT`, `@vitest/coverage-v8@3.2.7` installed locally without saving to `package.json`:

| Metric | Base | Head |
|---|---|---|
| Statements | 95.28% | 95.42% |
| Branches | 91.29% | 91.36% |
| Functions | 98.72% | 98.74% |
| Lines | 95.28% | 95.42% |

No file regressed in substance. `sceneRegistration.ts` branch % moved 97.10%→97.05%, but the uncovered lines are the same pre-existing re-throw branch (base lines 170-171, head lines 180-181 — shifted down by the new code inserted above it, not a new gap); the 0.05pp dip is denominator dilution from one new, already-covered branch.

## Outcome

- Step 7 status: PASS
- Blocking issues: none
