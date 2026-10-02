# View per-scene status and results

Linear-Issue: JOS-151 (US-19)

## Why

The session page already lists scenes in ascending order and updates each scene's state live. Those parts of US-19 (AC1, AC2) landed with the frontend stack (JOS-180), `consult-session` (JOS-135) and the live-update seam (JOS-183). Two parts are still missing, and one existing rule is about to be broken:

- **A stored result cannot be seen (AC3).** The real image stage (JOS-145) writes each scene's image into the session's project folder. The session read exposes it only as `result.imageUrl` holding the raw project-relative file path, which is not a URL, and no route serves the file. The only per-scene route returns stub text, and only at `chunk-complete`.
- **A failed scene does not show which stage failed (AC4).** The payload carries `affectedStage`, but nothing renders it.
- **Actions ignore the failed stage.** The image correction form and the retry button appear on every failed scene. The `frontend-foundation` spec requires a stage's correction form only when *that* stage failed, and JOS-146 refuses manual retry and correction after a clip failure until JOS-158. Once clip failures exist, the page would offer actions the backend rejects.

## What Changes

- **View a scene's image**: a new read-only route, `GET /sessions/:sessionId/scenes/:sceneId/image`, serves the scene's stored image inline (`image/png` or `image/jpeg` by extension). The lookup is scoped by session and scene. The file path is resolved inside the session's project folder, and a path that resolves outside it is refused. A scene without a stored image answers 404.
- **`result.imageUrl` becomes a real URL**: it points at that route, relative to the API base, and is present exactly when the scene has a stored image. That covers `image-complete`, `video-generating`, `chunk-complete`, and a `failed` scene whose image was stored before its clip failed (AC3). No consumer reads the old raw-path value; the frontend only sets it in two test fixtures.
- **Show results in scene details**: the scene-details panel shows the image when `imageUrl` is present, and the clip in a video player when `videoUrl` is present. JOS-146 fills `videoUrl` along with its clip route; until then the player simply never renders.
- **Show the failed stage and only the applicable actions**: a failed scene's details show the error and the affected stage (AC4). Actions derive from the affected stage:
  - an image failure offers retry and the image-instruction correction, as today;
  - a clip failure offers nothing until JOS-158 adds clip retry and correction, matching the backend's 409.
- **Pin down what already works**: tests map AC1 (order) and AC2 (live state without reload) to the existing tests, adding one only where a scenario has none.

## Capabilities

### New Capabilities

- `scene-detail-view`: what the session page shows for each scene. Covers its state, its stored image and clip, and for a failed scene the error, the affected stage, and the actions that apply to that stage. Also covers the read-only route that serves a scene's stored image.

### Modified Capabilities

(none). `frontend-foundation`'s "Editing surface derived from stage state" is satisfied more strictly, not changed. `consult-session`'s `session-consultation` capability is not yet archived into `openspec/specs/`, so there is nothing to modify there.

## Impact

- **Backend**:
  - `routes.ts` gets the image route, which reuses `getSceneForRun` and the project-folder path guard already used for writes; the guard is exported as a read helper.
  - `orchestrator.ts`'s `sceneToPayload` builds `imageUrl` from the scene's identifiers instead of copying the path.
  - No migration and no session-state change.
- **Frontend**: `SceneRow.tsx` (image, clip player, affected stage, stage-scoped actions) and `api/client.ts` (resolving result URLs against `API_BASE`).
- **Depends on**: nothing unmerged. JOS-145's stored image is on `feature/entrega-2-JAME`. `affectedStage` is today always `"image"` for a failed scene (skeleton); JOS-146 makes it accurate, and this change renders whatever the payload says.
- **Relationship to other open changes**:
  - The session-level rule for failed scenes, which `bounded-retry-policy` suggested US-19 own, is already in JOS-150's change (`gate-assembly-on-complete-scenes`), whose own AC5 covers it. It is not repeated here.
  - Downloads stay with US-31 (JOS-163). Its existing route still serves stub text at `chunk-complete`. US-31 can build its image download on this route.
- **Out of scope**:
  - clip serving and `videoUrl` (JOS-146);
  - clip retry and correction (JOS-158);
  - provider and attempts per stage (US-34, JOS-166);
  - the narration interval in scene details (no ticket asks for it yet).
