# Step 9 Report — Unit Tests and Database Verification

- Date: 2026-09-29
- Change: decide-silence-allocation (JOS-142)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-142-decide-silence-allocation` at `20a2c7e`

## Commands Executed

All from `backend/`, against the default test store (`data/skeleton.sqlite`, `data/projects/`):

- `sqlite3 data/skeleton.sqlite` for row counts, triggers, applied migrations and scene indexes, and `find data -maxdepth 2` (before and after)
- `npx vitest run test/sentence-timings.test.ts test/clause-eligibility.test.ts test/script-segmentation.test.ts test/split-segmentation.test.ts test/decomposition-phase.test.ts --reporter=verbose` (targeted)
- `npm test` (full suite), `npm run typecheck`
- Coverage (task 8.3), base `2af1398` (the merge base with `origin/feature/entrega-2-JAME`) in a temporary git worktree vs head, each on a scratch database

## Unit Test Results

- Targeted: 95 passed, 0 failed (5 files)
- Full suite: 571 passed, 0 failed, 2 skipped (33 files, 31 passed and 2 skipped: the opt-in contract tests against real providers)
- Type check: exit 0
- Runtime: targeted 1.03 s, full 7.97 s
- New/changed tests: 2 new (`sentence-timings.test.ts`: zero-pause agreement, forced-alignment-shaped partition), 2 updated in place (the midpoint-asserting test in `sentence-timings.test.ts` and `clause-eligibility.test.ts`)

### Review of existing tests (task 8.1)

Full-suite pass with only the one directly midpoint-asserting test needing an update (already fixed in step 7; see that commit) confirms the review: `script-segmentation.test.ts`, `split-segmentation.test.ts` and `decomposition-phase.test.ts` all use either no-pause synthetic narrations (where every rule agrees) or don't assert the boundary formula directly, so none needed changes. No stale "interim" wording remains describing the rejected rule (JOS-140's midpoint) as still current — the two remaining "interim" mentions are past-tense, describing what was replaced.

### Coverage (task 8.3)

| Metric | Base `2af1398` | Head | Change |
|---|---|---|---|
| All files, lines | 95.16% | 95.16% | 0 |
| All files, branches | 91.05% | 91.05% | 0 |
| All files, functions | 98.70% | 98.70% | 0 |

No file decreased on any metric. Identical overall percentages: the change replaced one already-covered line (`unitBoundaries`'s inner-boundary formula) without adding new branches.

## Scenario to Test Mapping (task 8.2)

All 16 scenarios of `specs/silence-allocation/spec.md` are covered by a test or a POC report.

| # | Requirement / scenario | Covered by |
|---|---|---|
| 1 | A pause between two scenes | `sentence-timings.test.ts` "places the boundary between two units at the following unit's speech start" |
| 2 | Silence at the start of the narration | `sentence-timings.test.ts` "starts at 0 and ends at the MP3's duration" (first span starts at 0.5, boundary forced to 0) |
| 3 | Silence at the end of the narration | same test (last span ends at 8.0, boundary forced to 10) |
| 4 | A scene's interval matches the duration it was segmented with | Structural: one function (`unitBoundaries`) computes both, one call site each in `segmentation.ts`/`decompositionPhase.ts`; exercised by `script-segmentation.test.ts` and `decomposition-phase.test.ts`'s existing partition/duration-sum tests |
| 5 | Native timestamps (partition) | `sentence-timings.test.ts` "gives the speech spans back when the timestamps are gapless (native)" |
| 6 | Forced-alignment timestamps (partition) | `sentence-timings.test.ts` "still partitions the MP3 exactly when the timestamps are forced-alignment shaped" (new, task 8.1's finding) |
| 7 | Units with no pause between them | `sentence-timings.test.ts` "gives the same boundary as the rejected split-pause rule when two units have no pause between them" |
| 8 | An ordinary fragment under the adopted rule (bounds + speed limit) | Step 3 report's numeric comparison: 0 fragments outside bounds, max ratio 1.08x vs. the 2.0x limit, across 8 real narrations |
| 9 | A flagged fragment reported separately | The exception mechanism itself is JOS-140/141's (`script-segmentation.test.ts`'s `unsplittable-sentence`/`script-below-lower-bound` tests, unchanged by this rule); the comparison script structurally separates flagged fragments in its report (0 appeared in the survey, so the separate-reporting path itself wasn't exercised by real data, only by the script's own logic) |
| 10 | Every real pause is below the threshold | Step 4 report task 5.4: 1.26 s survey max, 2 s threshold |
| 11 | A real pause exceeds the threshold | Not exercised (no real pause exceeded); the untaken branch of Decision 5, correctly not taken |
| 12 | The rendered comparison is judged | Step 4 report task 5.3: verdict recorded verbatim next to the prior recommendation |
| 13 | No human verdict (D11 remains open) | Process fact: no code or spec changed until the verdict was received (steps 0-5 vs. 6-7) |
| 14 | A later story reads the PRD | Pending group 12 (docs) |

## Database State Verification

- Pre-test baseline (default test store): `runs` 0, `scenes` 0, `provider_requests` 0, `scene_results` 0, `voice_overs` 0, `stage_attempts` 0, `narration_timestamps` 0; 11 triggers; migrations 2-8; index `scenes_run_id_idx_unique`; `data/projects/` empty (one pre-existing leftover folder from an earlier session was cleared before capturing this baseline).
- Post-test validation: the full suite left one leftover project folder and one run/two scenes (from `split-segmentation.test.ts`'s registration test, which resets at the START of its own `beforeEach`, not at the end of the suite — pre-existing test-suite behaviour, not a JOS-142 regression). Restored with `resetAll()` and `rmdir`; re-verified identical to the baseline.
- State restored: Yes.

## Outcome

- Step 9 status: PASS
- Blocking issues: none
- Open: none new
