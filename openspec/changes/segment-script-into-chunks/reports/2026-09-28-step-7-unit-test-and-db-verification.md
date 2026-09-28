# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-09-28
- Change: segment-script-into-chunks (JOS-140)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-140-segment-script` at `fc694c0`

## Commands Executed

All from `backend/`, against the default test store (`data/skeleton.sqlite`, `data/projects/`) unless noted:

- `sqlite3 data/skeleton.sqlite` for row counts, triggers, applied migrations and scene indexes, and `find data -maxdepth 2` (before and after)
- `npx vitest run test/admitted-durations.test.ts test/sentences.test.ts test/sentence-timings.test.ts test/script-segmentation.test.ts test/decomposition-phase.test.ts --reporter=verbose` (targeted)
- `npm test` (full suite), `npm run typecheck`
- `npm test` twelve times on a scratch database (`DB_PATH`, `PROJECTS_ROOT`) to measure the intermittent failures
- Coverage (task 6.3), base `768914b` in a temporary git worktree vs head, each on a scratch database: `npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/**'` (`@vitest/coverage-v8` installed locally without saving it)
- Each new module imported under plain Node (`node -e "import('./src/<module>.ts')"`), since the server does not import them yet and `server-runtime-load.test.ts` therefore cannot cover them

## Unit Test Results

- Targeted: 105 passed, 0 failed (5 files)
- Full suite: 523 passed, 0 failed, 2 skipped (30 files, 28 passed and 2 skipped: the opt-in contract tests against real providers)
- Type check: exit 0 (`erasableSyntaxOnly` on); `server-runtime-load.test.ts` passes; all five new modules load under plain Node
- Runtime: targeted 0.93 s, full 7.02 s
- New tests in this change: 15 (admitted durations), 28 (sentences), 15 (timings), 26 (segmentation), 20 (phase); 105 counting the edge-branch tests added in group 6

### Intermittent failures, none caused by this change

The change adds new modules and one export (`storedFileSchema`, `STORED_FILE` in `narrationTimestampsPhase.ts`); it changes no behaviour the failing tests exercise.

| Test | Seen | Cause |
|---|---|---|
| `orchestrator.test.ts` (skeleton, JOS-179), `waitFor timed out` | run 12 of 12 on the scratch database | Known; reported in earlier steps. This run overlapped a machine load average of 20-36 |
| `session-creation.test.ts` "creation-ordered identifier" | 1 full run, then 2 of 25 runs of the file alone | `backend/src/util/ulid.ts` (JOS-134) is not monotonic: `encodeTime(now) + encodeRandom(16)`, so two identifiers made in the same millisecond sort by their random suffix. This is a defect in the identifier, not only in the test, since sessions are meant to be creation-ordered. Out of scope here; proposed as its own fix |
| `session-read.test.ts` "returns a session created long ago normally" | run 3 of 12, reported duration 476,082 ms | A stall of the whole machine (load average 36 at the time), not a logic failure; the test is one query and one request |

Two of twelve full runs had a failure on a heavily loaded machine; the run recorded above (default store) passed.

### Coverage (task 6.3)

| Metric | Base `768914b` | Head | Change |
|---|---|---|---|
| All files, lines | 94.22% | 94.97% | +0.75 |
| All files, branches | 87.72% | 89.98% | +2.26 |
| All files, functions | 98.42% | 98.63% | +0.21 |

No file that existed at the base lost coverage on any metric. New files: `admittedDurations.ts`, `segmentation.ts`, `sentences.ts`, `sentenceTimings.ts`, `decompositionPhase.ts` at 100% of lines. Three branches were uncovered at first (a lone period after a space, a sentence with no spoken characters, a stored timestamps file of an unexpected shape); each got a test.

## Scenario to Test Mapping (task 6.2)

All 16 scenarios of `specs/script-segmentation/spec.md` have a test. `SE` = `sentences.test.ts`, `ST` = `sentence-timings.test.ts`, `SG` = `script-segmentation.test.ts`, `DP` = `decomposition-phase.test.ts`.

| # | Requirement / scenario | Tests |
|---|---|---|
| 1 | Cuts only between sentences: several sentences | SG "gives fragments of whole consecutive sentences, each within 5-15 s", "never cuts inside a sentence: each fragment's text is a run of whole sentences" |
| 2 | Abbreviations and initials | SE "Abbreviations and initials" (English, Spanish, initials, unknown language, wrong-language abbreviations) |
| 3 | No terminator at the end | SE "makes the words after the last terminator the last sentence", "finds one sentence in a script with no terminator" |
| 4 | Every ordinary fragment within the bounds | SG "gives fragments of whole consecutive sentences, each within 5-15 s"; the 400-script comparison |
| 5 | Durations cover the whole narration | SG "gives narrated durations that add up to the MP3's duration"; ST "gives per-unit durations that add up to the MP3's duration" |
| 6 | Short sentence in the middle | SG "groups a short sentence with the one that follows" |
| 7 | Short last sentence | SG "groups a short last sentence with the previous one" |
| 8 | Whole script below the lower bound | SG "becomes one fragment flagged script-below-lower-bound", "flags a one-sentence script below the bound too" |
| 9 | Sentence exceeds the maximum | SG "keeps a sentence over the maximum alone, flagged unsplittable-sentence", "flags only the fragment that needs it" |
| 10 | Short sentence cannot join the next within the maximum | SG "keeps a short sentence and a next one over the maximum together, flagged"; "accepts every fragment it flags through JOS-144's validation" |
| 11 | Two valid groupings differ in speed change | SG "picks the smaller total speed change between two valid groupings" (the spec's 5.5/5.5/6.2/6.3 example), the tie-break tests, "agrees with trying every grouping, on 400 random scripts of 1-9 sentences" |
| 12 | Deterministic | SG "is deterministic" |
| 13 | Fragments are joined | SG "reproduces an English script apart from whitespace", "reproduces a Spanish script with ¿, ¡ and accents", "keeps the script's own inner whitespace", and both accepted by JOS-144's registration |
| 14 | No grouping satisfies the rules | SG "returns an error and no fragments"; DP the four "A script with no valid grouping" tests (not-retryable failure, cause names the system, nothing registered, generator never called, session `failed` in `decomposition`) |
| 15 | A narrated session is decomposed | DP "obtains the timestamps first when they are missing, then registers the chunks", "registers the fragments as chunks, in order, with each sentence's own text", "leaves the session in chunks-processing" |
| 16 | Obtaining the timestamps fails | DP "stops when the timestamps cannot be obtained: no segmentation, no chunks, that failure recorded", "recovers on a later run once the timestamps can be obtained, clearing the earlier failure" |

## Database State Verification

- Pre-test baseline (default test store, after clearing residue left by earlier runs in this session with the test-only `resetAll()`):
  - Row counts: `runs` 0, `scenes` 0, `provider_requests` 0, `scene_results` 0, `voice_overs` 0, `stage_attempts` 0, `narration_timestamps` 0
  - Triggers (11): `narration_timestamps_no_delete`, `narration_timestamps_no_update`, `runs_language_locked`, `runs_script_locked`, `runs_title_locked`, `scenes_idx_locked`, `scenes_no_delete`, `scenes_prompt_locked`, `scenes_run_id_locked`, `voice_overs_no_delete`, `voice_overs_no_update`
  - Applied migrations: 2, 3, 4, 5, 6, 7, 8; scene index `scenes_run_id_idx_unique`
  - `data/`: `projects/` (empty), `skeleton.sqlite`, `-shm`, `-wal`, `store.sqlite`
- Post-test validation: row counts, the eleven triggers, migrations and the index identical. The only difference was the empty leftover folder the existing consultation test creates from the current minute (`data/projects/Traversal Test 2026-09-28 ...`).
- State restored: Yes. The empty folder was removed with `rmdir`, and the snapshot was compared again (identical).
- This change adds no migration and no table.

## Other Evidence

- Mutation checks, all reverted and verified identical to the original: `admittedDurations.ts` (3), `sentences.ts` and `sentenceTimings.ts` (5), `segmentation.ts` (7), `decompositionPhase.ts` (7). Seventeen were caught. Two survived and are equivalent, not gaps:
  - Dropping the "fewer fragments" tie-break changes no result, because merging sentences never costs more speed change than splitting them, so the "later first cut" rule always picks the same grouping. Searched 60,000 random integer scripts without finding a difference. The rule stays because the spec states it; noted in the test.
  - Always calling `obtainNarrationTimestamps` (dropping the "already stored" guard) changes no result, since obtaining is a no-op with nothing recorded once they are stored.
  One mutation (removing the already-has-chunks check) initially survived and led to a test: an ungroupable session that already has chunks must not gain a failure.
- The grouping search is checked against an independent brute-force implementation of the rules that tries every set of cuts, on 400 seeded random scripts (all outcomes covered: grouped, refused, flagged, several fragments).
- Design Decision 2 and task 3.2 were updated to the one walk that serves native and alignment timestamps.
- Repeated pattern to note: `newNarratedSession` and the stub providers are now written in three test files (`obtain-narration-timestamps`, `decomposition-phase`, and similar setup in `scene-registration`); a shared test helper is a candidate refactor, not done here.

## Outcome

- Step 7 status: PASS
- Blocking issues: none
- Open: the three intermittent failures above (the ULID ordering one is a real defect in `util/ulid.ts`, raised with the product owner)
