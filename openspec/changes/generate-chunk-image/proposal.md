# Generate the image of each scene

Linear-Issue: JOS-145 (US-12)

## Why

Once decomposition (JOS-144, US-11) leaves every chunk with an `IMAGE` instruction, nothing yet acts on it. §7.1 requires an image before a clip can be requested, so without this story no downstream work (clip generation, assembly, `chunk-complete`) can start. This is also the first stage that runs per scene rather than per session, so each scene must move forward on its own (§10.2).

The current backend skeleton (`define-backend-stack`, `define-persistence`) already models one stubbed provider-backed stage named `image`, which stands in for every PRD stage and jumps straight from `image-generating` to `chunk-complete`. This story turns that stand-in into the real image stage: it calls the recorded provider (Fal.ai `fal-ai/flux/dev`, PRD §11.3), checks the output, and ends in `image-complete`.

## What Changes

- **AC1 — Launch:** a chunk in `submitted` with a non-empty `IMAGE` instruction starts image generation without any User action, through the existing phase-launch gate (`concurrency.ts` plus the pause hold). The chunk is `image-generating` before the provider request is sent.
- **AC2 — Output check and completion:** a returned image is accepted only if width ≥ 1920, height ≥ 1080, and its aspect ratio is within ±1% of 16:9. The tolerance is needed because the recorded provider setting is 1920×1088 (1.765:1, 0.74% off 16:9). The provider rounds to multiples of 16, so exact 1920×1080 cannot be produced (PRD §11.3). An accepted image is stored in the session's project folder, its relative path is recorded on the chunk, and the chunk becomes `image-complete`.
- **AC3 — Independent progression:** a chunk whose image finishes moves to `image-complete` right away, even if other chunks of the same session are still `image-generating`. A failure in one chunk does not stop the others either.
- **AC4 — Provider binding:** the first attempt of a chunk's image stage binds the image provider to that chunk and stage (§11.2). The binding is stored, and every later automatic or manual retry of that stage uses the bound provider, even if the hardcoded provider changes in a later build.
- **§12.2 — No expiring links:** when the provider returns only a temporary URL, the image is downloaded into the project folder before the stage is marked successful. A failed download counts as a failed attempt.
- Replace the skeleton's shortcut `image-generating → chunk-complete` with `image-generating → image-complete`. Until clip generation (JOS-146, US-13) lands, `image-complete` is the last state a chunk can reach.

## Out of Scope (owned by other tickets)

- Retrying or correcting a failed `IMAGE` instruction (§10.3): **JOS-157 (US-25)**.
- Downloading an individual scene result during processing (§12.3): **JOS-163 (US-31)**.
- Showing provider and attempts per stage in the UI: **JOS-166 (US-34)**. This story only persists the binding.
- Refusing a clip request before `image-complete` (§7.1): **JOS-146 (US-13)**, which gates on the state this story produces.
- The retry budget, per-phase time limit and per-stage concurrency cap: **JOS-184 / JOS-154**, **JOS-185**, **JOS-167**. This story is another caller of those mechanisms and does not re-implement them.

## Capabilities

### New Capabilities

- `chunk-image-generation`: turning a chunk's `IMAGE` instruction into a stored image that is checked against the output constraints. Covers when generation launches, what output is accepted, how the result is persisted, how each chunk progresses independently, and how the provider is bound to the chunk's image stage.

### Modified Capabilities

None. The archived foundations (`backend-foundation`, `persistence-foundation`, `live-updates-foundation`) are consumed as they are. The skeleton's single stubbed stage is implementation, not a spec requirement.

## Impact

- **Depends on** JOS-144 (US-11) for chunks with `IMAGE` instructions, and on JOS-165 (US-33, done) for the provider identity, the 1920×1088 request size, the 25 s phase limit and the provisional concurrency cap of 200.
- **Backend:** a real `ImageProvider` port with a Fal.ai adapter and a stub adapter for tests. The orchestrator gets the new `image-complete` terminal step. The scene's derived-session-state logic is updated so `image-complete` counts as "still processing" and not as "final".
- **Data model:** the scene's existing `provider` column becomes the stored binding and is written on the first attempt. The `result` column holds the relative image path. No new table is added. `docs/data-model.md` is updated to match.
- **API:** the scene representation already exposes `status`, `provider` and `result`. `docs/api-spec.yml` is updated for the `image-complete` state and the result semantics.
- **Downstream:** unblocks JOS-146 (US-13), which gates clip generation on `image-complete`.
