# Step 5 report — manual endpoint testing (JOS-271, detect-blocked-media-tools)

Date: 2026-11-09. Executed by the agent against a real backend process.

## Setup

- Backend started with `node src/server.ts` on port **3199** (the live app on 3100 was not used and stayed untouched).
- Literal environment values: `PORT=3199`, `DB_PATH` and `PROJECTS_ROOT` in a scratch folder, `SECRETS_PATH` pointing at a file that does not exist (no provider key, so nothing can be billed), `USE_STUB_SCRIPT_MODERATION=clean`, `FFMPEG_PATH` = a working `ffmpeg` with libass.
- `FFPROBE_PATH` = a scratch executable. First `#!/bin/sh` + `kill -9 $$` (what Gatekeeper does to a quarantined binary), later replaced in place by a wrapper that runs a working `ffprobe`.

## Results

| Step | Request | Answer |
|---|---|---|
| 5.1 | `GET /health` | `{"ok":true}` |
| 5.3 blocked `ffprobe` | `POST /sessions` (`title`, 8-word `script`, `language: en`) | **503** `{"ok":false,"reason":"The operating system blocked ffprobe, so the video could not be assembled. On macOS, run this in a terminal and try again: xattr -dr com.apple.quarantine <the Vid4You folder>"}`; sessions in the scratch database: **0**; the reason has no file path |
| 5.4 block removed, same process (no restart) | the same `POST /sessions` | **201**, session in state `submitted`; sessions in the scratch database: 1 |
| 5.2 working tools | (the 201 above) | the session is created as before |

After the 201 the voice-over attempt failed as `not-retryable` with "missing API key for the voice role": expected, the test server has no key, and it is the proof that no provider request was sent.

The server was stopped afterwards (nothing listening on 3199).

## Notes

- AC3 is shown here at session creation (the check is made again on every request, with no remembered failure). The assembly-time re-check of the subtitle filter is covered by `media-tools-check.test.ts` (`ffmpegHasSubtitleFilter remembers only a positive answer`), because a real assembly needs paid provider output.
