# Design — Segment the script into chunks within duration bounds (JOS-140)

## Context

§6.1: cuts on sentence boundaries; each chunk between the lower bound (5 s) and the video provider's maximum (15 s); a short sentence is grouped with the following one (the previous one if it is last); among valid groupings, prefer the one closest to durations the provider admits. §6.1.1: a whole script under 5 s is one chunk; a sentence that must be split but has no clause boundary is kept whole even above the maximum. §7.2 defines "closest" as the smallest speed-change ratio, a tie going to the longer duration. §7.3 requires the final narration intervals to partition the MP3 from 0 to its full duration; how silences are allocated is D11 (JOS-142), still open.

What exists (stacked base):
- **JOS-139** stores, once per session, `narration-timestamps.json`: `{ mechanism, characters: [{ text, start, end }] }`, one entry per character of the script (native: exactly the script; alignment: the script apart from whitespace), plus the MP3's measured duration on `voice_overs`. Real data: native timestamps are gapless; forced alignment starts about 0.1 s in and leaves gaps up to about 1 s, mostly at sentence and clause ends.
- **JOS-144** takes `SegmentedFragment[]` (`{ text, narratedDurationSeconds, exception? }`, `exception` being `script-below-lower-bound` or `unsplittable-sentence`) and validates bounds, reconstruction and instructions before registering chunks.
- `VIDEO_ADMITTED_DURATION_SECONDS = { min: 5, max: 15 }` and the two segmentation bounds derived from it.

## Goals / Non-Goals

**Goals:**
- A pure, deterministic segmentation function with a precise rule for every step, so its tests can pin each AC.
- Output that JOS-144 always accepts, before and after JOS-141 lands.
- One phase entry point for JOS-136 to call.

**Non-Goals:**
- Clause splitting (JOS-141); intervals and silence allocation (JOS-143, D11); requesting durations (JOS-147); retries (JOS-156).

## Decisions

**Decision 1 — Sentences are found by one documented rule, per language.**
A sentence ends at `.`, `!`, `?` or `…`, together with any closing quotes or brackets right after it, when followed by whitespace or the end of the script. A period is not an end when the word before it is a known abbreviation (English: Mr, Mrs, Ms, Dr, St, Jr, Sr, vs, e.g, i.e; Spanish: Sr, Sra, Srta, Dr, Dra, Ud, Uds, pág) or a single capital letter (an initial). Text after the last terminator is the last sentence. Whitespace between sentences belongs to no sentence; each sentence is its exact text without surrounding whitespace.
*Alternative rejected:* asking the reasoning provider to cut sentences — not deterministic, costs a call, and JOS-165 found it drops whitespace (the reason for `DECOMPOSITION_REQUIRES_WHITESPACE_PRESERVATION_INSTRUCTION`).

**Decision 2 — Characters are mapped to sentences by position, ignoring whitespace for alignment.**
Native timestamps match the script character for character, so a sentence's characters are found by index. For alignment timestamps, the script's and the timestamps' non-whitespace characters are walked in step (JOS-139 guarantees they are equal). A sentence's speech span is from the start of its first character to the end of its last.

**Decision 3 — A chunk's narrated duration uses one interim partition rule, owned by one function.**
Boundaries between consecutive sentences are placed at the midpoint of the pause between them (the previous sentence's end and the next one's start); the first boundary is 0 and the last is the MP3's measured duration. A chunk's narrated duration is the distance between its two boundaries. This makes the durations a partition of the MP3, as §7.3 requires of the final intervals, and splits each pause evenly, not favouring either D11 candidate. The rule lives in one function, `chunkDurations`; **JOS-143 must reuse it or replace it together with this function**, otherwise chunks sized within the bounds here could leave them after intervals are computed.
*Alternatives rejected:* the speech span alone (drops the pauses, so the final intervals would be longer than what the bounds checked); giving each pause to the previous chunk (a D11 decision taken early).

**Decision 4 — The grouping is found by an exhaustive dynamic programme over sentences.**
A grouping is a list of cuts between sentences. Each candidate chunk (sentences i..j) is **allowed** when:
- (a) its duration is within 5-15 s and it does not end on a sentence under 5 s unless that sentence is the script's last (AC3: a short sentence goes with the following one); or
- (b) the whole script is one chunk under 5 s → flagged `script-below-lower-bound`; or
- (c) it is a single sentence over 15 s, or a sentence under 5 s followed by one sentence whose sum is over 15 s → flagged `unsplittable-sentence` (§6.1.1's no-boundary rule, the interim behaviour until JOS-141).
Each allowed chunk costs `ln(r)`, where `r` is §7.2's speed-change ratio to the closest admitted duration (a tie going to the longer one). The programme picks the allowed grouping with the smallest total cost; ties go to fewer chunks, then to the grouping whose first cut comes later. It is O(n²) in sentences, fine for any script. A log-ratio sum treats a 2x slow-down and a 2x speed-up as equal and adds across chunks.
*Alternative rejected:* a greedy loop (the umbrella's Decision 3) — simpler, but it cannot guarantee AC4's "chosen among all valid groupings".

**Decision 5 — No valid grouping is a decomposition failure.**
When no grouping of allowed chunks exists (for example a long sentence followed by two short sentences ending the script, where every combination breaks a rule), segmentation returns an error, and the phase records a `DecompositionFailure` (retryable: false, since the same script and timestamps give the same result) with a cause that names the system, not the script. JOS-141's splitting will make these cases rarer.

**Decision 6 — The admitted durations are one constant of whole seconds.**
`VIDEO_ADMITTED_DURATIONS_SECONDS = [5, 6, …, 15]` in `backend/src/config/providers.ts`, derived from the existing `min`/`max`, with its provenance: 5 and 15 verified in JOS-165, the rest from the provider's documentation, 8 and 11 verified in this change's manual test. JOS-147 reuses it.

**Decision 7 — One phase entry point, still without a trigger.**
`runDecompositionPhase(runId, { alignmentProvider, instructionGenerator })` obtains the timestamps if they are not stored (JOS-139), then `segmentStoredTimestamps` reads them, segments, and calls JOS-144's `registerDecomposition`. It stops at the first failure, which the step that failed has already recorded. Nothing in the running app calls it yet; JOS-136's voice phase calls it when a narration completes, as for JOS-139.

## Risks / Trade-offs

- **The interim duration rule may not match D11.** → It is one function, flagged here and on JOS-142/JOS-143. If D11 picks another rule, both segmentation and intervals change together.
- **Sentence detection is rule-based** and will mis-cut some texts (unlisted abbreviations, dialogue punctuation). → The rule is small and tested per language; a mis-cut produces a valid but less natural chunk, never an invalid one (fragments still reproduce the script).
- **Intermediate admitted durations are unverified until the manual test.** → Verified there (8 s, 11 s); a rejection changes one constant.
- **Interim `unsplittable-sentence` flags sentences that do have clause boundaries.** → Only until JOS-141, which splits them; the flag's effect (slow the clip at the maximum duration, §7.2) is what §6.1.1 prescribes anyway.

## Migration Plan

No schema change. Rollback: revert the code.

## Open Questions

None blocking. D11 (JOS-142) may later replace Decision 3's rule.
