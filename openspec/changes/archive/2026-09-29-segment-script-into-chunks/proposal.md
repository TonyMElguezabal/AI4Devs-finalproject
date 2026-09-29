# Segment the script into chunks within duration bounds

Linear-Issue: JOS-140 (US-07)

## Why

§5 step 4 divides the locked script into scenes, and §6.1 fixes how: cut only at sentence boundaries, keep every chunk's narrated duration between the hardcoded lower bound and the video provider's maximum, group a short sentence with its neighbour, and among valid groupings prefer the one that needs the least speed change to reach a clip duration the provider admits. Everything downstream needs these fragments: JOS-144 numbers them and generates their instructions, images and clips are made per chunk, and assembly relies on their order. The timestamps they are measured against now exist (JOS-139); nothing turns them into fragments yet.

This change is carved out of the umbrella change `decompose-script-into-chunks`, as JOS-144 and JOS-139 were. The clause-boundary exception (JOS-141, US-08) is done next, on top of this one (product owner decision, 2026-09-28).

## What Changes

- **AC1 — Sentence cuts:** the script is divided into sentences by a fixed, documented rule, and every cut falls between two sentences; each chunk is one or more complete consecutive sentences.
- **AC2 — Bounds:** every chunk's narrated duration is between 5 s and 15 s, except a whole script shorter than 5 s (one chunk, flagged `script-below-lower-bound`) and a chunk that cannot fit without splitting a sentence (see below).
- **AC3 — Short sentences:** a sentence below 5 s is grouped with the following sentence; the script's last sentence is grouped with the previous one; a script of one sentence stays one chunk.
- **AC4 — Optimization:** among the groupings that satisfy the rules, the one whose chunks need the smallest total speed change to reach an admitted clip duration is chosen, using §7.2's measure (the speed-change ratio, a tie going to the longer duration).
- **AC5 — Fidelity:** the fragments are the script's own text, in order; joined, they reproduce it apart from separator whitespace.
- **Until JOS-141 adds clause splitting:** a sentence that alone exceeds 15 s, or a short sentence whose grouping with the next one exceeds 15 s, is kept whole and flagged `unsplittable-sentence`. This is exactly §6.1.1's rule for a sentence with no clause boundary, so the output is always valid; JOS-141 then splits where a comma, semicolon or conjunction allows.
- A script for which no grouping satisfies the rules is refused as a decomposition failure, never as an error in the User's script.
- A phase entry point runs the whole decomposition phase: timestamps (JOS-139), then segmentation, then registration (JOS-144).

## Admitted clip durations (product owner decision, 2026-09-28)

The optimization uses the whole seconds 5 to 15, as the video provider's documentation states; only 5 s and 15 s were verified in JOS-165. The set is recorded in one constant (which JOS-147 reuses), and 8 s and 11 s are verified with real video-provider calls during this change's manual test (about $1-2). If a value is rejected, the constant shrinks and the optimization follows.

## Out of Scope (owned by other tickets)

- Splitting a sentence at a clause boundary (§6.1 exception, §6.1.1 cases 1-2): JOS-141.
- Turning fragments into narration intervals that partition the MP3, and allocating silences (D11): JOS-143, JOS-142. This change measures durations with one interim rule (see design) that JOS-143 must adopt or replace.
- Requesting the admitted clip duration per chunk and recording the speed factor: JOS-147, JOS-148.
- Retrying a failed decomposition: JOS-156.

## Capabilities

### New Capabilities

- `script-segmentation`: dividing the locked script into ordered fragments of whole sentences whose narrated duration fits the video provider's limits — how sentences are found, how durations are measured, the bounds and their exceptions, how short sentences are grouped, how a grouping is chosen, and when segmentation is refused.

### Modified Capabilities

None in `openspec/specs/`. The umbrella change `decompose-script-into-chunks` (not archived) loses its sentence-boundary and whole-script-below-lower-bound requirements in this same change; its clause-boundary requirements stay there for JOS-141.

## Impact

- **Depends on** JOS-139 (stored character timestamps; branch stacked on `feature/jos-139-obtain-narration-timestamps`, itself on JOS-144's) and JOS-144 (`registerDecomposition`, `SegmentedFragment`); JOS-165 (the 5 s and 15 s bounds).
- **Backend:** a pure segmentation module (sentence detection, character-to-sentence mapping, duration measure, grouping search); the admitted-duration constant; a phase function reading the stored timestamps and handing fragments to `registerDecomposition`.
- **No schema change, no new route.**
