# Split a sentence at clause boundaries when duration bounds can't otherwise be met

Linear-Issue: JOS-141 (US-08)

## Why

§6.1 cuts chunks only between sentences, with one exception: a sentence whose narration alone exceeds the video provider's maximum is split at a clause boundary, marked by a comma, semicolon or conjunction. §6.1.1 extends it: a sentence below the lower bound whose grouping with the next sentence would exceed the maximum takes the first clause of that next sentence instead; and a sentence that must split but has no such boundary is kept whole. Without this, JOS-140 keeps every such case whole and flagged `unsplittable-sentence` (its interim rule), so long sentences become clips slowed down at the 15 s maximum even when a natural pause point exists.

This change builds on `segment-script-into-chunks` (JOS-140), per the product owner's sequencing decision of 2026-09-28, and takes the clause-boundary requirements out of the umbrella change `decompose-script-into-chunks`.

## What Changes

- **AC1 — A sentence over the maximum is split:** at one or more clause boundaries, so that every piece fits the bounds where possible. Among possible splits, JOS-140's search picks the one needing the least speed change.
- **AC2 — A short sentence borrows a clause:** when a sentence under 5 s would exceed 15 s grouped with the whole next sentence, the next sentence is split at a clause boundary and its first part is grouped with the short sentence; the rest of that sentence follows the normal rules.
- **AC3 — No other sentence is split:** internal cuts are allowed only inside sentences that AC1 or AC2 requires to split.
- **AC4 — No boundary, no split:** a sentence that must split but has no comma, semicolon or conjunction is kept whole (with the short sentence, in the AC2 case) and flagged `unsplittable-sentence`, as JOS-140 already does. After this change that flag means exactly "no clause boundary", not "not split yet".
- **AC5 — Fidelity:** a split sentence's pieces are its own text; joined in order they reproduce it apart from separator whitespace.
- **Ticket assumption adopted:** a clause piece shorter than the lower bound follows the same rules as a short sentence (grouped with what follows, or with what precedes if it ends the script).

## Clause boundaries

A clause boundary is: right after a comma or semicolon followed by whitespace, or right before a conjunction that follows whitespace and is not the sentence's first word. The conjunctions are a fixed list per language (see design); a comma or semicolon directly followed by a conjunction counts once.

## Out of Scope (owned by other tickets)

- Recording the speed-factor warning for an unsplittable sentence's slowed clip, and requesting durations: JOS-148, JOS-147. This change only flags the fragment.
- Narration intervals and silence allocation (D11): JOS-143, JOS-142. Clause boundaries use JOS-140's duration rule.

## Capabilities

### New Capabilities

- `clause-splitting`: when a sentence may be divided inside, where the division can fall, how the pieces are chosen and grouped, what happens when no boundary exists, and the fidelity of the pieces.

### Modified Capabilities

None in `openspec/specs/`. `script-segmentation` (JOS-140, not archived) keeps its interim rule's wording; this change narrows `unsplittable-sentence` to sentences without a boundary. The umbrella change loses its three clause-boundary requirements in this same change.

## Impact

- **Depends on** JOS-140 (`segment-script-into-chunks`: sentence detection, the duration rule, the grouping search; branch stacked on `feature/jos-140-segment-script`), and through it JOS-139 and JOS-144.
- **Backend:** clause-boundary detection per language; the grouping search works on clause-level units inside eligible sentences. No schema change, no new route.
- JOS-140 must be implemented before this change's code (its tasks come first on the stacked branches).
