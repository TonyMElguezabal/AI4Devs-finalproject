# Design — View per-scene status and results

## Context

Current state on `feature/entrega-2-JAME`:

- **Ordering and live state already exist.** `SceneList.tsx` sorts by `index` on every render, with a test for out-of-order input. `useLiveSession` holds the one SSE subscription and replaces the snapshot on every event, with its own tests. `SceneRow.tsx` prints `#{index} — {state}`.
- **Results are stored but not reachable.** The real image stage (JOS-145) stores `scenes.result` as a relative path inside the session's project folder (`scene-<idx>-attempt-<n>.png|.jpg`). `sceneToPayload` copies that path into `result.imageUrl` unchanged. The only per-scene route, `.../download/:kind`, returns a stub text body, and only at `chunk-complete`. The skeleton's own generic scenes store a stub text file named `scene-<idx>.png`, or a bare provider string when the run has no project folder.
- **Failure display ignores the stage.** `affectedStage` is in the payload, always `"image"` for a failed scene until JOS-146, and is never rendered. The retry button and image-correction form appear for any `failed` scene.
- **Writes already have a path guard.** `assertWithinProjectFolder` (`db.ts`, private) resolves a relative path inside `PROJECTS_ROOT/<projectFolder>` and refuses anything outside. Reads have no equivalent.

## Goals / Non-Goals

**Goals:**
- A stored image is viewable through the API, safely: scoped to its session, confined to its folder, read-only.
- The scene-details panel shows whatever results exist and, for a failed scene, the stage and only the actions the backend will accept.
- AC1 and AC2 are proven by tests, not assumed.

**Non-Goals:**
- Downloads with `Content-Disposition`, and the "no MP3, timestamps or texts" rule (US-31).
- Serving clips (JOS-146 adds the clip file, its route and `videoUrl`).
- Clip retry and correction (JOS-158).
- The session-level failed-scene rule (JOS-150's change).

## Decisions

**Decision 1 — A separate read-only image route, not a fix to the download route.**
`GET /sessions/:sessionId/scenes/:sceneId/image` streams the stored file inline. Viewing and downloading are different stories with different rules:

- viewing needs the image as soon as it is stored, in any later state;
- downloading (US-31) adds attachment semantics and an artefact allow-list.

US-31 can build its image download on top of this resource. Rewriting the download route here would take over US-31's scope and its acceptance criteria.
*Alternative rejected:* serving files statically from `PROJECTS_ROOT`. That would expose every session's folder by path and skip the `(session, scene)` scoping `consult-session` established (its Decision 2).

**Decision 2 — Reuse the write-side guard for reads; scope the lookup first.**
The route calls `getSceneForRun(sessionId, sceneId)`, which returns nothing for a scene of another session, so the answer is 404. It then resolves `scene.result` through the same guard writes use, exported as `resolveArtefactPath` (already public, and a thin wrapper over the private guard). A path outside the folder throws, and the route answers 404 without reading the file. The content type comes from the extension (`.png` → `image/png`, `.jpg`/`.jpeg` → `image/jpeg`). Anything else answers 404, so a skeleton stub with an unrecognised name never goes out as an image. A missing file also answers 404.
*Alternative rejected:* trusting `scene.result` because the system wrote it. The stored path is data. The guard costs nothing and closes a traversal if a bad value is ever stored.

**Decision 3 — `result.imageUrl` is the route path, relative to the API base.**
`sceneToPayload` emits `/sessions/{sessionId}/scenes/{sceneId}/image` whenever `scene.result` is set, and the frontend prefixes `API_BASE`, as `downloadSceneUrl` already does. The raw file path leaves the payload, because it was never a URL. Nothing outside two frontend test fixtures reads it. A relative path keeps the backend free of its own public origin.
*Alternative rejected:* keeping `imageUrl` as the file path and building the URL in the frontend. That would spread the route's shape across both sides and keep a misleading field name.

**Decision 4 — Actions derive from `(state, affectedStage)` in one frontend helper.**
`sceneActions(scene)` returns `{ retry, correctImage }`:

- both true only for `state === "failed"` and `affectedStage === "image"`;
- both false otherwise, including a `video` failure, until JOS-158 adds clip actions to the same helper.

This keeps `frontend-foundation`'s rule ("presence derived from stage state, never from a stored flag") and makes the one place JOS-158 extends obvious.
*Alternative rejected:* a backend-provided `actions` list. It would be more central, but the frontend-stack decision derives presence from state on the client, and adding an action vocabulary to the wire contract is a broader change than this story needs.

**Decision 5 — Results render in the details panel; the summary line stays text.**
The image (`alt="Scene N image"`) and the clip (`<video controls>`, labelled "Scene N clip") appear inside the expanded details, so a long scene list stays compact. Accessible names follow the existing naming convention.

## Risks / Trade-offs

- **Skeleton scenes can carry a stub `result`** that is not an image. → Decision 2 answers 404 for unrecognised or missing files. `imageUrl` may still point at a 404 for those test-only scenes, and the `<img>` simply fails to load. Real image-stage scenes always store a recognised extension.
- **Large images stream through Node.** → Streamed (`createReadStream`), never buffered. Real images are around 1920×1088, a few MB at most.
- **Changing `imageUrl`'s meaning** could surprise a consumer. → Only two frontend fixtures set it, and both are updated. No backend test asserts its value (checked while proposing).

## Migration Plan

No schema change. A new route, a payload field's value now formed as a URL, and frontend rendering. Rollback is reverting the change.

## Open Questions

1. **Thumbnail size or full image?** This design shows the stored image scaled by CSS within the details panel. A separate thumbnail size is not needed at MVP scale.
