# Tasks — Segment the script into chunks within duration bounds (JOS-140)

Tests come first throughout: each behaviour gets a failing test before the code that makes it pass, and every scenario in `specs/script-segmentation/spec.md` has at least one functional test. Automated tests use synthetic timestamps and stub providers; real providers are called only in the manual test (step 8).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-140-segment-script` from `feature/jos-139-obtain-narration-timestamps` (stacked: it reads JOS-139's stored timestamps and calls JOS-144's `registerDecomposition`; rebase onto `feature/entrega-2-JAME` once those merge; MVP changes never target `main`)
- [x] 0.2 Verify the branch was created and is the current branch — `feature/jos-140-segment-script`, cut from `feature/jos-139-obtain-narration-timestamps` at `768914b`

## 1. Gate and umbrella carve-out

- [x] 1.1 Confirm the base: `narration_timestamps` and its file format, `registerDecomposition` and `SegmentedFragment` (with the two exceptions), `SEGMENTATION_LOWER_BOUND_SECONDS` 5 and `SEGMENTATION_UPPER_BOUND_SECONDS` 15 — confirmed on the branch: `insertNarrationTimestamps`/`getNarrationTimestamps` (`backend/src/db.ts`), `registerDecomposition`, `SegmentedFragment` and `FragmentException` (`sceneRegistration.ts`), `obtainNarrationTimestamps`, and `SEGMENTATION_LOWER_BOUND_SECONDS` 5 / `SEGMENTATION_UPPER_BOUND_SECONDS` 15 (`config/providers.ts`)
- [x] 1.2 Remove the sentence-boundary and whole-script-below-lower-bound requirements from `decompose-script-into-chunks` (the three clause-boundary requirements stay for JOS-141), point it here, update its tasks 6.1, 6.3 and 6.6, and validate both changes — two requirements removed from the umbrella spec (7 remain: the three clause-boundary ones, the interval partition and the retry ones), proposal, design Decision 3 and tasks 6.1, 6.3 and 6.6 updated; both changes validate
- [x] 1.3 Record on JOS-140 and JOS-141 that JOS-140 goes first and JOS-141 builds on it (product owner decision, 2026-09-28) — posted, with the proposal's decisions on JOS-140 and where splitting plugs in on JOS-141

## 2. Admitted durations (TDD) — design Decision 6

- [x] 2.1 Write failing tests that `VIDEO_ADMITTED_DURATIONS_SECONDS` is the whole seconds 5 to 15, derived from the existing min and max — `backend/test/admitted-durations.test.ts`
- [x] 2.2 Write failing tests for `closestAdmittedDuration(narrated)`: §7.2's ratio (a slow-down is `admitted / narrated`, a speed-up `narrated / admitted`), a tie going to the longer duration, below 5 s giving 5 s, above 15 s giving 15 s — `closestAdmittedDuration` returns `{ admitted, speedRatio }`, the ratio always at least 1; also that it compares by ratio and not by seconds (7.5 s goes to 8 s), and refuses a non-positive or non-finite narration
- [x] 2.3 Implement both, then run the group 2 tests — `VIDEO_ADMITTED_DURATIONS_SECONDS` in `config/providers.ts` (with its provenance) and `backend/src/admittedDurations.ts` (pure); 15/15 (the module was missing before); three mutations (tie to the shorter, seconds instead of ratio, dropped range ends) made 1, 6 and 1 tests fail and were reverted; typecheck clean

## 3. Sentences and their timings (TDD) — Decisions 1, 2 and 3

- [x] 3.1 Write failing tests for `findSentences(script, language)`: the four terminators, closing quotes and brackets, no terminator at the end, the abbreviation lists for English and Spanish, single capital initials, a period between digits, `¿`/`¡`, whitespace and line breaks between sentences, sentences returned as exact trimmed substrings with their offsets
- [x] 3.2 Write failing tests for mapping characters to sentences: one walk over non-whitespace characters giving the same spans for native timestamps (with whitespace entries) and alignment timestamps (without); each sentence's speech span; a mismatch refused
- [x] 3.3 Write failing tests for `chunkDurations`: pause midpoints as boundaries, 0 and the MP3 duration at the ends, durations summing to the MP3 duration, gapless native input giving the speech spans
- [x] 3.4 Implement the three, then run the group 3 tests

## 4. Grouping (TDD) — Decisions 4 and 5

- [x] 4.1 Write failing tests that ordinary scripts give fragments of whole consecutive sentences, each within 5-15 s
- [x] 4.2 Write failing tests for short sentences: grouped with the following one when a grouping allows it; the last one grouped with the previous one; a one-sentence script alone; a script of mostly short sentences (the measured English and Spanish durations) is grouped, not refused, with the fewest fragments ending on a short sentence
- [x] 4.3 Write failing tests for the whole script under 5 s (one fragment, `script-below-lower-bound`)
- [x] 4.4 Write failing tests for the interim `unsplittable-sentence` cases: a sentence over 15 s alone, and a short sentence plus a next one over 15 s together
- [x] 4.5 Write failing tests for the optimization: fewest fragments ending on a short sentence first; then a case where the valid groupings differ in total speed change and the smaller one is chosen; tie-breaking to fewer fragments, then to the later first cut; determinism
- [x] 4.6 Write failing tests that a script with no valid grouping returns an error, not fragments
- [x] 4.7 Write failing tests that fragments reproduce the script apart from whitespace, in English and in Spanish with `¿`, `¡` and accents, and that every fragment passes JOS-144's validation for the same script and durations
- [x] 4.8 Implement `segmentScript(script, language, characters, mp3Duration)`, then run the group 4 tests

## 5. Phase (TDD) — Decisions 5 and 7

- [x] 5.1 Write failing tests for `segmentStoredTimestamps(runId, instructionGenerator)`: it reads the stored timestamps, segments, and registers the chunks through `registerDecomposition`; the session becomes `chunks-processing`
- [x] 5.2 Write failing tests that no valid grouping records a not-retryable `decomposition` failure with a cause naming the system, registers nothing, and never calls the instruction generator
- [x] 5.3 Write failing tests that it refuses a session without stored timestamps, and one that already has chunks
- [x] 5.4 Write failing tests for `runDecompositionPhase`: it obtains the timestamps first when they are missing, skips that when they are stored, and stops (no segmentation, no chunks) when obtaining them fails
- [x] 5.5 Implement both, then run the group 5 tests

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Review existing tests that build fragments by hand (JOS-144) for anything the segmentation module now owns, and keep them independent of it
- [x] 6.2 Confirm every scenario in `specs/script-segmentation/spec.md` has at least one functional test; list the mapping in the step 7 report
- [x] 6.3 Confirm module test coverage has not decreased, measured against the base on scratch databases
- [x] 6.4 Run `npm run typecheck` and the server runtime-load test

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test state of the default test store
- [x] 7.2 Run the targeted tests and capture the summary
- [x] 7.3 Run the full suite and record totals, failures and runtime (the known intermittent `orchestrator.test.ts` failure is reported, not hidden)
- [x] 7.4 Verify the post-test state matches the baseline; restore it if not
- [x] 7.5 Write `openspec/changes/segment-script-into-chunks/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [x] 7.6 Mark this step complete only after the tests pass and the report exists

## 8. Manual Endpoint Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the real server on a scratch database and confirm it responds
- [ ] 8.2 Create a session with a script of about 700 characters in English, make a real text-to-speech call with timestamps, store it, and run `runDecompositionPhase` with the real alignment provider and a stub instruction generator; `GET /sessions/:id` shows chunks 1..N, each within the bounds, `chunks-processing`; its sentences are mostly under 5 s, as real narration is
- [ ] 8.3 Repeat with a Spanish script, and with a script that has a sentence over 15 s (the interim `unsplittable-sentence` flag)
- [ ] 8.4 Verify the admitted durations: generate one reference image (one image-provider call) and request 8 s and 11 s clips from the video provider; measure the returned clips with `ffprobe`; record the result and the spend, and shrink the constant if a value is rejected
- [ ] 8.5 Clean up through the test-only reset; confirm the scratch store is empty with all triggers and the default store untouched
- [ ] 8.6 Save `openspec/changes/segment-script-into-chunks/reports/YYYY-MM-DD-step-8-manual-testing.md`

## 9. E2E Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Decide applicability: the session page lists chunks; if it does, check that a session decomposed in step 8 shows its chunks in order; otherwise record why not
- [ ] 9.2 Save `openspec/changes/segment-script-into-chunks/reports/YYYY-MM-DD-step-9-e2e.md`

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/backend-standards.md`: the segmentation module (sentence rule, duration rule and why JOS-143 must share it, the grouping search), the admitted-duration constant, and the phase entry point
- [ ] 10.2 `docs/data-model.md`: how the stored timestamps become fragments, if anything needs recording there
- [ ] 10.3 `docs/api-spec.yml`: regenerate from `GET /docs/json` and confirm no change

## 11. Close out

- [ ] 11.1 Comment on JOS-141 (where splitting plugs in: the interim `unsplittable-sentence` cases of Decision 4), JOS-143 and JOS-142 (the shared duration rule), JOS-147 (the admitted-duration constant and the verification result) and JOS-136 (call `runDecompositionPhase` when a narration completes)
- [ ] 11.2 Update Linear with progress, decisions and agreements on the tickets touched
- [ ] 11.3 Open the PR (against `feature/entrega-2-JAME` once JOS-144 and JOS-139 have merged, otherwise stacked) linking to JOS-140
- [ ] 11.4 Get a review from at least one human
- [ ] 11.5 Archive the OpenSpec change after merge
