# Generate a chunk's image

## Why

`decompose-script-into-chunks` leaves every chunk with an `IMAGE` instruction and nothing that acts on it. Without this story a session can be fully decomposed and stay there forever: §7.1 requires an image before a clip can even be requested (§7.1, AC05), so nothing downstream — video generation, assembly, `chunk-complete` — can begin. This is also the first story where a single scene, not the whole session, can fail and recover independently of its siblings (§10.2, AC10), and where the PRD's one visual-correction exception (§10.3, AC09) becomes concrete.

## What Changes

- Launch image generation for each chunk once it exists with a non-empty `IMAGE` instruction, through the shared phase-launch gate that already applies the per-stage concurrency cap and pause hold (§9, §10.1) — this story does not reimplement that gate, it is another caller of it.
- Send the chunk's `IMAGE` instruction to the hardcoded image provider, which must meet the §11/§7.1 capability: a 16:9 image at a minimum resolution of 1920×1080.
- Persist the result in the session's project folder; when the provider returns only a temporary link, download and store it before the link expires (§12.2, D05) — no reference to an expiring link is ever kept as the record.
- Transition the chunk `submitted → image-generating → image-complete`, or `failed` when the stage's retry budget (reused from `stage-retry-policy`) is exhausted.
- Refuse to launch video generation for a chunk that has not reached `image-complete` (§7.1, AC05) — enforced here as a precondition, implemented by `generate-chunk-video`.
- Offer the one visual-correction path §10.3/AC09 grants: on a failed image stage, retry with the same `IMAGE` instruction or replace only `IMAGE` and retry. `ID`, `PROMPT`, and scene order remain permanently non-editable.
- Let other chunks' processing continue independently of one chunk's image failure (§10.2, AC10); assembly (out of scope here) is what eventually waits on every chunk.
- Offer the successful image for individual download while other chunks are still processing or have failed (§12.3, AC16).
- Record the stage's provider, attempts, status and cause in a `StageExecution` row (`owner_type = chunk`, `stage_name = image`), reusing the entity already defined in `readme.md` §3 — no new diagnostic entity.

## Capabilities

### New Capabilities

- `chunk-image-generation`: turning a chunk's `IMAGE` instruction into a stored image — when it launches, what capability the provider must meet, how the result is persisted, the one correction path a failed image stage allows, and how a chunk's own failure leaves its siblings unaffected.

### Modified Capabilities

None. `openspec/specs/` is still empty; `script-decomposition`, `stage-retry-policy` and `stage-execution-time-limit` are consumed, not modified.

## Impact

- **Blocked on the same three stack spikes as every sibling story**: `define-backend-stack`, `define-frontend-stack`, `define-persistence`, all in progress.
- **Depends on `decompose-script-into-chunks`** for the chunks and their `IMAGE` instructions this story acts on.
- **Depends on `define-provider-configuration`** for the image provider's identity and its not-retryable failure signal.
- **Reuses, without modification, `bounded-retry-policy` (`stage-retry-policy`) and `stage-execution-time-limit`** for the `image` stage instance, and the phase-launch gate `generate-voice-over` establishes for concurrency and pause.
- **Data model**: introduces `Chunk.image_result_path` and one `StageExecution` row per chunk (`stage_name = image`), per `readme.md` §3. `docs/data-model.md` remains an unrelated inherited domain and is not treated as a source here; it is one of the files this change's documentation task updates once the real stack lands.
- **Downstream**: unblocks `generate-chunk-video` (needs `image-complete`) and, transitively, final assembly.
- **First story where an individual scene can fail without the session failing** (§10.2) — the session-level `failed` state remains `bounded-retry-policy`'s and `stage-retry-policy`'s concern; this story only declares the `image` stage instance they act on.
