## Context

The final-video route (`routes.ts`) sets `Content-Disposition: attachment; filename="final-video.mp4"` as a literal. The title is already on the run (`getRun(...).title`), is immutable once the session is registered (content-lock), and is arbitrary User text: any Unicode, quotes, slashes, newlines, any length.

Two things are already known:

- Node refuses a header value with characters outside Latin-1 (`ERR_INVALID_CHAR`) and CR/LF. Putting the raw title in the header would turn a non-ASCII title into a 500 and a title with a quote or newline into a broken or injected header.
- `db.ts` has a private `sanitizeForFilesystem` for the project folder name (`/\:*?"<>|` to `_`). It is too weak for a header (no control characters, no length cap, no non-ASCII handling) and changing it would rename project folders, so it is not reused.

The app is distributed on macOS and Windows, so the saved name must also be legal on Windows.

## Goals / Non-Goals

**Goals:**
- A downloaded final video is named after its project's title, readable in any language.
- The header can never be malformed or injected through the title.
- One rule, one function, easy to test in isolation.

**Non-Goals:**
- Renaming per-scene downloads, the stored file, or the project folder.
- Preventing two projects from downloading under the same name.

## Decisions

**Decision 1: A single pure function derives the name; a second builds the header.**
`downloadFilename(title: string): string` returns the sanitised base name plus `.mp4`; `contentDisposition(filename: string): string` returns the header value. Both live in `backend/src/util/downloadFilename.ts`, with no I/O, so every edge case is a one-line unit test. The route calls `contentDisposition(downloadFilename(run.title))`.

**Decision 2: The sanitising rule, in order.**
1. Replace any lone surrogate with U+FFFD (`encodeURIComponent` throws on one, and JSON can carry it), then normalise to Unicode NFC (an accent typed as two code points and as one must give one name).
2. Replace every control character (C0, DEL, C1) and every one of `/ \ : * ? " < > |` with `_`.
3. Collapse runs of whitespace to a single space and trim.
4. Strip leading dots (no hidden file) and trailing dots and spaces (Windows drops them silently).
5. If the result, compared case-insensitively and ignoring any extension, is a Windows reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`), prefix `_`.
6. Cap at 100 Unicode code points, cutting on a code-point boundary (never inside a surrogate pair), then re-apply step 4's trim.
7. If nothing is left, use `final-video`.
8. Append `.mp4`.

*Why replace rather than drop:* `a/b` becoming `a_b` keeps the title recognisable and matches what `sanitizeForFilesystem` already does for the folder.
*Why 100:* well under the 255-byte filesystem limit even at 4 bytes per code point after percent-encoding concerns are set aside, and long enough for any real title.

**Decision 3: The header carries an ASCII fallback and an RFC 5987 `filename*`.**
`attachment; filename="<ascii>"; filename*=UTF-8''<percent-encoded>`. The fallback is the name with every non-ASCII code point replaced by `_` and `%` and `\` also replaced, so it is always a plain quoted string. The `filename*` value is `encodeURIComponent` of the full name with the characters it leaves unescaped but RFC 5987 forbids (`' ( ) *`) escaped as well. Browsers that understand `filename*` (all current ones) save the real name; the fallback exists for clients that do not. Because step 2 already removed quotes and control characters, neither parameter can be broken out of.

*Alternative rejected:* ASCII-only names (transliteration). It destroys non-Latin titles, and the Users here write in several languages.

**Decision 4: Per-scene downloads stay as they are.**
Their names (`scene-<index>-image.<ext>`, `scene-<index>-clip.mp4`) are index-based and fixed by the server, so they carry no User text and no injection surface. Adding the title would repeat Decision 2 on a second route for no gain, since the index already distinguishes them. The `scene-result-downloads` spec is untouched.

**Decision 5: Collisions are left to the browser.**
Distinct titles can sanitise to the same string (`a/b` and `a:b`), and identical titles are allowed. A download name is not an identifier; the browser appends `(1)` as it does for `final-video.mp4` today. Making names unique would need the project folder's timestamp in the name, which the product owner did not ask for.

*Alternative rejected:* naming the file after the project folder (`<title> <YYYY-MM-DD HH-mm>`), which is unique by construction. It is longer and noisier, and the request was the title.

## Risks / Trade-offs

- **[A title consisting only of separators becomes `______.mp4`]** → Acceptable and safe; it is the User's own title. Only a title that is empty after trimming falls back to `final-video`.
- **[Truncation at 100 code points can cut a grapheme cluster, such as an emoji with a skin-tone modifier]** → The result is still valid, just a slightly odd name for an extreme title. Segmenting graphemes is not worth a dependency.
- **[A client that ignores `filename*` shows underscores for non-ASCII letters]** → Only the fallback path; all current browsers honour `filename*`.
- **[The rule is a policy others may want changed]** → It is one function with a table of tests; changing it is local.
