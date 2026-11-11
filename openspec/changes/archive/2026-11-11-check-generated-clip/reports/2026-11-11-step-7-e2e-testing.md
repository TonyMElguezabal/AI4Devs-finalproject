# Step 7 report — browser verification with Playwright MCP (JOS-265)

- Date: 2026-11-11
- Setup: the backend of step 6.2 (port 3107, `USE_STUB_VIDEO_PROVIDER=short-clip`, same scratch store) and `npx vite --port 5173` with `VITE_API_BASE=http://127.0.0.1:3107`. Page: `http://localhost:5173/?sessionId=01M75SZ9248NMFTR1QB2EE4M9T`, the failed session of step 6.2.

## 7.1 The scene shows as failed at the clip with the check's reason

The session page shows "Session state: Needs attention", "Failed phase: scenes", "Failed at clip: 1", and scene 1 as **Failed** (requested 5 s) with the alert text:

> the generated clip lasts 2.0 s, but 5 s was requested (video retry budget exhausted after 4 attempts)

The Final video section reads "Available once every scene is done". Screenshot: `2026-11-11-step-7-failed-clip-scene.png`. The only console error is the missing `favicon.ico` (404), which is unrelated. No frontend change was needed.
