# Assign scene identifiers and visual instructions

Linear-Issue: JOS-144 (US-11)

## Why

PRD §5 step 5 turns the segmented script into scenes: each fragment gets a sequential identifier and an `IMAGE` and `VIDEO` instruction, and only then can images and clips be generated. Today the backend skeleton keeps a single conflated `instruction` per scene and has nothing that numbers fragments, generates instructions, or refuses an invalid decomposition. JOS-145 (image generation) is blocked on a distinct `IMAGE` instruction, and every later story relies on identifiers that never change (§6).

This change is carved out of the umbrella change `decompose-script-into-chunks`, which bundled this ticket with timestamps, segmentation and intervals (JOS-139, JOS-140, JOS-141, JOS-143). Its US-11 requirements move here so the two changes don't state the same rules twice.

## What Changes

- **AC1 — Identifiers:** given the ordered fragments, chunks are numbered with the consecutive integers 1..N in fragment order. The number is unique within the session (not across sessions) and never changes.
- **AC2 — Complete chunks:** every chunk carries a non-empty `ID`, `PROMPT` (the fragment's text, unchanged), `IMAGE` and `VIDEO`. The two instructions come from the reasoning provider (OpenAI `gpt-6-astra`, PRD §11.3) in one call for all fragments.
- **AC3 — Failure attribution:** an invalid system-generated decomposition is recorded on the session as a **decomposition** failure, never as an error in the User's script. Invalid means: no fragments, an empty fragment, a fragment outside the §6.1 duration bounds other than the two §6.1.1 exceptions, fragments that do not reconstruct the locked script (§4.2), or instructions that are missing, empty or not one pair per fragment. Registration is all or nothing: an invalid decomposition leaves no chunks.
- **AC4 — Established chunks are fixed:** no operation splits, merges, deletes or reorders chunks. The store refuses changing a chunk's number, `PROMPT` or session, and refuses deleting a chunk; the API and the session page offer no such action.
- **AC5 — Registration moment:** on success every chunk is `submitted` and the session derives to `chunks-processing`.

## Trigger (product owner decision, 2026-09-27)

Nothing in the running app calls this step yet. It is built and tested as `registerDecomposition(runId, fragments, generator)` behind a typed fragments port, and the segmentation story (JOS-140) wires it in once the voice-over (JOS-136) and timestamps exist. Rejected for now: a shortcut after `POST /sessions` (it would call OpenAI on every session creation and clash with JOS-136, which launches the voice-over from the same moment) and a dev-only endpoint (an API surface that must never ship).

## Out of Scope (owned by other tickets)

- Obtaining timestamps, segmenting the script and assigning narration intervals: JOS-139, JOS-140, JOS-141, JOS-143 (the umbrella change).
- Retrying a failed decomposition: JOS-156 (US-24) and the retry policy JOS-184.
- The `chunk-decomposing` state and what triggers the phase: JOS-140.
- Correcting `IMAGE` or `VIDEO` after a failed stage (§10.3): JOS-157, JOS-158.
- Speed-factor warnings for an unsplittable sentence (§6.1.1): JOS-148.

## Capabilities

### New Capabilities

- `scene-registration`: turning the ordered fragments of a completed segmentation into the session's chunks — how they are numbered, what each must carry, how the visual instructions are obtained, when a decomposition is refused and how that failure is recorded, and why established chunks can never be split, merged, deleted or reordered.

### Modified Capabilities

None in `openspec/specs/`. The umbrella change `decompose-script-into-chunks` (not archived) loses its US-11 requirements in this same change, with a pointer here.

## Impact

- **Depends on** JOS-165 (done: reasoning provider, `OPENAI_KEY`, the 5 s and 15 s bounds, the 20 s phase limit) and JOS-137 (done: the store-trigger convention this change follows).
- **Backend:** a migration adding `prompt`, `image_instruction` and `video_instruction` to `scenes`, a unique `(run_id, idx)` index and the chunk-lock triggers; the fragments port, the validation, the registration; an OpenAI adapter for the visual instructions; `deriveSessionState` reads a session failure.
- **Data model:** the PRD's `ID` is `scenes.idx`; the scene UUID stays the internal key. `runs.failure` can now carry a decomposition failure.
- **API:** the scene representation gains `prompt`, `imageInstruction` and `videoInstruction`; no new route.
- **Unblocks** JOS-145, whose gate needs a distinct `IMAGE` instruction.
