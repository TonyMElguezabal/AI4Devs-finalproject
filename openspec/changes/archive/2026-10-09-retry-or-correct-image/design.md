# Design — Retry or correct the image instruction after an image failure

## Context

On `feature/entrega-2-JAME` (`ecfe430`):

- **Routes**:
  - `POST /sessions/:sessionId/scenes/:sceneId/retry` calls `manualRetry(sceneId)`.
  - `POST .../correct` (body `{ instruction: string.min(1) }`) calls `correctAndRetry(sceneId, instruction)`.
  - Neither uses `sessionId`. Refusals are 409 `{ ok: false, reason }` with free text.
- **`manualRetry`**:
  1. It refuses a scene that is not `failed`, and a scene with `result !== null`, which is a clip failure (JOS-146 Decision 7).
  2. It then calls `markScenePendingRetry`, an unconditional `UPDATE` to `submitted`.
  3. It resets `attempts` to 0, so the retry gets a fresh budget.
  4. It calls `launchSceneStage`, which dispatches to `launchImageStage` when `imageInstruction` is non-empty, otherwise to the skeleton stub.
- **`correctAndRetry`**: it applies the same checks, then `setSceneInstruction`, which writes the legacy `scenes.instruction`, then `manualRetry`.
- **The image stage** (`runImageAttempt`):
  - binds the provider once (`bindSceneImageProvider` writes only while the column holds the placeholder);
  - resolves the adapter for the *bound* identifier, failing not-retryably when none exists;
  - sends `image_instruction`;
  - goes through `admitLaunch`, so a paused session holds the retry with the scene in `submitted` (JOS-152).
- **Store locks** (JOS-144 and later): triggers lock `idx`, `prompt`, `run_id`, the interval, the requested duration and the speed factor. `image_instruction` and `video_instruction` stay writable on purpose, for this story and JOS-158. Chunks cannot be deleted.
- **Frontend**:
  - `sceneActions` offers retry and image correction only for `failed` + `affectedStage: "image"`.
  - `SceneRow` shows `scene.instruction` and pre-fills the form from it.
  - The frontend `SceneEventPayload` type has no `prompt`, `imageInstruction` or `videoInstruction`, although the backend sends them.

## Goals / Non-Goals

**Goals:**
- A correction changes exactly `IMAGE` and nothing else, and the next attempt sends it (AC2).
- A retry sends the stored `IMAGE` to the bound provider (AC1, AC4).
- Neither is possible once the image succeeded, and the page never offers it (AC3).
- Every retry and correction acts only within the session named in the URL.

**Non-Goals:**
- Clip retry and correction (JOS-158).
- A history of `IMAGE` versions.
- A length limit.
- Replacing the attempt reset with JOS-184's cycles.

## Decisions

**Decision 1 — Scope every scene command by `(sessionId, sceneId)`.**
Both handlers call `getSceneForRun(sessionId, sceneId)`, the lookup the image route already uses (JOS-151 Decision 2). An unknown session, an unknown scene and a scene of another session all answer **404**, identically, as `consult-session` reports an unknown identifier. A scene that exists but cannot be acted on answers **409**.

*Alternative rejected:* keeping 409 "unknown scene". It reports a lookup miss as a state conflict, and it hides the scoping failure the hand-off pointed at.

**Decision 2 — Refusal reasons become codes.**
409 bodies carry `reason` as one of:

- `not-failed`: the scene is in any state other than `failed`;
- `image-already-generated`: a failed scene with a stored image, meaning its clip failed.

The page maps codes to sentences in one table. The previous free-text reasons are replaced; no consumer parses them.

**Decision 3 — Each command is one conditional write; the store decides, not a prior read.**
- `markScenePendingRetry` becomes `UPDATE scenes SET status = 'submitted', … WHERE id = ? AND run_id = ? AND status = 'failed' AND result IS NULL`, and reports whether it changed a row.
- `correctImageInstruction(sessionId, sceneId, instruction)` does `UPDATE scenes SET image_instruction = ?, status = 'submitted', … WHERE` the same conditions. It touches no other column.

The handler still reads first to choose the refusal code. The write's own `WHERE` is the guarantee: a concurrent double click, or a scene that changed between the read and the write, changes nothing. The second call gets 409 `not-failed`, and the launch happens once. This follows the project's "the store enforces it" pattern (`bindSceneImageProvider`, `scene_results`).

*Alternative rejected:* writing `image_instruction` with a separate setter and then calling `manualRetry`. That is two writes. If the second refuses, the first has already changed `IMAGE` on a scene that is not being retried.

**Decision 4 — The corrected field is the one the scene's image stage reads.**
- A real chunk (non-empty `image_instruction`) has `image_instruction` corrected.
- A skeleton scene (empty `image_instruction`, created by `createScene` in tests and experiments) has its legacy `instruction` corrected, because that is what the stub stage reads.

The signal is the one `launchSceneStage` uses, extracted into one predicate, `hasImageInstruction(scene)`, so the two never disagree. The correction never writes both.

*Alternative rejected:* always writing both fields. That keeps the legacy field in sync for no reader, and makes "only `IMAGE` changes" false in the store.

**Decision 5 — Validate the instruction as non-blank, and store it trimmed. Not `.strict()`.**
The body schema is `{ instruction: z.string().trim().min(1) }`: a blank or whitespace-only instruction answers 400. An extra field is ignored, not rejected — the handler reads only `instruction`, and `consult-session`'s AC1 ("an operation that accepts a body ignores locked fields") is the convention every other chunk-mutating route in this project already follows and tests against (`index`, `prompt`, `narrationInterval`, `requestedDurationSeconds`, `speedFactor` in the correction body are all proven silently ignored, not 400s). A plain (non-strict) Zod object already strips an unknown key before the handler sees it, which is the same practical guarantee `.strict()` would give without a second, incompatible contract on this one route. (The first version of this design called for `.strict()`; implementing task 4.4 against the existing `scene-api-surface.test.ts`/`session-api-surface.test.ts` suite broke four of those already-passing AC1 tests, which is what corrected this decision — see tasks.md group 4.) Registration stores `IMAGE` trimmed (JOS-144), and a correction stores it the same way. No maximum length is set, because PRD §11 records no provider limit. A provider rejection of a too-long instruction is an image failure with its cause shown, and can be corrected again.

**Decision 6 — The retry keeps the existing launch and fresh-budget behaviour, in one place.**
After the conditional write, the handler resets the attempt counter and calls `launchSceneStage`, as today. Tests pin AC1 and AC4 through the HTTP routes:

- the stub image adapter receives the stored `image_instruction`, byte for byte;
- a scene bound to identifier A, with the registry's default changed to B, is sent to A;
- the binding stays A.

The reset stays in `manualRetry` alone, because JOS-184 replaces it with `startNewCycle`.

**Decision 7 — The page shows and edits `IMAGE`, not the legacy field.**
- The frontend `SceneEventPayload` gains `prompt`, `imageInstruction` and `videoInstruction`.
- `SceneRow`'s details show `PROMPT`, `IMAGE` and `VIDEO`.
- The correction form pre-fills `imageInstruction`, falling back to `instruction` for skeleton scenes, by the same rule as Decision 4.
- `sceneActions` is unchanged. AC3 is pinned with a test per state, including `failed` + `affectedStage: "video"`.
- A 409 or 404 answer is shown on the row as the mapped sentence. The scene's new state arrives through the live update.

## Risks / Trade-offs

- **[Overlap with JOS-158]** → JOS-158 adds the clip retry and `VIDEO` correction on the same routes or next to them. The conditional-write and scoping helpers here are written to take the stage as a parameter later, but they are not generalised now.
- **[Overlap with JOS-184]** → JOS-184 replaces the attempt reset. The single call site keeps that a one-line change.
- **[404 instead of 409 for a missing scene]** → This is a contract change. Only the frontend calls these routes, and it shows both as a message.
- **[An old `instruction` and a new `image_instruction` diverge on real chunks]** → That is already true today. The legacy field is not shown for real chunks any more, so the divergence becomes invisible and harmless. Retiring the column belongs to whoever removes the skeleton stage.

## Migration Plan

No migration. Rolling back means reverting the code. Sessions corrected under this change keep their corrected `image_instruction`, which the image stage reads either way.

## Open Questions

None blocking. Whether earlier `IMAGE` versions should be kept for diagnostics (US-34) is left to that story. Nothing in the PRD requires it.
