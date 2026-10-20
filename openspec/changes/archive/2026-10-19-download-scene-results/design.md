# Design — Download individual scene results during processing

## Context

On `feature/entrega-2-JAME` (`5498360`):

- **Download route** (`routes.ts`): `GET /sessions/:sessionId/scenes/:sceneId/download/:kind`, `kind` in `image | video`, scoped by `getSceneForRun`. It returns 409 unless the scene is `chunk-complete`, and then returns `text/plain` stub text. Its own comment calls it the skeleton's simplification of one combined stage.
- **Stored results**: `scenes.result` holds the image's relative path from the moment the image commits (`image-complete`, and it stays set through `video-generating`, `chunk-complete`, and a later clip failure). `scenes.video_result` holds the clip's path once the clip commits (`chunk-complete`).
- **Existing file-serving patterns**: `GET .../image` streams the stored image inline, behind `resolveArtefactPath` and existence checks, with content type from `IMAGE_CONTENT_TYPES`. `GET /sessions/:id/download/final-video` streams with `Content-Disposition: attachment` and `Content-Length`.
- **Session read**: each scene has `result.imageUrl` (the inline image route) when an image exists, and nothing for the clip.
- **Page** (`SceneRow.tsx`): shows both download links only when `state === "chunk-complete"`, with URLs built in `api/client.ts`.
- **API contract**: `docs/api-spec.yml` is generated from the running server's `/docs/json`.

## Goals / Non-Goals

**Goals:**
- Real image and clip downloads, each available from the moment its file exists (AC1, AC2).
- Independence from every other scene's state (AC3).
- No download offered for the MP3, timestamps or generated texts (AC4).

**Non-Goals:**
- Inline clip playback.
- Bulk download.
- Changing the inline image route.

## Decisions

**Decision 1 — Availability is "the file exists", not a scene state.**
`image` is available when `scenes.result` is set, and `video` when `scenes.video_result` is set. This covers every state the ticket names (processing, the scene's own clip generating, other scenes failed, the scene's own clip failed) without listing states, and it cannot drift from what was actually committed. A set reference whose file is missing on disk answers 404, the same as the inline image route.

*Alternative rejected:* listing the states in which each download is allowed. It duplicates the store's own record of what exists, and a new state would need updating in two places.

**Decision 2 — One handler serves both kinds, reusing the final-video download pattern.**
The handler resolves the stored path through `resolveArtefactPath` (project-folder confinement), checks it is a file, and streams it with:

- `Content-Disposition: attachment; filename="scene-<index>-image.<ext>"` or `"scene-<index>-clip.mp4"`;
- `Content-Length`;
- the content type from the extension (`IMAGE_CONTENT_TYPES`, plus `.mp4` → `video/mp4`).

An extension with no known type answers 404 "no stored <kind>", as the inline route does. 409 keeps its meaning: the result does not exist yet. The route, its parameters and its scoping stay the same.

**Decision 3 — The session read carries the download URLs; the page does not derive them.**
Each scene gains an optional `downloads: { imageUrl?, clipUrl? }`, built in `toSnapshot` next to `result.imageUrl`, as paths relative to the API base. `SceneRow` renders a link per present entry, through `resolveResultUrl` like the image. `downloadSceneUrl` is removed from the client. The server is then the only place that decides availability, and the page cannot offer a link the route would refuse.

*Alternative rejected:* computing availability on the page from `state`. That is today's bug, because state does not say whether the image exists.

**Decision 4 — AC4 is held by construction and pinned by tests.**
`kind` stays `z.enum(["image", "video"])`, so `voice-over`, `timestamps` and `texts` answer 400. `downloads` has no field for them, and the page renders none. The tests assert all three. No code is needed for AC4.

## Risks / Trade-offs

- **[Skeleton stub scenes]** → Scenes made by the old `createScene` stub path store a text file as `scene-N.png`. Its download would be served as `image/png` with text content. Those scenes exist only in tests and old skeleton data; real chunks store real images.
- **[Payload grows per scene]** → Two short optional strings per scene, only when files exist.
- **[Clients that built URLs themselves]** → Only this frontend did; the route's URL shape is unchanged, so an old link still works.

## Migration Plan

No migration. Existing scenes with stored files become downloadable immediately.

## Open Questions

None.
