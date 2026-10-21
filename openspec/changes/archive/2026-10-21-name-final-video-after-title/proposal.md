# Name the downloaded final video after the project title

Linear-Issue: JOS-193

## Why

`GET /sessions/{sessionId}/download/final-video` always serves the attachment as `final-video.mp4`. Several projects' downloads land in the same Downloads folder as `final-video.mp4`, `final-video(1).mp4` and so on, indistinguishable from one another. The product owner confirmed on 2026-10-10 that the file should be named after the project title.

`download-final-video` (JOS-164, Decision 3) left this out on purpose: a User-supplied title placed inside the `Content-Disposition` header needs a sanitising rule, which is a product and security decision. This change makes it.

## What Changes

- **The final-video download is named `<sanitised title>.mp4`** instead of `final-video.mp4`. The rule lives in one pure function and is documented in the spec: control characters, path separators and the characters Windows forbids are replaced; whitespace is collapsed; leading and trailing dots and spaces are dropped; Windows reserved device names are escaped; the name is capped in length; an empty result falls back to `final-video`.
- **The header carries both an ASCII `filename` and an RFC 5987 `filename*`**, so a non-ASCII title (accents, CJK, emoji) survives in the saved name while the header stays valid ASCII and cannot be broken out of by a quote or newline in the title.
- **Per-scene downloads keep their names** (`scene-<index>-image.<ext>`, `scene-<index>-clip.mp4`). The index is what tells scene files apart; the title would add nothing and would reopen the sanitising surface on a second route. Recorded as a decision, not left open.
- **Collisions are not prevented.** Two projects whose titles sanitise to the same name download under the same name and the browser disambiguates with `(1)`, exactly as it does today. A filename is not an identifier, and titles were never unique.
- **Tests**: the sanitising rule's edge cases as unit tests, plus the `Content-Disposition` header end to end through the HTTP surface.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `final-video-download`: the attachment's filename is derived from the project title under a defined sanitising rule, instead of the fixed `final-video.mp4`.

## Impact

- **Backend**: a new pure helper in `backend/src/util/` for the filename and its header value; `routes.ts` — the final-video route builds `Content-Disposition` with it. Status codes, content type, length and streamed bytes are unchanged.
- **Frontend**: none. The page links to the route; the browser takes the name from the header.
- **API contract**: `docs/api-spec.yml` regenerated; the 200 response documents the `Content-Disposition` header and its naming rule.
- **Depends on**: JOS-164 (`download-final-video`), merged and archived.
- **Out of scope**: renaming per-scene downloads; renaming the stored `final-video.mp4` inside the project folder (§12.2 already names the folder after the title); making titles unique.
