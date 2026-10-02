# Decide how narration silences are allocated to scenes (D11)

Linear-Issue: JOS-142 (US-09, spike)

## Why

PRD §7.3 requires the scenes' narration intervals to partition the voice-over from second 0 to the MP3's full duration, but which scene a pause between two sentences belongs to is still open (D11, "pending POC"). The choice decides what each clip must visually cover, when the cut to the next scene happens, and what duration segmentation measures for every fragment. JOS-140 shipped an interim rule (the boundary at the midpoint of each pause) so that segmentation could be built; JOS-143 (intervals) and JOS-149 (assembly) must not be built on a rule nobody has decided. Real narrations have pauses of about 0.5-1.1 s between sentences, with both native and forced-alignment timestamps (JOS-139, JOS-140), so the choice is visible in every video.

## What Changes

- **A proof of concept compares the two candidate rules** named in D11: (A) the previous scene absorbs the silence that follows it, so the cut lands when the next sentence starts; (B) the silence is split between the two adjacent scenes (JOS-140's interim rule). Both are compared on representative scripts, on native and forced-alignment timestamps, in English and Spanish.
- **Numbers.** For each rule and narration: fragments, narrated durations, the admitted duration each clip would request, the speed factor, the §6.1 bounds, and the §7.3 partition.
- **Rendered comparisons you judge.** One real narration's clips (real Fal.ai images and RunningHub clips, about $5, product owner decision 2026-09-29) are assembled with JOS-182's documented pipeline under each rule. A sweep of longer pauses, inserted into a copy of the MP3, finds the longest silence a single clip sustains acceptably, and whether that threshold needs a third rule.
- **The decision is recorded.** The adopted rule and threshold go into PRD §7.3, AC12, AC19, D11 (closed) and §14.1, with an ADR and the evidence.
- **The code follows the decision.** If the adopted rule is not the interim one, `unitBoundaries` (`backend/src/sentenceTimings.ts`), the one function segmentation and intervals share, is changed with its tests. If it is the interim rule, the code is left as it is and its "interim" comments are removed.

## Capabilities

### New Capabilities

- `silence-allocation`: what the D11 decision must produce and guarantee. That covers one recorded rule shared by segmentation and narration intervals, the §7.3 partition including the leading and trailing silence, compatibility with the §6.1 bounds and the speed-factor limit, a stated silence threshold, and a rule chosen from compared, human-judged evidence.

### Modified Capabilities

None in `openspec/specs/`. `script-segmentation` (JOS-140, archived without a synced spec) described its duration rule as interim until D11. This change settles it, and the spec here records that.

## Non-goals

- Assigning and storing narration intervals per scene (JOS-143), assembling the final MP4 (JOS-149 / US-16), recording speed-factor warnings (JOS-148): this change only decides the rule they implement.
- Choosing or changing the speed-factor limit. JOS-182 recommends 0.5×-2.0× (its ADR, Decision 5). This change checks against that recommendation, and US-33 fixes the constant.
- Merging JOS-182's PR #3.

## Impact

- **Depends on** JOS-140/JOS-141 (segmentation and `unitBoundaries`, merged into `feature/entrega-2-JAME`), JOS-139 (both timestamp shapes), JOS-182 (the assembly pipeline `assemble.sh` and the 0.5×-2.0× recommendation, read from `feature/jos-182-define-media-assembly` because PR #3 is not merged yet), and JOS-165 (voice, image and video providers and the 5-15 s admitted durations).
- **Code:** at most one function and its tests (`sentenceTimings.ts`), plus comments in `segmentation.ts`. No schema change, no route, no screen.
- **Docs:** `docs/PRD.md` (v1.5, with v1.4 kept as `docs/PRD-v1.4.md`), an ADR, and `docs/backend-standards.md`.
- **Spend:** about $5 of RunningHub clips, a few Fal.ai images, and ElevenLabs quota for the survey narrations.
- **Unblocks** JOS-143 (intervals) and the final pipeline parameters JOS-182 left open until D11 closed.
