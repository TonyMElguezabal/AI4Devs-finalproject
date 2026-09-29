# Tasks — Split a sentence at clause boundaries (JOS-141)

Tests come first throughout: each behaviour gets a failing test before the code that makes it pass, and every scenario in `specs/clause-splitting/spec.md` has at least one functional test. Automated tests use synthetic timestamps; a real narration is used only in the manual test (step 8).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-141-split-at-clause-boundaries` from `feature/jos-140-segment-script` (stacked on JOS-140, JOS-139 and JOS-144; rebase onto `feature/entrega-2-JAME` as they merge; MVP changes never target `main`)
- [x] 0.2 Verify the branch was created and is the current branch — `feature/jos-141-split-at-clause-boundaries`, cut from `feature/jos-140-segment-script` at `2c0721d`

## 1. Gate and umbrella carve-out

- [x] 1.1 Confirm JOS-140 is implemented on the base branch: `findSentences`, `chunkDurations`, `segmentScript` and its interim `unsplittable-sentence` rule. If not, stop and implement JOS-140 first
- [x] 1.2 Remove the three clause-boundary requirements from `decompose-script-into-chunks`, point it here, update its tasks 6.2, 6.4 and 6.5, and validate both changes
- [x] 1.3 Record on JOS-141 the conjunction lists chosen (design Decision 1) so they can be reviewed

## 2. Clause boundaries (TDD) — Decisions 1 and 4

- [x] 2.1 Write failing tests for `findClauseBoundaries(sentence, language)`: after `,` and `;` followed by whitespace; before listed conjunctions (whole words, case-insensitive, never the first word); a comma or semicolon followed by a conjunction counting once; no boundary inside "1,000"; English and Spanish examples from the spec
- [x] 2.2 Write failing tests that cutting at the boundaries yields trimmed exact substrings that join back to the sentence apart from whitespace, with accents and `¿`/`¡`
- [x] 2.3 Implement the conjunction constants and the function, then run the group 2 tests

## 3. Eligibility and units (TDD) — Decisions 2 and 3

- [x] 3.1 Write failing tests for the classification: over 15 s → free must-split; the sentence after a short one whose sum exceeds 15 s → first-clause borrowed; both at once; everything else whole; a must-split sentence without boundaries stays whole
- [x] 3.2 Write failing tests that clause pieces get their timings from the stored characters, and that `chunkDurations` places a piece boundary at the midpoint of the pause between pieces
- [x] 3.3 Implement the classification and the unit list, then run the group 3 tests

## 4. Grouping with splits (TDD) — AC1 to AC5

- [x] 4.1 Write failing tests for AC1: a 22 s sentence with boundaries becomes pieces whose chunks each last at most 15 s; the least-cost split is chosen among several
- [x] 4.2 Write failing tests for AC2: a 3 s sentence joins the first part of the following 14 s sentence; the rest follows the normal rules
- [x] 4.3 Write failing tests for AC3: a 9 s sentence with commas in an ordinary script stays whole
- [x] 4.4 Write failing tests for AC4: an 18 s sentence without boundaries, and a 3 s sentence before a 14 s one without boundaries, are flagged `unsplittable-sentence`; a split sentence's pieces are not flagged
- [x] 4.5 Write failing tests for the short-piece rule: a short last piece joins the unit after it, or before it at the end of the script
- [x] 4.6 Write failing tests for AC5 and that every result passes JOS-144's validation for the same script
- [x] 4.7 Update JOS-140's tests that asserted the interim flag on sentences that do have boundaries, since they now split
- [x] 4.8 Extend `segmentScript` to search over units, then run the group 4 tests and JOS-140's

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review JOS-140's and JOS-144's tests for assumptions this change breaks, beyond task 4.7
- [x] 5.2 Confirm every scenario in `specs/clause-splitting/spec.md` has at least one functional test; list the mapping in the step 6 report
- [x] 5.3 Confirm module test coverage has not decreased, measured against the base on scratch databases
- [x] 5.4 Run `npm run typecheck` and the server runtime-load test

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test state of the default test store
- [x] 6.2 Run the targeted tests and capture the summary
- [x] 6.3 Run the full suite and record totals, failures and runtime (the known intermittent `orchestrator.test.ts` failure is reported, not hidden)
- [x] 6.4 Verify the post-test state matches the baseline; restore it if not
- [x] 6.5 Write `openspec/changes/split-sentences-at-clause-boundaries/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`
- [x] 6.6 Mark this step complete only after the tests pass and the report exists

## 7. Manual Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the real server on a scratch database and confirm it responds
- [x] 7.2 Narrate (one real text-to-speech call with timestamps) a script with a sentence over 15 s that has clause boundaries, a short sentence before a long one, and a long sentence without boundaries; run the decomposition phase with a stub instruction generator; `GET /sessions/:id` shows the chunks; record each fragment's text, duration and flag
- [x] 7.3 Repeat with a Spanish script
- [x] 7.4 Clean up through the test-only reset; confirm the scratch store is empty with all triggers and the default store untouched
- [x] 7.5 Save `openspec/changes/split-sentences-at-clause-boundaries/reports/YYYY-MM-DD-step-7-manual-testing.md`

## 8. E2E Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Decide applicability: no screen changes; if the session page lists chunks, check a session from step 7 shows the split fragments in order; otherwise record why not
- [x] 8.2 Save `openspec/changes/split-sentences-at-clause-boundaries/reports/YYYY-MM-DD-step-8-e2e.md`

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 `docs/backend-standards.md`: clause boundaries, the conjunction lists and eligibility, next to JOS-140's segmentation notes
- [ ] 9.2 `docs/api-spec.yml`: regenerate from `GET /docs/json` and confirm no change

## 10. Close out

- [ ] 10.1 Comment on JOS-148 (`unsplittable-sentence` now means "no clause boundary"; the warning for those fragments is theirs) and JOS-140 (the interim rule is replaced)
- [ ] 10.2 Update Linear with progress, decisions and agreements on the tickets touched
- [ ] 10.3 Open the PR (stacked on JOS-140's until it merges) linking to JOS-141
- [ ] 10.4 Get a review from at least one human
- [ ] 10.5 Archive the OpenSpec change after merge
