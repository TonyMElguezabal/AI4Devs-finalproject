# Step 6 Report - Unit Tests and Database Verification

- Date: 2026-09-28
- Change: split-sentences-at-clause-boundaries (JOS-141)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-141-split-at-clause-boundaries` at `b8976a2`

## Commands Executed

All from `backend/`, against the default test store (`data/skeleton.sqlite`, `data/projects/`) unless noted:

- `sqlite3 data/skeleton.sqlite` for row counts, triggers, applied migrations and scene indexes, and `find data -maxdepth 2` (before and after)
- `npx vitest run test/clause-boundaries.test.ts test/clause-eligibility.test.ts test/split-segmentation.test.ts --reporter=verbose` (targeted)
- `npm test` (full suite), `npm run typecheck`
- Coverage (task 5.3), base `feature/jos-140-segment-script` at `1908dd7` in a temporary git worktree vs head, each on a scratch database: `npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/**'`
- `node -e "import('./src/<module>.ts')..."` for the two new modules, and `test/server-runtime-load.test.ts`

## Unit Test Results

- Targeted: 42 passed, 0 failed (3 files)
- Full suite: 569 passed, 0 failed, 2 skipped (33 files, 31 passed and 2 skipped: the opt-in contract tests against real providers)
- Type check: exit 0 (`erasableSyntaxOnly` on); `server-runtime-load.test.ts` passes; both new modules (`clauseBoundaries.ts`, `clauseSplitting.ts`) load under plain Node
- Runtime: targeted 0.59 s, full 8.26 s
- New tests in this change: 15 (`clause-boundaries.test.ts`, including one regression test for the Unicode word-boundary bug below), 16 (`clause-eligibility.test.ts`), 11 (`split-segmentation.test.ts`) = 42

### Review of JOS-140's and JOS-144's tests (task 5.1)

- `scene-registration*.test.ts` (JOS-144) build `SegmentedFragment[]` by hand and never call `segmentScript`; clause splitting cannot affect them. Confirmed by grep (0 references to `segmentScript`/`buildUnits` outside this change's own test files and `script-segmentation.test.ts`).
- `decomposition-phase.test.ts` calls `segmentScript` indirectly through `runDecompositionPhase`, but its two scripts (`SCRIPT`, `UNGROUPABLE_SCRIPT`) contain no comma, semicolon or listed conjunction, so no sentence there is ever split-eligible in a way that changes the outcome.
- `script-segmentation.test.ts` (JOS-140's own) uses either the synthetic `scenes()` helper ("Scene N is here.", no punctuation) or real prose whose durations never reach the free (>15 s) or borrowed (short + next > 15 s) thresholds. The full suite passing unchanged (569/569, same as before this change plus the 42 new tests) confirms empirically that no existing test needed updating beyond one stale comment (a `describe` title still said "interim, until JOS-141").

### Coverage (task 5.3)

| Metric | Base (JOS-140, `1908dd7`) | Head | Change |
|---|---|---|---|
| All files, lines | 94.98% | 95.16% | +0.18 |
| All files, branches | 90.54% | 91.05% | +0.51 |
| All files, functions | 98.63% | 98.70% | +0.07 |

New files: `clauseBoundaries.ts` and `clauseSplitting.ts`, both 100% of lines and branches. Two files this change does not touch showed a sub-0.3 percentage-point branch decrease (`db.ts` 89.68% → 89.60%, `orchestrator.ts` 78.48% → 78.20%): neither imports anything from this change (confirmed by grep), and the drop is the same kind of denominator artifact recorded in JOS-144's step-8 report (V8 counts a function's branches once any test exercises it, so which branch is "the uncovered one" can shift between full-suite runs without any branch actually losing coverage). No file this change touches decreased on any metric.

## Scenario to Test Mapping (task 5.2)

All 12 scenarios of `specs/clause-splitting/spec.md` have a test. `CB` = `clause-boundaries.test.ts`, `CE` = `clause-eligibility.test.ts`, `SS` = `split-segmentation.test.ts`.

| # | Requirement / scenario | Tests |
|---|---|---|
| 1 | Clause boundaries: commas, semicolons and conjunctions | CB "lies after a comma or a semicolon, before a listed conjunction, and counts '; and' once" |
| 2 | Clause boundaries: a comma inside a number | CB "has no boundary inside a number" |
| 3 | Clause boundaries: Spanish conjunctions | CB "finds Spanish conjunctions" |
| 4 | A sentence over the maximum: a long sentence with boundaries (AC1) | SS "becomes pieces whose chunks each last at most 15 s" |
| 5 | A sentence over the maximum: the best split is chosen (AC1) | SS "chooses the split needing the least total speed change among several" |
| 6 | A short sentence borrows the next sentence's first clause (AC2) | SS "groups the short sentence with the first piece only; the rest of the sentence is untouched" |
| 7 | No other sentence is split (AC3) | SS "keeps a 9 s sentence with commas whole in an ordinary script" |
| 8 | No clause boundary: a long sentence without boundaries (AC4) | SS "flags an 18 s sentence with no comma, semicolon or listed conjunction" |
| 9 | No clause boundary: short + long without boundaries (AC4) | SS "flags a 3 s sentence before a 14 s sentence with no boundary" |
| 10 | No clause boundary: a split sentence is not flagged (AC4) | SS "does not flag any piece of a sentence that was actually split" |
| 11 | A short clause piece follows the short-sentence rule | SS "joins the unit that follows it, mid-script", "joins the unit before it when it ends the script" (both branches of the one scenario) |
| 12 | Split pieces reproduce the sentence (AC5) | SS "joins back to the original script apart from whitespace" (English); CE "splits a Spanish sentence at its boundaries, keeping accents intact"; CB "keeps accents and inverted marks intact" (Spanish, at the boundary-finding level) |

## Database State Verification

- Pre-test baseline (default test store): `runs` 0, `scenes` 0, `provider_requests` 0, `scene_results` 0, `voice_overs` 0, `stage_attempts` 0, `narration_timestamps` 0; 11 triggers; migrations 2-8; index `scenes_run_id_idx_unique`; `data/` held one pre-existing empty leftover folder from the consultation test (`Traversal Test 2026-09-28`, not created by this session).
- Post-test validation: identical byte-for-byte (`diff` of the captured snapshot, including the same leftover folder name — the consultation test that creates it did not run again in the full suite's ordering this time, or created one with the same name). This change adds no migration and no table.
- State restored: nothing to restore; the two snapshots matched with no `rmdir` needed.

## Other Evidence

- Mutation checks, all reverted and verified identical to the original: `clauseBoundaries.ts` (7: 6 in the initial pass, 1 regression fix), `clauseSplitting.ts` (8, two of which needed a new test each before they were caught), `segmentation.ts`'s unit-list integration (2). All 17 were caught; none survived as equivalent in this change (contrast with JOS-140's `segmentation.ts`, which had two accepted-equivalent mutations already documented there).
- **Real bug found and fixed by a mutation-adjacent test, not a mutation itself**: `findClauseBoundaries`'s original implementation used JS's plain `\b`, which treats an accented letter as a non-word character. The Spanish conjunction "ni" therefore falsely matched the first two letters of "niña". Fixed with a Unicode-aware end-of-word check (`(?![\p{L}\p{N}])`) instead of `\b`; a regression test locks this in at both the `clauseBoundaries` and `clauseEligibility` levels.
- The `segmentScript` refactor moves from a sentence-only DP to a unit-based one; `buildUnits` runs before it and its output is fed through the same, unmodified allowed-chunk/cost logic JOS-140 already had mutation-tested, which is why extending that logic to clause pieces needed only two targeted mutations of the new integration point (unit-list construction and fragment-text slicing).

## Outcome

- Step 6 status: PASS
- Blocking issues: none
- Open: none new. JOS-140's three previously-reported intermittent failures (`orchestrator.test.ts`, the `session-creation.test.ts` ULID ordering defect, and the one observed `session-read.test.ts` stall under heavy machine load) are unrelated to this change and were not re-measured here; none appeared in the full-suite run recorded above.
