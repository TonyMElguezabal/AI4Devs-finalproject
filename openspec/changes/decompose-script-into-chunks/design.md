# Design — Decompose the script into chunks with their visual instructions

## Context

`generate-voice-over` leaves a session at `voice-over-complete` with an MP3, a record of whether native timestamps are available, and — when they are — the timestamps themselves stored unmodified. Nothing yet interprets them. `docs/PRD.md` §11.1 states the two-mechanism rule (native first, forced alignment as the declared fallback, also used when native timestamps exist but are unusable) but leaves "usable" undefined in measurable terms: usability here means granular enough to place every sentence boundary §6.1 cuts on, which is exactly what `define-provider-configuration`'s Decision 3 already flags as unverified until a real voice provider is chosen.

The segmentation rule (§6.1) is arithmetic once timestamps exist: cut on sentence boundaries, bound each chunk between the video provider's admitted minimum and maximum, split only at a clause boundary when a single sentence cannot fit, and prefer the admitted duration closest to each candidate grouping. The three edge cases in §6.1.1 are not separate rules — they are what the same optimization does at the extremes (a script entirely below the lower bound; a short sentence forcing a look-ahead split of its neighbour; a sentence with no clause boundary to split at all).

Two invariants make this phase's correctness checkable independently of the segmentation algorithm's internals: the chunks' `PROMPT` fields, joined in order, must equal the locked script byte-for-byte apart from whitespace normalization (§4.2, AC03); and their narration intervals must tile the voice-over's timeline with no gap and no overlap, from 0 to its total duration (§7.3, AC19). Either invariant failing is a defect in this phase, not a property of the user's script — the spec must make that distinction checkable, not just statable.

## Goals / Non-Goals

**Goals:**
- Specify exactly when each of the two §11.1 mechanisms is used, including the "native but unusable" case that forces alignment even though native timestamps were returned.
- Specify the segmentation rule and its three edge cases as one algorithm with edge behaviour, not four disconnected rules.
- Make the script-reconstruction and interval-partition invariants independently verifiable, so a test can check them without re-implementing the segmentation logic.
- Reuse the existing retry (`stage-retry-policy`) and timeout (`stage-execution-time-limit`) capabilities for two stage instances — `timestamps` and `decomposition` — without restating their behaviour.

**Non-Goals:**
- Choosing the alignment provider or measuring native-timestamp granularity — `define-provider-configuration` (JOS-165) owns that verification.
- Deciding how the narration silence between chunks is allocated (D11); this phase's partition requirement is written to hold under whichever rule D11 adopts, without anticipating it.
- Image generation, video generation or assembly — each is its own change and consumes this phase's chunks as input, not as something this change specifies.
- Any concrete endpoint, route or storage engine — deferred to `define-backend-stack`, `define-frontend-stack` and `define-persistence`.

## Decisions

**Decision 1 — Treat "timestamps" and "decomposition" as two stage instances sharing one session state.**
`docs/PRD.md` §5 explicitly groups steps 3 and 4 under one state, `chunk-decomposing`, and one retry policy narrative — but §10.3 lists "Obtención de marcas de tiempo" and "Descomposición" as two separately retryable rows, and `bounded-retry-policy` already keys a stage instance by "session and stage" for session-level stages. Modeling them as two `StageExecution` rows (`stage_name = timestamps`, `stage_name = decomposition`) lets each retry independently — a timestamps failure does not consume the decomposition budget and vice versa — while both still gate the same session state.
*Alternative rejected:* one combined stage instance for the whole phase. It would force the "switch to alignment without recalling the voice provider" rule into  a partial-retry special case instead of a plain instance boundary, and would make §10.3's two separate retry rows structurally impossible to express.

**Decision 2 — Segmentation runs only after timestamps exist, over sentence spans measured in narrated seconds.**
The algorithm operates on a list of (sentence text, narrated start, narrated duration) tuples derived from the timestamps, not on raw character offsets. This is what makes "duration narrada de un chunk" (§6.1) a value the algorithm can compare against the admitted-duration bounds directly.
*Alternative rejected:* segmenting on text length first and deriving durations afterward — §6.1's bounds are explicitly durations, and a text-length heuristic would need a second pass to correct for narration pace, doubling the cases to test.

**Decision 3 — Implement the three §6.1.1 edge cases as guard clauses inside one grouping loop, not as separate code paths.**
The loop greedily extends a candidate grouping while it stays under the upper bound and prefers stopping near an admitted duration; the "whole script below the lower bound" case falls out when the loop reaches the script's end with a single candidate still under the lower bound; the "short sentence forces a look-ahead split" case is the loop borrowing a clause-bounded prefix from the next sentence when the current candidate can't reach the lower bound alone; the "no clause boundary" case is what happens when that borrow fails and the oversized sentence is kept whole with a recorded speed-factor warning.
*Alternative rejected:* three independent special-case functions run before the main loop. §6.1.1 frames these as what the same optimization does at its boundaries, not as exceptions to it, and separate functions would let them drift out of sync with the main rule's admitted-duration preference.

**Decision 4 — Verify the two invariants (script reconstruction, interval partition) as a post-condition check independent of the segmentation implementation.**
*Carved out 2026-09-27:* the script-reconstruction half of this check now lives in `assign-scene-identifiers` (JOS-144) (its Decision 5); only the interval partition stays here.
After chunks are produced, a dedicated check concatenates `PROMPT` fields (normalizing only whitespace) against the stored script, and a second check walks the intervals in `sequence_number` order asserting `start[i+1] == start[i] + duration[i]` with `start[0] == 0` and the last interval's end equal to the voice-over's total duration. Either check failing marks the stage instance `failed` as a decomposition defect, distinct from a provider failure.
*Alternative rejected:* trusting the segmentation algorithm to guarantee both invariants by construction. §6, §6.1 and §6.1.1 are intricate enough (three edge cases, one exception clause) that a construction bug is plausible, and AC03/AC19 are stated as properties of the *result*, not of the algorithm — they should be checked as such.

~~Decision 5 — The reasoning provider generates `IMAGE`/`VIDEO` per chunk in the same pass that finalizes chunk boundaries, not as a separate stage instance.~~ **Superseded 2026-09-27 by `assign-scene-identifiers` (JOS-144):** the instructions are generated after segmentation, in one reasoning call over the ordered fragments (its Decision 4). The reasoning behind a single phase still holds: both are part of the `decomposition` phase and share its state and retry policy.
§11's capability table gives reasoning one responsibility: "dividir el guion... y generar instrucciones visuales" — one call, two outputs. Splitting it into two stage instances would need a rule for what happens when boundaries succeed but instruction generation fails, which the PRD never describes as a distinct failure mode.
*Alternative rejected:* a separate `visual-instructions` stage instance. It invents a state the PRD's five-capability table and §10.3's six-row failure table do not have room for.

## Risks / Trade-offs

- **Native-timestamp usability is unverified until a real voice provider is chosen** → The stage instance boundary between "timestamps" and "decomposition" (Decision 1) is what lets the spec state the fallback rule precisely without knowing yet how often it fires; `define-provider-configuration`'s own Decision 3 owns closing this gap.
- **The three-edge-case guard-clause design (Decision 3) is harder to unit-test exhaustively than three separate functions** → Mitigated by Decision 4's independent post-condition checks: even if the loop's internals are wrong, a broken result is caught before the phase reports success, rather than trusted because the code path "looked" like the right case.
- **D11's eventual silence rule could tighten the partition invariant** → Decision 4's check is written against "contiguous, no gap, no overlap, 0 to total duration" only — it does not encode *how* a silence is assigned to a neighbouring chunk, so it should continue to hold once D11 closes, but the acceptance criteria (AC19) will need re-verification against whichever rule D11 adopts.
- **Sequencing with the three stack spikes** → Like every sibling story, this one cannot be implemented before `define-backend-stack`, `define-frontend-stack` and `define-persistence` land; the risk is accepted the same way those siblings accept it.

## Migration Plan

Nothing is deployed and no chunk-producing code exists yet, so there is no migration. This change adds the `script-decomposition` capability and, once implemented, the first `Chunk` and `timestamps`/`decomposition` `StageExecution` rows a session can have. Rollback before implementation is deleting the change directory; after implementation, it is the same rollback path `start-video-project` and `generate-voice-over` already establish for their own code.

## Open Questions

1. **Does the chosen voice provider's native timestamp granularity make alignment the fallback or the standing mechanism?** Answered by `define-provider-configuration`'s Decision 3, not by this change.
2. **How does D11's eventual silence-allocation rule interact with the partition invariant?** Recorded as a risk above; this change's invariant is written to survive either candidate rule, but re-verification is expected.
3. **What are the exact hardcoded values for the lower bound and the video provider's admitted durations?** Owned by `define-provider-configuration`; this change consumes them as named constants, not as numbers it fixes itself.
