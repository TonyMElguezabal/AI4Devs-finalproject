# Retry or correct the image instruction after an image failure

Linear-Issue: JOS-157 (US-25)

## Why

§10.3 gives a scene whose image failed exactly two ways forward: retry with the same `IMAGE` instruction, or correct only `IMAGE` and retry. §3 makes `IMAGE` the only chunk field the User may edit, and only after its image failed (AC09). The retry and correction routes already exist from the skeleton, and the scene row already offers both on an image failure (JOS-151). The JOS-145 and JOS-144 hand-offs on this ticket found gaps. Re-checked on `feature/entrega-2-JAME` (`ecfe430`), three remain:

- **A correction does not change `IMAGE` (AC2).**
  - `correctAndRetry` writes the skeleton's legacy `scenes.instruction`.
  - The real image stage reads `scenes.image_instruction`.
  - So a corrected retry sends the *old* instruction, and the two fields drift apart.
  - The correction form also shows and pre-fills the legacy field, not `IMAGE`.
- **Retry and correction ignore the session in the URL.** Both routes act on `:sceneId` alone. A scene can be retried or edited through another session's URL, against §12.3 and AC22's rule that a session only acts on its own chunks.
- **No guarantee that only `IMAGE` changes.** `VIDEO` is deliberately writable, because JOS-158 corrects it, so nothing in the store stops a correction path from touching it. A blank correction is also accepted as long as it has one character.

The first hand-off gap, retries going to the stub instead of the real image stage, was fixed by the dispatch to `launchImageStage` (`launchSceneStage`). This change pins that with tests instead of re-fixing it.

## What Changes

- **A correction writes `IMAGE` and nothing else**:
  - `POST /sessions/:sessionId/scenes/:sceneId/correct` updates `image_instruction` and returns the scene to `submitted` for its retry, in one conditional write that applies only while the scene is `failed` at the image stage.
  - `ID`, `PROMPT`, `VIDEO`, the narration interval, the requested duration, the speed factor and the order are untouched (AC2).
  - The instruction is trimmed. A blank or whitespace-only instruction answers 400.
  - Skeleton scenes created without an `IMAGE` keep correcting their legacy `instruction`, using the same "has an `IMAGE` instruction" signal `launchSceneStage` uses.
- **A retry resends the same `IMAGE` to the same provider (AC1, AC4)**:
  - `POST /sessions/:sessionId/scenes/:sceneId/retry` returns the scene to `submitted`, with a conditional write on `failed` at the image stage, then launches the real image stage.
  - The stage sends the stored `image_instruction` unchanged, to the provider bound on the scene's first image attempt, and never rebinds it (§11.2).
  - The existing behaviour is pinned by tests through the routes.
- **Both routes are scoped by session**: the scene is looked up by `(sessionId, sceneId)`. A scene of another session answers 404, as an unknown scene does. A refusal (the scene not failed, or failed at the clip stage) answers 409 with a reason code.
- **No image action on a scene whose image succeeded (AC3)**: the backend refuses retry and correction for a scene in any state other than `failed` with no stored image, including a clip failure after a successful image. The page already shows neither action then (`sceneActions`, JOS-151), and tests pin it for every state.
- **The page edits `IMAGE`**:
  - The scene details show the chunk's `IMAGE` and `VIDEO` instructions.
  - The correction form pre-fills `IMAGE`.
  - The frontend types gain `prompt`, `imageInstruction` and `videoInstruction`, which the backend already sends.

## Capabilities

### New Capabilities

- `image-failure-recovery`: retrying a scene's failed image, or correcting only its `IMAGE` instruction and retrying. It covers:
  - when each is allowed and how refusals are reported;
  - the same-instruction, same-provider guarantee of a retry;
  - the only-`IMAGE`-changes guarantee of a correction;
  - session scoping;
  - what the page offers and shows.

### Modified Capabilities

None in `openspec/specs/`. `scene-detail-view` (JOS-151) and `image-generation` (JOS-145) are not archived. This change is consistent with both: it uses `sceneActions` and the image stage as they are, and adds no state.

## Impact

- **Backend**:
  - `orchestrator.ts`: `manualRetry` and `correctAndRetry` take `sessionId`; one conditional write for each.
  - `db.ts`: a scoped, conditional `correctImageInstruction`; `markScenePendingRetry` made conditional.
  - `routes.ts`: 404 for an out-of-session scene, the trimmed non-blank body, and reason codes on 409.
  - No migration.
- **Frontend**: `types.ts` (instruction fields), `SceneRow.tsx` (shows and pre-fills `IMAGE`, shows `VIDEO`), and `App.tsx` and `api/client.ts` if the 404 and 409 handling needs a message.
- **API contract**: `docs/api-spec.yml`, for the 404 response, the reason codes and the body constraint.
- **Depends on**: nothing unmerged. The real image stage (JOS-145) and `sceneActions` (JOS-151) are on `feature/entrega-2-JAME`.
- **`bounded-retry-policy` (JOS-184, US-22)**: the manual retry today opens a fresh budget by resetting the scene's attempt counter. JOS-184 replaces that reset with `startNewCycle` for every stage, as its proposal states. This change keeps the reset in one place so the swap touches one line.
- **Relationship to JOS-158 (US-26, clip retry and correction)**: it mirrors this change for the clip stage and `VIDEO`. The conditional writes and route scoping here are the pattern it reuses.
- **Out of scope**:
  - keeping a history of earlier `IMAGE` versions;
  - a length limit on `IMAGE` (no provider limit is recorded in PRD §11);
  - clip retry and correction (JOS-158);
  - changing the image provider (§11.2).
