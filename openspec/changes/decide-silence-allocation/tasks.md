# Tasks — Decide how narration silences are allocated to scenes (JOS-142, D11)

This is a spike. The POC runs first (groups 2-5), and only after the product owner's verdict are the spec, code and PRD made to match it (groups 6-9). Every code change starts with a failing test. POC scripts are committed under `scripts/`; everything they produce goes to a git-ignored `work/` (design Decision 8).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-142-decide-silence-allocation` from `feature/entrega-2-JAME` (MVP work never targets `main`), with no upstream set, so a bare `git push` cannot reach the integration branch
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 Confirm on the base branch: `unitBoundaries`, `sentenceSpeechSpans`, `buildUnits` and `segmentScript` exist, and `unitBoundaries` still implements rule B (midpoint)
- [x] 1.2 Record the commit of `origin/feature/jos-182-define-media-assembly` that `assemble.sh` and the 0.5×-2.0× recommendation are read from; copy `assemble.sh` into `work/` and run it once on JOS-182's own fixture to confirm it works on this machine
- [x] 1.3 Check `decompose-script-into-chunks` (umbrella) for silence-allocation wording, and point it to this change where it overlaps
- [x] 1.4 Add `work/` to a `.gitignore` in this change folder

## 2. Pause survey (design Decision 3.1)

- [x] 2.1 Write the four survey scripts (two English, two Spanish, 600-900 characters). Between them they contain `.`, `?`, `!`, commas, one paragraph break, one ellipsis and one dash
- [x] 2.2 Write `scripts/survey.ts`: one real text-to-speech call with timestamps per script, forced alignment on the same MP3, then every inner unit boundary's pause and its cause, in both shapes, saved to `work/`
- [x] 2.3 Run it; record the pause distribution per cause and the longest pause in `reports/YYYY-MM-DD-step-2-pause-survey.md`

## 3. Numeric comparison (design Decisions 1, 3.2 and 6)

- [x] 3.1 Write `scripts/compare.ts`, with the two boundary formulas as a parameter over the real `findSentences`, `buildUnits`, `sentenceSpeechSpans` and grouping code, without editing product code
- [x] 3.2 Check the harness first: with rule B it must reproduce `segmentScript`'s own fragments exactly on every survey narration
- [x] 3.3 Run both rules on the 4 narrations × 2 shapes. Report fragments, durations, admitted durations, speed factors in both directions, fragments outside the bounds, narrations with no valid grouping, the partition check, and where the rules' groupings differ
- [x] 3.4 Save `reports/YYYY-MM-DD-step-3-numeric-comparison.md`

## 4. Rendered comparison and threshold sweep (design Decisions 3.3 and 3.4)

- [x] 4.1 Pick the English survey narration with the longest natural pause, and the fragment boundary to sweep (both adjacent intervals under 8 s, so rule A's 4 s case stays under 15 s) — `english-exclamation-paragraph`, native shape, longest pause 1.115 s (boundary between sentence 1 "Waves crashed…night." and sentence 2 "Ropes were checked…fall.", = fragment0/fragment1's real rule-B boundary). Rule B's actual fragment0 (sentence0+1, 11.448 s) fails the <8 s margin (+4 s = 15.448 s, over the clip max), so the sweep uses the two individual sentences flanking that boundary instead — sentence1 alone (6.966 s) and sentence2 (=fragment1, 7.882 s), both under 8 s — while the base comparison (4.3) still uses the real rule-B fragment grouping
- [x] 4.2 Generate its fragments' IMAGE/VIDEO instructions (one real reasoning call), one Fal.ai image per fragment and one RunningHub clip per fragment at its admitted duration, the two sweep-adjacent clips at 15 s. Stop and report if RunningHub spend would pass $8
- [x] 4.3 Render the base comparison with `assemble.sh`: the same clips with rule A's intervals and with rule B's
- [x] 4.4 Build MP3 copies with the swept pause at 1, 1.5, 2, 3 and 4 s, shifting later timestamps; render each under both rules, with the two sweep clips cut so they play at 1.0×
- [x] 4.5 Check every render: duration equals the MP3's, the audio is the voice-over only, the scene changes fall at the expected boundaries (±1 frame)
- [x] 4.6 Save `reports/YYYY-MM-DD-step-4-renders.md` (files, spend, measured checks)

## 5. Product owner verdict (design Decisions 4 and 5)

- [x] 5.1 Write the agent's recommendation into the step 4 report before sharing anything
- [x] 5.2 Send the renders and a one-page sheet (which file is which rule and pause) to the product owner, and ask the three questions of Decision 4
- [x] 5.3 Record the verdict verbatim: the preferred rule, the threshold, anything else
- [x] 5.4 If a surveyed pause exceeds the threshold, propose a rule for longer pauses and get it approved before continuing (Decision 5)

## 6. Record the decision in the artifacts (before any code)

- [x] 6.1 Update `specs/silence-allocation/spec.md` with the adopted rule's formula, the threshold and, if any, the third rule, as requirements with scenarios
- [x] 6.2 Update design Decision 7 with the path actually taken, and add tasks to group 7 if the verdict needs more than planned
- [x] 6.3 Validate the change with `openspec validate --strict`

## 7. Code follows the decision (TDD, design Decision 7)

- [x] 7.1 If rule A (or a third rule): write failing tests in `sentence-timings.test.ts` for the adopted boundaries, the edges at 0 and the MP3 duration, the partition, and zero-pause units
- [x] 7.2 If rule A (or a third rule): change `unitBoundaries`, then run the timings, segmentation, clause-splitting and decomposition tests; review each test that moves, and do not bulk-update
- [x] 7.3 ~~If rule B: remove "interim" from the comments...~~ not applicable — rule A was adopted, covered by 7.1/7.2 instead
- [x] 7.4 Run `npm run typecheck` and the server runtime-load test

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [x] 8.1 Review JOS-139/140/141 tests for assumptions about the boundary rule beyond task 7.2
- [x] 8.2 Confirm every scenario in `specs/silence-allocation/spec.md` is covered by a test or by a POC report, and list the mapping in the step 9 report
- [x] 8.3 Confirm module test coverage has not decreased, measured against the base on scratch databases

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 9.1 Capture the pre-test state of the default test store
- [x] 9.2 Run the targeted tests and capture the summary
- [x] 9.3 Run the full suite and record totals, failures and runtime (the known intermittent `orchestrator.test.ts` failure is reported, not hidden)
- [x] 9.4 Verify the post-test state matches the baseline; restore it if not
- [x] 9.5 Write `openspec/changes/decide-silence-allocation/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md`
- [x] 9.6 Mark this step complete only after the tests pass and the report exists

## 10. Manual Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Start the real server on a scratch database and confirm it responds
- [x] 10.2 Narrate one survey script for real, run `runDecompositionPhase` with a stub instruction generator, and check that `GET /sessions/:id` shows the chunks in `chunks-processing`, the fragment durations sum exactly to the MP3, and the boundaries match the adopted rule
- [x] 10.3 Clean up through the test-only reset; confirm the scratch store is empty with all triggers, and the default store untouched
- [x] 10.4 Save `reports/YYYY-MM-DD-step-10-manual-testing.md`

## 11. E2E Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 11.1 Decide applicability: no screen changes. If the rule changes, check that a session decomposed in step 10 lists its chunks in order; otherwise record why not
- [x] 11.2 Save `reports/YYYY-MM-DD-step-11-e2e.md`

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 `docs/PRD.md` → v1.5, with v1.4 kept as `docs/PRD-v1.4.md`: §7.3, AC12, AC19, D11 closed, §14.1 done, §16 changelog, §11.3's speed-factor row pointing to JOS-182's recommendation
- [x] 12.2 ADR with the next free number (JOS-182's `0005-media-assembly.md` collides with `0005-provider-selection.md`): candidates, evidence, verdict, the rule rejected
- [x] 12.3 `docs/backend-standards.md`: replace "one interim duration rule" with the adopted rule, and state that JOS-143 must reuse `unitBoundaries`
- [x] 12.4 `docs/api-spec.yml`: regenerate from `GET /docs/json` and confirm no change

## 13. Close out

- [x] 13.1 Comment on JOS-143 (the rule to implement; reuse `unitBoundaries`), JOS-149 and JOS-182 (the final pipeline parameters D11 left open are settled), JOS-148 (any speed-factor effect) and JOS-140/JOS-141 (the interim rule is resolved)
- [x] 13.2 Update JOS-142 with the findings, the trade-offs, the decision, the next steps and the time spent (the spike's Definition of Done)
- [x] 13.3 Open the PR against `feature/entrega-2-JAME`, linking to JOS-142 — [PR #15](https://github.com/TonyMElguezabal/AI4Devs-finalproject/pull/15)
- [ ] 13.4 Get a review from at least one human
- [ ] 13.5 Archive the OpenSpec change after merge
