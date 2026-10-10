## Why

When a scene's clip fails, the current recovery routes refuse retry and correction even though the PRD allows retrying with the same `VIDEO` instruction or correcting only `VIDEO`. This leaves the successfully generated image unusable and blocks final assembly until the user can recover the clip.

## What Changes

- Allow a failed video stage to be retried with its stored `VIDEO` instruction and already-bound video provider, without regenerating its image or changing other scenes.
- Allow the user to correct only `VIDEO` and retry the failed video stage; trim the correction and refuse an empty value.
- Keep recovery scoped to the requested session and scene, conditional on the scene still being failed at the video stage, and hold new provider work while the session is paused.
- Offer retry and video-correction controls only for a failed video stage; continue deriving available actions from the scene's current stage and state.
- Reuse the existing retry/correction endpoints and response shapes; document the video-stage reason codes and behavior. No new endpoint or database column is expected.

## Capabilities

### New Capabilities

- `clip-failure-recovery`: retrying a failed clip with the same input or correcting only `VIDEO`, while preserving the completed image and all unrelated scene/project data.

### Modified Capabilities

- `image-failure-recovery`: clarify that the shared scene recovery routes dispatch by failed stage, retaining image-only guarantees for image failures while permitting the new clip recovery behavior for video failures.
- `frontend-foundation`: extend the stage-derived correction surface to include `VIDEO` correction only when the video stage has failed.

## Impact

- **Backend:** `backend/src/orchestrator.ts`, `backend/src/db.ts`, `backend/src/routes.ts`, and relevant video-stage launch/retry coordination; add focused route, persistence, concurrency, pause, retry-budget, and provider-binding tests. Reuse the existing `video_instruction`, video provider binding, result, and launch-gate behavior; no migration is anticipated.
- **Frontend:** extend `sceneActions()` and its tests, render a correction form for `VIDEO` failures in `SceneRow`, and map any new refusal reasons to user-readable messages.
- **API and documentation:** keep the existing route/body/response shape, update the generated API contract and technical standards as needed, and remove stale documentation that says clip recovery is unavailable.
- **Constraints:** preserve the image result, scene ID, `PROMPT`, `IMAGE`, order, narration interval, requested duration, speed factor, provider binding, and every other scene. Automatic retries remain governed by the existing bounded retry policy.