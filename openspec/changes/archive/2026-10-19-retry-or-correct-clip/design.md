## Context

The existing scene retry and correction routes are session-scoped and already serve image recovery. `manualRetry` and `correctAndRetry` currently reject any failed scene with a stored image, because image success is stored in `scenes.result`; a failed clip therefore has no recovery path. The video stage already starts only from `image-complete`, reads `video_instruction`, retains the video provider binding, and is admitted through the session launch gate. The completed image is independently stored and must remain intact.

This change spans backend persistence and orchestration, the existing API routes, the scene action derivation and correction form, and their contracts and tests. It builds on the image recovery pattern without creating a second recovery API.

## Goals / Non-Goals

**Goals:**

- Dispatch the existing retry and correction commands to the failed visual stage, based on persisted scene state.
- Retry video with the existing `VIDEO` value and bound provider, or trim and store a nonblank corrected `VIDEO` value before retrying.
- Preserve the completed image and all locked scene/project content; prevent duplicate concurrent launches with conditional writes.
- Keep pause, retry-budget, provider-binding, result-commit, and live-update behavior consistent with the existing video stage and retry policy.
- Offer stage-appropriate controls and readable refusal messages in the UI.

**Non-Goals:**

- Adding endpoints, request fields, stored history of prior `VIDEO` instructions, migrations, provider switching, or a way to regenerate the image from a clip failure.
- Changing automatic retry classification, retry limits, clip generation parameters, or final assembly behavior.
- Editing `ID`, `PROMPT`, `IMAGE`, scene order, narration intervals, requested duration, speed factor, or another scene during clip recovery.

## Decisions

### 1. Reuse the existing scene retry and correction routes

Dispatch by the failed scene's affected stage: an image failure continues through image recovery; a video failure uses clip recovery. Do not accept a stage selector from the client, since stage ownership is derived from stored state and a client-provided selector could disagree with it. Preserve the current session-and-scene lookup and 404 behavior for unknown or cross-session scenes.

*Alternative considered:* add `/video/retry` and `/video/correct` routes. Rejected because the project already has stage-neutral scene recovery routes, and duplicating them would multiply validation, scoping, OpenAPI, and concurrency logic.

### 2. Use video-specific conditional persistence transitions

Add narrowly scoped store operations that succeed only when the requested session owns the scene, the scene is `failed`, the image result exists, and no video result has been committed. A plain retry changes the status back to `image-complete`; correction trims and writes only `video_instruction` and changes status to `image-complete` in the same conditional write. A lost race returns the existing state-conflict refusal and must not launch work. Do not route a clip retry through the image transition to `submitted`.

This makes `image-complete` the existing video launcher's input state. After the write succeeds, call the video-stage launcher; its normal launch gate holds the work when the session is paused. Then publish the current session snapshot even when the gate holds the work, so the connected page observes the accepted transition to held `image-complete` state instead of retaining a stale failed row. Reset/start the manual video retry budget through the retry mechanism already authoritative in the implementation, without clearing earlier attempt history or the bound provider.

*Alternative considered:* change `video_instruction` and then separately change scene status. Rejected because an intervening launch or competing recovery command could observe a partially applied correction.

### 3. Reuse the existing video execution and success path

The retried attempt reads the stored (or newly corrected) `video_instruction`, resolves the provider already bound to that scene, uses its recorded duration and existing concurrency slot, and follows normal automatic retry, result validation, idempotent commit, and assembly-gate behavior. A successful clip moves the scene to `chunk-complete`; the existing image result and every other scene remain unchanged. Manual retry remains available for a failed clip even if its automatic failure was classified not-retryable, matching the existing scene image-recovery behavior; that classification still suppresses automatic retries.

*Alternative considered:* re-run image generation before each clip attempt. Rejected because the image is already a successful prior-stage result and PRD §10.2 requires retrying only the failed stage.

### 4. Derive frontend controls from stage and state

Extend `sceneActions(scene)` as the single source for action visibility. A failed image offers image retry/correction; a failed video offers clip retry/`VIDEO` correction; all other states offer neither. Keep separate stage-appropriate labels and draft values in `SceneRow`, submit through the existing callbacks, and map refusal codes to user-readable sentences rather than displaying raw codes. Successful state changes continue to arrive through the live snapshot.

*Alternative considered:* render controls for every failed scene and rely on backend refusals. Rejected because the page must not offer actions the backend cannot accept, and the existing frontend standards require stage-derived actions.

### 5. Keep the wire shape and generated API contract stable

The existing retry route remains a bodyless POST and correction remains `{ instruction }`; success and refusal response shapes are unchanged. Update the generated API contract/documentation for the broadened stage behavior and any new refusal reason, following the backend rule that OpenAPI is generated from route schemas. No database migration or dependency is expected because `video_instruction`, `video_result`, and video provider binding already exist.

## Risks / Trade-offs

- **A clip recovery command could accidentally relaunch image generation** → use the conditional transition to `image-complete`, dispatch on stored failed-stage data, and test that the image provider is never called.
- **Two simultaneous retry/correction requests could schedule duplicate video attempts** → make the stage transition conditional and test that only one command wins and launches.
- **A correction could alter locked narrative or image data** → update only `video_instruction` and status in the store operation; assert all unrelated fields and other scenes are unchanged.
- **A paused session could send a provider call prematurely** → launch through the existing gate and verify that held video work starts only after continue.
- **The shared endpoint could retain image-only refusal text or the UI could show the wrong correction value** → update reason mapping, generated contract, and accessible labels; cover both image and video failures in route and component tests.

## Migration Plan

No schema migration is planned. Deploy the backend changes with the existing data model, then the frontend changes. Rollback is a code rollback; persisted `video_instruction` remains compatible and no stored records need transformation. A correction already accepted before rollback remains a valid instruction for the existing video stage.

## Open Questions

None. The requirements follow PRD §10.2–§10.3 and the established image-recovery behavior where the PRD does not specify a separate clip rule.