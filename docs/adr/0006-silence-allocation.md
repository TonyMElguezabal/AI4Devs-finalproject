# ADR 0006 — Silence allocation (D11)

- Status: Accepted
- Date: 2026-09-29
- Change: `decide-silence-allocation` (JOS-142, US-09)

## Context

PRD §7.3 requires the scenes' narration intervals to partition the voice-over from second 0 to its full duration, but leaves open which scene a silence between two sentences belongs to (D11). `segment-script-into-chunks` (JOS-140) shipped an interim rule — the boundary at the midpoint of the pause — so that segmentation could be built without waiting for D11; `unitBoundaries` (`backend/src/sentenceTimings.ts`) is the one function both segmentation and the future narration-interval story (JOS-143) use, so the decision here changes both at once. Real narrations (JOS-139, JOS-140's manual tests) carry pauses of roughly 0.5-1.3 s between sentences with both native and forced-alignment timestamps, so the choice is visible in every video the product produces.

D11 named two candidates: the previous scene absorbs the silence that follows it, or the silence is split between the two adjacent scenes (the interim rule). §14.1 asked for both to be compared on representative scripts, for the longest silence a single clip sustains acceptably, and for the chosen rule to keep §7.3's partition, §6.1's bounds and the speed-factor limit.

Full evidence: `openspec/changes/archive/2026-09-29-decide-silence-allocation/reports/` (steps 2-4, 9-11).

## Decision

**Rule adopted: the previous scene absorbs the silence that follows it.** For units with speech spans `[sᵢ, eᵢ]` and MP3 duration `D`, the boundary between unit `i` and `i+1` is `bᵢ = sᵢ₊₁` (the following unit's speech start); `b₀ = 0`; `bₙ = D`. The cut to the next scene falls exactly when its narration starts, never mid-silence.

**Rejected: splitting the silence (`bᵢ = (eᵢ + sᵢ₊₁) / 2`, JOS-140's interim rule).** Both rules pass every measurable check (below); the choice was made on a rendered comparison, not on the numbers.

**Threshold: a clip sustains up to 2 s of silence acceptably; 3 s starts dragging.** No third rule was defined, because no real pause measured in this change's survey (max 1.26 s, forced-alignment shape) approaches it.

### Evidence gathered, cheapest first

1. **Pause survey** (step 2) — four real narrations (two English, two Spanish, 647-721 characters, covering a period, question mark, exclamation mark, commas, a paragraph break, an ellipsis and a dash), each with native and forced-alignment timestamps: 48 pauses, 0.04-1.26 s. No terminator type stood out as systematically longer.
2. **Numeric comparison** (step 3) — both rules run through the real `findSentences`/`buildUnits`/`sentenceSpeechSpans`/`closestAdmittedDuration` pipeline (a reimplementation of `segmentScript`'s DP with the boundary rule as a parameter, verified fragment-for-fragment against the real function before being trusted) on all 8 narrations. Every fragment stayed within the 5-15 s bounds; the highest speed-change ratio seen anywhere was **1.08x**, against `define-media-assembly`'s (JOS-182) recommended 0.5x-2.0x ceiling; every narration produced a valid grouping under both rules; every rule's fragments summed to the exact MP3 duration. Neither rule needed reliably less speed change than the other (average-of-max: rule A 1.050x, rule B 1.048x).
3. **Rendered comparison** (step 4) — one ~46 s real English narration, real Fal.ai images and RunningHub clips (`$5.852` total), assembled twice with `define-media-assembly`'s documented pipeline (`assemble.sh`), once per rule, same clips and grouping — isolating the cut position.
4. **Threshold sweep** (step 4) — the same narration's longest natural pause (1.115 s), replaced with synthetic silence of 1, 1.5, 2, 3 and 4 s, rendered under both rules with the two flanking clips always playing at exactly 1.0x (trimmed from a 15 s source, never retimed) so slow-down quality (JOS-182's subject) never mixed into the silence judgement.

### The verdict

The product owner watched the rendered comparison and the sweep (2026-09-29) and reported: *"Rule A reads better at natural pauses"*; *"2 seconds feels fine, 3 seconds starts dragging."* This matched the agent's recommendation, written before anything was shared: under the interim rule, the next scene's image could appear before its narration started (up to half the pause length early); under the adopted rule, the image and the words it illustrates always begin together.

### Idea raised, out of this decision's scope

The product owner also suggested a manual dial: if a scene still feels like it drags despite the automatic rule, let the user shorten or lengthen it and regenerate its clip. This is a user-facing capability, not part of D11's automatic rule, and was filed separately (**JOS-190**) rather than designed here. It is not scoped, estimated or committed to the MVP.

## Consequences

- `unitBoundaries` (`backend/src/sentenceTimings.ts`) implements the adopted rule; `segmentScript` and the decomposition phase inherit it unchanged (one function, two call sites, no other code touched). Every real fragment's measured duration shifts by up to about the length of its neighbouring pauses relative to the interim rule — accounted for in the numeric comparison, not a surprise at merge time.
- `narration-intervals` (JOS-143) must reuse `unitBoundaries` rather than re-deriving a rule.
- PRD updated to v1.5: §7.3 states the rule and the threshold; AC12 and AC19 reference it; D11 is closed; §14.1 is marked done; v1.4 is kept as `docs/PRD-v1.4.md`.
- The speed-factor limit itself stays provisional pending US-33 and JOS-182's own merge into this branch's history; this decision only checked against JOS-182's recommendation, it does not fix the constant.

## Risks / Trade-offs

- **One narration's renders stood for all content.** → The numeric comparison covered four narrations in two languages and two timestamp shapes; only the rendered judgement used one.
- **The threshold (2 s / 3 s) came from one person watching one sweep.** → Recorded as the product owner's own words, not an agent estimate; revisit if real narration production later produces pauses closer to it (none in this survey did).
- **A future real narration could exceed the 1.26 s ceiling this survey measured.** → Design Decision 5 already provided for that case (propose a third rule before closing); it did not trigger here. If it does later, the manual dial (JOS-190) is one option already on record, not the only one.
