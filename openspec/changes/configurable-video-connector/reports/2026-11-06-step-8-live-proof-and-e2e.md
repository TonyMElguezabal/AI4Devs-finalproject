# Step 8 — Live proof and E2E (2026-11-06)

## Setup

- Backend from the worktree on port 3200 with a scratch `DB_PATH`, `PROJECTS_ROOT`, `PROVIDER_KEY_PATH` and `SETTINGS_PATH`, a throwaway Administrator password, and the pinned ffmpeg/ffprobe (`FFMPEG_PATH`, `FFPROBE_PATH` from the entrega-2 macOS build, with libass). Frontend from the worktree on port 5273 (`VITE_API_BASE` pointed at 3200), driven with Playwright MCP.
- Real providers: OpenAI, ElevenLabs, Fal.ai, Runway (`api.dev.runwayml.com`) and RunningHub. Keys were read from the git-ignored secrets file inside scripts and never typed in the browser or printed.
- Every session: the same two-sentence script (15.2 s of narration, 2 scenes).

## 8.1 Profiles on /admin

- **Runway Wan** was added through the form (type "Configured connector", Runway definition from `docs/video-connector-definitions.md` pasted into "Requests (JSON)", price 0.10 USD per clip second). Its key was then stored with one `PUT` from a script, so it never reached the page. "Test connection" answered **Connected.**
- **Runway Kling** was made with **Duplicate Runway Wan**: the form came prefilled with the definition, "Runway Wan (copy)" as the name, an empty key field and "Reuse the key of Runway Wan (…****)" checked. Model set to `kling_4`, resolution `auto_720p`, price 0.128. Saved with `copyKeyFrom`; the key status became "stored" (screenshot `step-8-duplicate-kling.png`).
- **RunningHub connector** was added with one `POST` (RunningHub definition, `768P`, price 0.077), because its key comes from the secrets file.

## 8.2 One session per connector

| Session | Video provider | Clips (requested s → file) | Clip size | Final video | Time to final |
| --- | --- | --- | --- | --- | --- |
| `01M6QV65G53D6WSQHH4GVKV7NS` | Runway Wan (`wan3`, `auto_720p`) | 9 → 9.03 s, 6 → 6.04 s | 1274×722 @ 30 fps | 1920×1080 @ 30 fps, 15.26 s | after the fix below |
| `01M6QVQ0V4VN8CVHPJYB4HG8FA` | Runway Kling (`kling_4`, `auto_720p`) | 9 → 9.04 s, 7 → 7.04 s | 1284×728 @ 24 fps | 1920×1080 @ 30 fps, 15.26 s | 586 s |
| `01M6QW99ZGYYAA0G8FA9X3X1ZJ` | RunningHub connector (`768P`) | 9 → 9.42 s, 6 → 6.58 s | 1344×768 @ 24 fps | 1920×1080 @ 30 fps, 15.00 s | 225 s |

- Every clip passed the MP4 checks and every scene reached `chunk-complete`.
- The scene details name the profile and its model: "Clip: Runway Kling (kling_4), 1 attempt" (screenshot `step-8-kling-scene-details.png`).
- The recorded clip request of every scene has only `prompt`, `duration`, `resolution` and `firstFrame`: no image data and no key (checked on the stored rows against the real key).
- Kling runs one clip at a time on this tier; the second clip waited as `THROTTLED` (pending) and arrived 300 s after the first.

### Found and fixed: the image type in the data URI

The first Wan session failed both clips with "the submit step answered HTTP 400". The same request sent by hand returned Runway's reason: `promptImage` "Failed to fetch image metadata". The scene images are JPEG and the connector labelled every data URI `image/png`; step 1 had passed only because it used a PNG. The connector now reads the type from the image's first bytes (`sniffImageExtension`) for the data URI and the upload (spec scenario, design Decision 2 and task 2.2 updated first; commit `4ed3e432`). After a restart, a manual retry of both scenes completed the session.

I had first typed `1280:720` as Wan's resolution on /admin; step 1 had proven `auto_720p`, and the profile was corrected to that before the retry.

## 8.3 Restart while a clip is pending

During the Kling session, both clips had been submitted (Runway task ids `8f18d104-…` and `8dfb6059-…` stored on the scenes). The backend was stopped and started again. Boot recovery logged `stillPending: 2`; one minute later both scenes were still `video-generating` with the same task ids. No new submit was sent, and both clips completed from those ids.

## 8.4 Coded RunningHub active again, cost

- `PUT /admin/providers/video {"providerId":"RunningHub"}` → active provider `RunningHub`.
- **Runway:** balance 4886 → 4534 credits, **352 credits (3.52 USD)** for 4 clips (31 s requested).
- **RunningHub:** 2 clips, 15 s requested at 768P, about **1.16 USD** at 0.077 USD per second.
- OpenAI, ElevenLabs and Fal.ai: three short sessions (decomposition, a 15 s voice-over and 7 images, one image retried); a few cents.

## 8.5 Final video at 1280×720 and 1920×1080

- The RunningHub connector session was first assembled at the shipped 1920×1080 (`ffprobe`: h264 1920×1080 30/1, mp3, 15.00 s).
- The settings override was set to `{"output":{"width":1280,"height":720,"fps":30}}` and the backend restarted. Because a rebuild with nothing changed is refused (`nothing-to-rebuild`), the session's `final_video_stale` flag was set by hand in the scratch database to assemble the same 768P clips again. Result: `ffprobe` h264 **1280×720** 30/1, mp3, 15.00 s.
- The frame at 3 s of both renders (the 1080p one scaled to 720p, above; the 720p one, below) shows the subtitle at the same place and the same size relative to the frame (screenshot `step-8-subtitles-1080-vs-720.png`).

## Observations, not changed here

- A scene that completes after a manual retry keeps its previous `last_error` text in the database (the Wan scenes still hold the 400 reason).
- One Fal.ai image came back 1536×1088 and was refused and regenerated by the image output check; not related to this change.
