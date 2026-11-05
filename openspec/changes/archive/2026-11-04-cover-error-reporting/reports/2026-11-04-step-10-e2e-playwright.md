# Step 10 Report: E2E Testing with Playwright MCP

- Date: 2026-11-04
- Change: cover-error-reporting
- Agent: Claude Code (Opus 5.5)

## Setup (10.1)

- **Backend:** `node src/server.ts` on port 3199, `NODE_ENV=development`, with literal scratch `DB_PATH`, `PROJECTS_ROOT`, `SETTINGS_PATH` and `SECRETS_PATH`. `VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:9`; consent was off, so nothing was exported.
- **Frontend:** `VITE_API_BASE=http://127.0.0.1:3199 npx vite --port 5173`. Vite listens on `localhost` only, so the app was opened at `http://localhost:5173/`, an origin the policy allows.
- **Guard:** `backend/data/logs/vid4you.log` stayed at 465 lines throughout.

## Scenarios

| # | Scenario | How | Result |
|---|---|---|---|
| 10.2 | The app loads | `browser_navigate`, then a snapshot | The start page renders. The only console error is the existing `favicon.ico` 404, which was **not** reported: a resource load error never reaches the bubble-phase listener. |
| 10.3a | Uncaught error | `browser_evaluate`: `setTimeout(() => { throw new TypeError("e2e uncaught error") })` | One `error`-level line: `stage: frontend`, `errorCode: error`, `msg: e2e uncaught error`, with the stack |
| 10.3b | Unhandled rejection | `browser_evaluate`: `Promise.reject(new Error("e2e unhandled rejection"))` | One `error`-level line: `stage: frontend`, `errorCode: unhandledrejection`, `msg: e2e unhandled rejection` |
| 10.4a | Render error | `browser_evaluate` walks the React fiber tree from `#root` and dispatches `null` into `RegularApp`'s language-list state (no test-only route was added). The next render throws `Cannot read properties of null (reading 'map')`. | The fallback replaces the app: heading "Something went wrong", the text, and a "Reload" button. One `render` report. In development, React 18 also rethrows the error to `window` (twice, with its retry), giving 2 extra `error` reports. Design D3 expected this; a production build doesn't do it. |
| 10.4b | Fallback look | Screenshot | The first screenshot showed the card with no inner padding (text against its edge). A `.error-fallback` class was added in `app.css` (the start form's `--space-5` padding and `--space-4` gap, button at its natural width). The second screenshot matches the other cards. |
| 10.4c | Keyboard | `Tab`, then `Enter` | `Tab` focuses "Reload" first. `Enter` reloads: a `window` marker set before was gone, and the start page heading was back. |

## Restore (10.5)

- The browser was closed, and both servers stopped.
- The scratch folder and `.playwright-mcp/` (snapshots and screenshots in the repository root) were removed.
- The Developer's `data/` store was never used.
- After the CSS change, the frontend suite still passes (483), and lint has no errors.

## Outcome

- Step 10 status: PASS
- Change made during the step: fallback card spacing (`frontend/src/styles/app.css`, `ErrorBoundary.tsx` class name). This is part of task 4.4 ("styled with the existing tokens").
