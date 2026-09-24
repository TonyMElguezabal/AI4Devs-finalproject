# Decompose the script into chunks with their visual instructions

## Why

Once the voice-over exists, nothing in the project turns a locked script into scenes. Without this story a session can be created and narrated, but it can never reach `chunks-processing`: there are no chunks to generate an image or a clip for, and the pipeline `docs/PRD.md` §5 describes stops at step 2. §5 steps 3 and 4 — obtaining timestamps and dividing the script — belong to the same phase and share one state, `chunk-decomposing`, and one retry policy; this change is where that phase is specified.

What this phase produces is also where the product's strictest content guarantee is checked for the first time: the chunks' `PROMPT` fields, joined in order, must reconstruct the locked script exactly (§4.2, AC03), and their narration intervals must partition the voice-over's timeline with no gaps or overlaps (§7.3, AC19). Every later story — image generation, video generation, assembly — inherits whatever this phase gets wrong.

## What Changes

- Launch decomposition automatically when a session reaches `voice-over-complete`, moving it to `chunk-decomposing` before any provider is called (§5 steps 3–4, §8.1).
- Obtain narration timestamps by the two-mechanism rule of §11.1: use the voice-over's native timestamps when usable; otherwise call the alignment provider with the MP3 and the script. Inability to obtain timestamps by either mechanism is a decomposition failure, never a voice failure.
- Apply the sentence-boundary segmentation rule of §6.1: group one or more complete consecutive sentences per chunk, bounded above by the active video provider's maximum admitted duration and below by the hardcoded lower bound, with the clause-boundary exception for a sentence that alone exceeds the upper bound, and a preference for the admitted duration closest to each grouping's narrated length.
- Handle the three §6.1.1 edge cases explicitly: a whole script shorter than the lower bound; a short sentence whose grouping with the next would exceed the upper bound; a sentence that must split but has no clause boundary.
- Assign consecutive scene identifiers 1..N by order of appearance, unique within the session and immutable through every later retry (§6).
- Generate the `IMAGE` and `VIDEO` instructions for every chunk via the reasoning provider, from the chunk's own `PROMPT` — generating instructions is not a script modification (§4.2).
- Verify, before the phase can complete, that every chunk carries its four content fields, that the joined `PROMPT`s reconstruct the script exactly (only whitespace normalization allowed), and that the narration intervals form a contiguous, non-overlapping partition of the voice-over from second 0 to its full duration. Any violation is a decomposition failure of the system, never a script error (§6, §6.1, AC03, AC17, AC18, AC19).
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
