# Step 7 Report: E2E Testing with Playwright MCP

- Date: 2026-11-05
- Change: attribute-native-timestamps-to-voice-provider
- Agent: Claude Code (Opus 5.5)

## Setup

- **Backend:** the step 6 scratch store, restarted with the same literal, fully stubbed environment on port 3264.
- **Frontend:** `VITE_API_BASE=http://127.0.0.1:3264 npx vite --port 5173 --strictPort`.
  - A first try on port 5264 failed every API call on CORS, because the backend allows only the usual frontend origin. It was restarted on 5173.
- **No frontend code changed.** The page renders the `provider` the backend sends, so this checks what the User sees.

## Scenarios

| # | Session | How | Diagnostics line on the page |
|---|---|---|---|
| a | `01M6PCNWZKKAYX467WQRDCJ155`, a new stubbed run | `browser_navigate` to `/?sessionId=…`, then a snapshot | **"Timestamps: Stub provider (native timestamps), 1 attempt"** |
| b | `01M6PCKXE7VT9CA85SZKRFGCCD`, its attempt rewritten to the legacy `elevenlabs-native` (step 6.2) | the same | **"Timestamps: ElevenLabs (native timestamps), 1 attempt"** |

- **Other lines:** both pages also list "Voice-over: Stub provider (stub-voice), 1 attempt" and "Scene instructions: Stub provider (stub-reasoning), 1 attempt".
- **Console:** only the React DevTools notice and the existing `favicon.ico` 404.
- **Timing:** the first snapshot of (b) was taken before the session had loaded. A second snapshot, taken once it had, is the one quoted.

## Cleanup

- The browser is closed, and ports 3264 and 5173 are free.
- The `.playwright-mcp/` folder this run created in the repository was removed. The screenshot stays in the session scratchpad.

## Outcome

- Step 7 status: PASS
- Blocking issues: none
