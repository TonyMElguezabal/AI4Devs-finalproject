# Design — Assign scene identifiers and visual instructions (JOS-144)

## Context

§5 step 5 comes after segmentation (step 4): the script is already cut into ordered fragments, each with its narrated duration. This step numbers them, obtains an `IMAGE` and a `VIDEO` instruction for each, checks the result, and registers the chunks. §6 fixes the rules: identifiers 1..N in order of appearance, unique within the session, never changing; four complete content fields; an invalid system-generated structure is a decomposition failure, not a script error; established chunks can't be split, merged, deleted or reordered. §6.1 adds that fragments respect the duration bounds (with the §6.1.1 exceptions) and still reconstruct the script.

The skeleton today: a `scenes` table with a UUID primary key, an `idx`, and one `instruction` field that stands in for `PROMPT`, `IMAGE` and `VIDEO`. Scenes are only ever created by tests. Session state is derived from the scenes (`deriveSessionState`); a session with no scenes derives to `submitted`. `runs.failure` exists (JOS-136) but only for the voice-over phase, and nothing reads it when deriving state.

Segmentation (JOS-140) does not exist, and neither does the voice-over (JOS-136). The product owner decided that nothing in the running app triggers this step yet.

## Goals / Non-Goals

**Goals:**
- A function the segmentation story can call: fragments in, chunks registered or a decomposition failure recorded.
- A distinct `PROMPT`, `IMAGE` and `VIDEO` per chunk, so JOS-145 can start.
- Identifiers and narrative content that the store itself keeps fixed.

**Non-Goals:**
- Segmentation, timestamps, intervals, the `chunk-decomposing` state, retries (other tickets, see the proposal).
- Wiring the step into the running app.

## Decisions

**Decision 1 — The input is a typed fragments port, and nothing calls it yet.**
`registerDecomposition(runId, fragments, generator)` takes `SegmentedFragment[]` — `{ text, narratedDurationSeconds, exception? }`, where `exception` is `"script-below-lower-bound"` or `"unsplittable-sentence"` (§6.1.1) — and a `VisualInstructionGenerator`. JOS-140 produces the fragments and calls it.
*Alternatives rejected (product owner, 2026-09-27):* a shortcut after `POST /sessions` with a stub splitter (calls OpenAI on every session creation; clashes with JOS-136's launch from `submitted`); a dev-only endpoint (a route that must never ship).

**Decision 2 — The PRD's `ID` is `scenes.idx`, made unique per session.**
A unique index on `(run_id, idx)` lets the store refuse a duplicate number. The scene UUID stays the internal key that routes and foreign keys already use.
*Alternative rejected:* replacing the UUID primary key with `(run_id, idx)` — it touches every route, foreign key and the frontend for no behavioural gain.

**Decision 3 — `PROMPT`, `IMAGE` and `VIDEO` get their own columns; the skeleton's `instruction` stays for now.**
Migration 7 adds `prompt`, `image_instruction` and `video_instruction`. The skeleton's image stage and its correction route read and write `instruction`, so registration also sets `instruction` to the `IMAGE` instruction. JOS-145 moves the image stage to `image_instruction` and JOS-157 owns correcting it; until then, a correction updates only `instruction`. This is recorded as a hand-off, not hidden.
*Alternative rejected:* renaming `instruction` to `image_instruction` now — it changes the correction route and the frontend, which belong to JOS-157 and JOS-145.

**Decision 4 — One reasoning call returns the instructions for all fragments, validated with Zod.**
The OpenAI adapter sends every fragment's text, in order, in one chat-completions request with `response_format: json_object` (the shape verified in JOS-165), and expects `{ "scenes": [{ "image", "video" }, …] }`. The response must hold exactly one pair per fragment, each non-empty; anything else is an invalid decomposition. Transport failures are classified by HTTP status (not retryable: 4xx except 408 and 429; transient: 408, 429, 5xx, network errors and the 20 s phase limit), the same rule the product owner set for voice. The adapter makes exactly one request: no SDK, no automatic retries (the retry policy is JOS-184's). The credential is `OPENAI_KEY`, read through `loadCredential`.
*Alternative rejected:* one call per fragment — N paid requests, N failure points, and no shared context for a consistent visual style.

**Decision 5 — Validate everything first, then register all chunks in one transaction.**
Order: structure (at least one fragment, non-empty text), §6.1 bounds (each duration within 5–15 s, except a single fragment flagged `script-below-lower-bound` below 5 s, or a fragment flagged `unsplittable-sentence` above 15 s), §4.2 reconstruction (fragments joined in order equal the locked script after normalising whitespace), then the generated instructions. Only when all pass are the chunks inserted, together, inside one transaction. A failure at any point records the session failure and leaves no chunks.
*Alternative rejected:* inserting chunks as instructions arrive — a failure halfway would leave a partial scene list that §6 forbids.

**Decision 6 — A decomposition failure is a session failure attributed to the system.**
`runs.failure` becomes a `SessionFailure` union: the existing voice-over failure, or `{ phase: "decomposition", cause, retryable, occurredAt }`. The cause is written for a person and says the system's decomposition was invalid; it never says the script is wrong. `deriveSessionState` gains the failure: a session with no chunks and a failure derives to `failed` with that phase; chunks all `submitted` still derive to `chunks-processing` (AC5). JOS-136's task 5.15 extends the same function for the voice-over states; whichever lands second merges the other's rules.

**Decision 7 — Established chunks are locked by store triggers, following the JOS-137 convention.**
Migration 7 adds triggers refusing `UPDATE OF idx`, `UPDATE OF prompt` and `UPDATE OF run_id` on `scenes`, and any `DELETE` of a scene. `IMAGE` and `VIDEO` stay writable, since §10.3 lets them be corrected after a failure. The test-only `resetAll()` lifts the delete trigger inside its existing transaction and recreates it from the same constant. Registration refuses a session that already has chunks, and the unique index refuses a duplicate number regardless of the caller.

## Risks / Trade-offs

- **No caller in the app** → The step is proven by tests and one opt-in real call, not by the running app, until JOS-140 wires it. The curl and browser steps check what exists: no route or control splits, merges, deletes or reorders chunks.
- **Two instruction columns for the image until JOS-145** → `instruction` and `image_instruction` can diverge after a correction. Recorded as a hand-off to JOS-145 and JOS-157.
- **The reasoning provider sanitises instructions silently** (JOS-165, step 7a) → Nothing to detect it; the fields are still non-empty, so the step succeeds. Remains the open finding in ADR 0005.
- **Scene deletion is now refused by the store** → The MVP has no scene deletion; a future story that needs it drops the trigger in its own migration, visibly.

## Migration Plan

Migration 7 adds three columns with empty defaults, the unique index and four triggers. Existing skeleton scenes keep their data; the index is safe because existing tests never create two scenes with the same number in one session (checked in the gate). Rollback: a migration dropping the triggers and the index; the columns can stay.

## Open Questions

None blocking.
