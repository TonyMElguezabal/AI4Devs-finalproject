# Decompose the script into chunks with their visual instructions

## Why

Once the voice-over exists, nothing in the project turns a locked script into scenes. Without this story a session can be created and narrated, but it can never reach `chunks-processing`: there are no chunks to generate an image or a clip for, and the pipeline `docs/PRD.md` §5 describes stops at step 2. §5 steps 3 and 4 — obtaining timestamps and dividing the script — belong to the same phase and share one state, `chunk-decomposing`, and one retry policy; this change is where that phase is specified.

What this phase produces is also where the product's strictest content guarantee is checked for the first time: the chunks' `PROMPT` fields, joined in order, must reconstruct the locked script exactly (§4.2, AC03), and their narration intervals must partition the voice-over's timeline with no gaps or overlaps (§7.3, AC19). Every later story — image generation, video generation, assembly — inherits whatever this phase gets wrong.

## What Changes

- Start from the timestamps stored by `obtain-narration-timestamps` (JOS-139), which launches the phase, obtains the timestamps by the two-mechanism rule of §11.1 and records a timestamps failure as a decomposition failure. Those rules were carved out of this change on 2026-09-28.
- Segment the script by the sentence-boundary rule of §6.1: carved out to `segment-script-into-chunks` (JOS-140) on 2026-09-28, which also handles a whole script shorter than the lower bound. The clause-boundary cases of §6.1.1 stay here for JOS-141 (US-08).
- Handle the two clause-boundary cases of §6.1.1 explicitly (JOS-141): a short sentence whose grouping with the next would exceed the upper bound, and a sentence that must split but has no clause boundary.
- Verify, before the phase can complete, that the narration intervals form a contiguous, non-overlapping partition of the voice-over from second 0 to its full duration; a violation is a decomposition failure of the system (§7.3, AC19).
- Hand the ordered fragments to `assign-scene-identifiers` (JOS-144), which assigns identifiers 1..N, generates `IMAGE`/`VIDEO`, checks the four fields, the §6.1 bounds and the script reconstruction, and registers the chunks. Those rules were carved out of this change on 2026-09-27.
- Reuse (not reimplement) the retry budget from `stage-retry-policy` and the per-stage timeout from `stage-execution-time-limit` for both the `timestamps` and `decomposition` stage instances.
- Route a manual retry of "Obtención de marcas de tiempo" back to the same audio, switching straight to the alignment provider when native timestamps exist but are unusable, without calling the voice provider again; route a manual retry of "Descomposición" to re-split the same script without rewriting it or regenerating the audio (§10.3).

## Capabilities

### New Capabilities

- `script-decomposition`: turning a session's locked script and completed voice-over into an ordered, gapless set of chunks with narration intervals and visual instructions — what triggers it, how timestamps are obtained, how the segmentation rule is applied, what a valid result must satisfy, and how its two recoverable failures (timestamps, decomposition) are retried.

### Modified Capabilities

None. `openspec/specs/` is still empty; `session-creation`, `voice-over-generation`, `stage-retry-policy` and `stage-execution-time-limit` are not yet archived, so this change consumes them rather than modifying them.

## Impact

- **Blocked on the same three stack spikes as every sibling story.** `define-backend-stack` (JOS-179), `define-frontend-stack` (JOS-180) and `define-persistence` (JOS-181) are all in progress; this story needs a framework to run the orchestration and a store to persist the resulting chunks. Nothing here can be implemented before those land.
- **Depends on `define-provider-configuration` (JOS-165)** for the video provider's admitted durations and maximum (the segmentation upper bound), the hardcoded lower bound, and which provider serves the alignment capability.
- **Depends on `generate-voice-over`**, whose native-timestamp outcome (available or not) decides which of the two §11.1 mechanisms this phase uses first.
- **Reuses, without modification, `bounded-retry-policy` (`stage-retry-policy`) and `stage-execution-time-limit`.** This change does not restate their rules; it declares two more stage instances (`timestamps`, `decomposition`) governed by them.
- **Data model**: introduces the `Chunk` rows for a session and two `StageExecution` rows per session (`timestamps`, `decomposition`), per the entities already recorded in `readme.md` §3. `docs/data-model.md` still describes an unrelated inherited domain and is not used as a source here.
- **API contract**: `docs/api-spec.yml` likewise describes an unrelated domain; this change does not extend it. Endpoint and route detail is deferred to the stack decision.
- **Downstream**: unblocks image generation, video generation and final assembly, none of which have chunks to act on until this phase completes.
- **No provider credential beyond reasoning, voice-reading and alignment is exercised here**; image and video providers are not called.
