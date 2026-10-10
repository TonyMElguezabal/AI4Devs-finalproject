# Download individual scene results during processing

Linear-Issue: JOS-163 (US-31)

## Why

§2.2, §5, §12.3, AC10 and AC16 let the User download each successful image and clip on its own, while other scenes are still processing or have failed. On `feature/entrega-2-JAME` (`5498360`) the route `GET /sessions/{sessionId}/scenes/{sceneId}/download/{kind}` is still the walking skeleton's placeholder: it returns a line of stub text, not the stored file, and only once the whole scene is `chunk-complete`. The session page offers both links only for complete scenes. So no real image or clip can be downloaded, and nothing can be downloaded early.

## What Changes

- **The scene download route serves the stored file**, as an attachment:
  - `image`: the stored image, as soon as the scene has one (from `image-complete` on, including while its clip is generating or after its clip failed);
  - `video`: the stored clip, as soon as the scene has one.

  It answers 409 while the result does not exist yet and 404 for an unknown scene or a missing file, confined to the session's project folder like every other read.
- **The session read says which downloads exist**: each scene gains an optional `downloads` object with `imageUrl` and `clipUrl`, each present only when that file is available. The page shows a download link for exactly those, instead of deriving availability from `chunk-complete`.
- **No download for the MP3, the timestamps or the generated texts** (§12.3, AC4): no route and no payload entry exists for them, and tests pin that.

## Capabilities

### New Capabilities

- `scene-result-downloads`: per-scene image and clip downloads, available independently of other scenes and of the scene's own later stages, and the artifacts that are never offered for download.

### Modified Capabilities

None.

## Impact

- **Backend**:
  - `routes.ts`: the download handler streams the file with `Content-Disposition: attachment`, the content type from the stored extension and `Content-Length`; the scene payload schema gains `downloads`.
  - `orchestrator.ts` (`toSnapshot`): fills `downloads` from `scene.result` and `scene.videoResult`.
- **Frontend**:
  - `SceneRow.tsx`: renders the image and clip links from `scene.downloads`; `SceneList.tsx` and `api/client.ts` stop building download URLs themselves.
  - `types.ts`: the scene type gains `downloads`.
- **API contract**: `docs/api-spec.yml` regenerated: the download route's 200 response becomes binary (`image/png`, `image/jpeg`, `video/mp4`), and the scene object gains `downloads`. Additive for clients.
- **Depends on**: US-12 (JOS-145), US-13 (JOS-146), US-19 (JOS-151), merged. US-30 (JOS-162) is proposed; this change does not need its new files.
- **Out of scope**: playing the clip inline on the page (the payload never sets `result.videoUrl` today); downloading several results at once.
