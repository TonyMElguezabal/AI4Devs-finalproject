# Step 3 Report — Numeric Comparison

- Date: 2026-09-29
- Change: decide-silence-allocation (JOS-142)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-142-decide-silence-allocation`

## Method

`scripts/compare.ts` reimplements `segmentScript`'s exact DP (copied from `backend/src/segmentation.ts`, unmodified: same `classify`, `isBetter`, `closestAdmittedDuration` cost, tie-breaks) with the boundary rule as a parameter, instead of `unitBoundaries`'s hardcoded midpoint. It calls the real `findSentences`, `buildUnits`, `sentenceSpeechSpans` and `closestAdmittedDuration` — no product code was edited.

**Task 3.2's harness check (mandatory before trusting the reimplementation):** for all 8 survey narrations (4 scripts × native/alignment, from step 2's cached data), `segmentWithRule(..., RULE_B_SPLIT)` was compared fragment-by-fragment (text, duration, exception) against the real `segmentScript(...)`. **Result: exact match on every fragment of every narration.** The reimplementation is faithful; its rule-A numbers can be trusted.

Both rules then ran on all 8 narrations. Rule A = the previous unit absorbs the silence that follows it (boundary = next unit's speech start). Rule B = the silence is split (today's `unitBoundaries`).

## Results

| Narration | Shape | Rule A fragments | Rule A max ratio | Rule B fragments | Rule B max ratio | Groupings differ |
|---|---|---|---|---|---|---|
| english-question-dash | native | 4 | 1.0351x | 5 | 1.0748x | yes |
| english-question-dash | alignment | 4 | 1.034x | 5 | 1.0794x | yes |
| english-exclamation-paragraph | native | 4 | 1.036x | 4 | 1.0407x | yes |
| english-exclamation-paragraph | alignment | 4 | 1.0355x | 4 | 1.0391x | yes |
| spanish-question | native | 5 | 1.0568x | 5 | 1.039x | no |
| spanish-question | alignment | 5 | 1.0604x | 5 | 1.034x | no |
| spanish-exclamation-ellipsis | native | 5 | 1.0633x | 5 | 1.0417x | no |
| spanish-exclamation-ellipsis | alignment | 5 | 1.0798x | 5 | 1.0102x | no |

Full per-fragment durations, admitted durations and ratios: `work/compare-results.json`.

**Bounds (§6.1) and the partition (§7.3):** every fragment in all 16 rule×narration combinations landed within 5-15 s; **zero** fragments needed `script-below-lower-bound` or `unsplittable-sentence` under either rule, on any of the 8 narrations. Every rule's fragments summed to the narration's exact MP3 duration (the total-duration column matched `mp3Duration` to the millisecond in all 16 cases) — the partition holds under both rules. No narration failed to find a valid grouping under either rule.

**Speed factor vs. JOS-182's 0.5x-2.0x recommendation:** the highest ratio seen anywhere was **1.0798x** (rule A, spanish-exclamation-ellipsis, alignment shape) — under half of JOS-182's 2.0x ceiling. Zero fragments exceeded the limit under either rule, on any narration. §6.1's speed-factor requirement is comfortably satisfied by both candidates on this survey.

**Which rule needs less speed change:** close and narration-dependent, not a clear win for either. Rule A had the lower max ratio on 4 of 8 narrations, rule B on the other 4 (average-of-max: A 1.0501x, B 1.0480x; average-of-every-fragment: A 1.0253x, B 1.0269x). These differences are small next to the ~2x headroom to JOS-182's limit, and are not, by themselves, a reason to prefer one rule over the other.

**Where the rules disagree on grouping:** in the two English narrations (both shapes), never in the two Spanish ones. In `english-question-dash`, rule A produces 4 fragments (its later cuts land closer to the following sentence's start, absorbing more of the pause into the earlier fragment, which shifts a borderline grouping decision), rule B produces 5. This is a real, narration-dependent effect of the rule, not a defect in either.

## Answering §14.1's specific checks (design Decision 6)

- Fragments outside the bounds: none, either rule. ✓
- Speed factor within the recorded limit: yes, both rules, by a wide margin (max 1.08x vs. a 2.0x ceiling). ✓
- Valid grouping exists: yes, both rules, all 8 narrations. ✓
- Partition (0 to MP3 duration, contiguous, no overlap): holds, both rules (verified by the exact duration-sum match; contiguity and non-overlap follow by construction from the DP, which only ever partitions a contiguous unit-index range). ✓

## Conclusion for this step

Neither rule is disqualified by the bounds, the speed limit, or the partition requirement on this survey — both are safely within every guardrail §14.1 asks to check. The choice between them is therefore a visual one, which is what the rendered comparison (group 4) and the product owner's verdict (group 5) decide.

## Files

`work/compare-results.json` (git-ignored, regenerable via `scripts/compare.ts` from step 2's cached survey data — no new provider calls).
