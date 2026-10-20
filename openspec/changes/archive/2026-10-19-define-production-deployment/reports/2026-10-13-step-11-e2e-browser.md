# Step 11 — browser end-to-end on the local packaged application

Date: 2026-10-13. Chrome (Claude in Chrome) against `poc/local/out/Vid4You` on macOS, started with `PATH=/usr/bin:/bin`, a throwaway data folder, port 3150, `POC_MODE=stub`, `ALLOW_TEST_ENDPOINTS=1`, `POC_STUB_VIDEO_DELAY_MS=25000`. Under Decision 14 there is no Access login; the page is the executable's own `http://127.0.0.1:3150/`.

| Task | Step | Result |
|---|---|---|
| 11.1 | Open `http://127.0.0.1:3150/` | the page served from the executable's embedded assets; the language list (English, Español) loaded through the same-origin API |
| 11.2 | Fill title, script and language, **Start project** | session created; the page showed `connected` and `voice-over-complete` |
| 11.2 | Register scene 0 with `POST /internal/test/quick-scene` from outside (stand-in: decomposition hand-off not wired) | **without a reload** the page changed to `chunks-processing`, scene #0 `video-generating` |
| 11.3 | `kill -9` the executable while the clip was pending, relaunch 5 s later | the open page reconnected by itself (`connected`), then reached `final-video` without a reload: scene `chunk-complete`, "Assembly: Local assembly (ffmpeg), 1 attempt", a **Download final video** link |
| 11.4 | Final video | link target `/sessions/<id>/download/final-video` fetched: `200`, 58,339 B, `video/mp4`, h264 1920x1080 + mp3. The browser download itself was not clicked (a file download to the user's machine needs their approval); the link is the same request |
| — | Browser console errors | none |
| 11.5 | Restore | executable stopped, tab closed; the throwaway data folder is in the session scratchpad, not the user's data folder |
