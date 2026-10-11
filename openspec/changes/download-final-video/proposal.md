# Download the final video

Linear-Issue: JOS-164 (US-32)

## Why

§5 step 10, §12.3 and AC12 let the User download the final MP4 once it is complete, and only then. Checked on `feature/entrega-2-JAME` (`5498360`), the behaviour is already there: `GET /sessions/{sessionId}/download/final-video` streams the stored file as an attachment and refuses with 409 until it exists, the session read carries `finalVideoUrl` once it does, and the page shows the link only at `final-video`. What is missing is the proof and the contract:

- **AC1 is untested.** No test ever downloads the file. The existing tests check the payload field and the 409 and 404 refusals, so nothing would catch a broken stream, a wrong content type or a missing attachment header.
- **The published contract is wrong.** The generated `docs/api-spec.yml` declares the 200 response as `application/json` with no type, while the route sends `video/mp4` bytes. A client reading the contract would expect JSON.
- **Availability is decided in two places.** The route decides from the stored final-video path; the page decides from the session state and rebuilds the URL itself, ignoring the `finalVideoUrl` the read already offers. They agree today only because a final video is written only while the assembly gate is open, which is an invariant kept by coincidence across two modules.

## What Changes

- **The route declares its real response type**, so the generated contract shows `video/mp4` binary for the 200 instead of JSON. No behaviour change on the wire.
- **The page renders the `finalVideoUrl` the session read offers** instead of rebuilding the URL and re-deriving availability from the state. The server becomes the only place that decides whether the download exists.
- **Tests, one per acceptance criterion**:
  - AC1: a session at `final-video` downloads the stored MP4 with its bytes, `video/mp4`, `Content-Disposition: attachment` and `Content-Length`;
  - AC2: the route refuses with 409 before the final video exists, and the page offers no link in every earlier state and while failed.

## Capabilities

### New Capabilities

- `final-video-download`: the gated download of the assembled MP4, and what the session read offers for it.

### Modified Capabilities

None.

## Impact

- **Backend**: `routes.ts` — the final-video route's 200 response schema declares `video/mp4` binary. The handler, its status codes and its headers stay as they are.
- **Frontend**: `FinalVideoDownload.tsx` takes the offered URL and renders nothing without one; `SessionPage.tsx` passes `session.finalVideoUrl`; `downloadFinalVideoUrl` is removed from `api/client.ts`.
- **API contract**: `docs/api-spec.yml` regenerated. The 200 response of the final-video download changes from `application/json` to `video/mp4` binary, which corrects the document to match what the server has always sent.
- **Depends on**: US-16 (JOS-149), merged.
- **Coordination**: `download-scene-results` (JOS-163, proposed) makes the same change for per-scene downloads, in the same two files. Whichever lands first, the other rebases; the two are independent in behaviour.
- **Out of scope**: naming the downloaded file after the project title (see design Decision 3); range requests and resumable downloads; downloading the MP3, timestamps or generated texts, which §12.3 keeps local.
