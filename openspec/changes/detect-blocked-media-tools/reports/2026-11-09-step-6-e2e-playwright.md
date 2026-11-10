# Step 6 report — E2E with Playwright MCP (JOS-271, detect-blocked-media-tools)

Date: 2026-11-09. Executed by the agent.

## Setup

- Backend on port 3199 with `FFPROBE_PATH` pointing at an executable that kills itself (as in step 5), scratch `DB_PATH` / `PROJECTS_ROOT`, no provider key, `USE_STUB_SCRIPT_MODERATION=clean`.
- Frontend: `vite --host 127.0.0.1` on 5173 with `VITE_API_BASE=http://127.0.0.1:3199`, so the form could not reach the live app on 3100.
- The privacy dialog was dismissed with "Not now" (nothing is sent).

## Scenario

1. Open `http://127.0.0.1:5173/`, fill the title, an 8-word script and the language `English`, press "Start project".
2. The page stays on the start form and shows an alert under the form: `Error: The operating system blocked ffprobe, so the video could not be assembled. On macOS, run this in a terminal and try again: xattr -dr com.apple.quarantine <the Vid4You folder>`.
3. The scratch database has 0 sessions. The one console error is the browser's note of the 503 answer.

Evidence: `2026-11-09-step-6-blocked-tool-refusal.png`.

## Result

The refusal reaches the User through the existing error path (`asJson` throws the reason, `App.tsx` shows it). No frontend change was needed. The "Error: " prefix comes from `String(err)` in `App.tsx` and is the same for the existing content-check refusals.

Servers stopped afterwards (nothing listening on 3199 or 5173).
