## Why

During a run, the project panel only says how many scenes are done (JOS-234). To know which scenes are generating an image, which have an image and wait for a clip slot, and which are generating a clip, the User has to scan every scene card. On a long script (60+ scenes) that is slow and error-prone, and it hides whether the run is moving.

## What Changes

- The project panel shows a read-only scene progress summary under the existing `Scenes done` bar, once the session has scenes:
  - Done (N of total), Queued for image, Generating image, Image ready (waiting for a clip slot), Generating clip, Failed (split into image and clip), Images left and Clips left.
  - Generating image, Image ready, Generating clip and Failed list their scene numbers, ascending, with consecutive numbers compressed into ranges (`3–9, 12`).
  - Lines with a zero count are hidden, except Done.
- The summary updates live with the existing session stream, with no polling or reload.
- Everything is derived in the frontend from each scene's `state`, `index` and `affectedStage`, which the page already receives. No endpoint, field or column changes.
- The existing `Scenes done` progress bar and its "N of total" text stay unchanged.

## Capabilities

### New Capabilities
- `scene-progress-summary`: the project panel's read-only summary of how many scenes are in each stage and which scene numbers are in progress or failed.

### Modified Capabilities
<!-- None: no existing requirement changes; the session read and the scene cards are unchanged. -->

## Impact

- Frontend: new `frontend/src/sceneProgress.ts` (pure derivation and range formatting), new `frontend/src/components/SceneProgressSummary.tsx`, `frontend/src/components/SessionPage.tsx` (mounts it), `frontend/src/styles/app.css`.
- Tests: new `frontend/test/scene-progress.test.ts`, additions to `frontend/test/components.test.tsx`.
- Docs: `docs/frontend-standards.md` (naming table, layout, derivation rule), `readme.md` if it lists the panel's contents.
- Backend, API contract (`docs/api-spec.yml`) and data model: unchanged.
