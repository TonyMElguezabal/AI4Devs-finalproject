# Step 10 Report - E2E Testing in the Browser

- Date: 2026-09-27
- Change: lock-script-and-narration (JOS-137)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-137-lock-script-and-narration` at `7d2ff22`

## Applicability

**Applicable, with a reduced scope.** This story adds no screen. What it promises the User is that the script cannot be edited and the narration cannot be regenerated, so the E2E check asserts the absence of any control that would do either, and runs the one edit the UI does offer (correcting a failed scene's image instruction) end to end to show it cannot reach the script.

**Tool used:** the task names Playwright MCP, but the browser tooling available in this environment is Claude in Chrome (`mcp__claude-in-chrome__*`), so the check was run with it, in a Chrome tab created for this run. The checks are the same ones a Playwright script would make.

## Environment

- Backend: real `node src/server.ts` on port 3199, against a **scratch** database and project folder (never the shared test store)
- Frontend: `vite` on `127.0.0.1:5173` with `VITE_API_BASE=http://127.0.0.1:3199`
- Data: entered through the real form; one failed scene seeded with `sqlite3` into the scratch database, since no operation creates scenes yet (decomposition is not built)

## Steps and Results

| # | Step | Result |
|---|---|---|
| 1 | Open the app; the form offers Title, Script, a language selector and "Start project" | PASS |
| 2 | Fill the form (title `E2E lock test`, a one-sentence script, English) and click "Start project" | PASS: the page moved to `?sessionId=<ULID>` and showed state `submitted`, "connected" |
| 3 | Read the whole session page (accessibility tree, all elements) | PASS: the script appears as plain text; the tree lists no button and no text box |
| 4 | Inspect the DOM: count `input, textarea, select, button, [contenteditable], [role=textbox]` | PASS: **0 controls**. The script is in `<p class="session-script">`, `isContentEditable` false, not focusable. The page text has no mention of regenerating, narration, voice-over or editing the script |
| 5 | Seed one failed scene, reload the page, expand the scene | PASS: state `failed`, "Failed phase: image", the scene shows its instruction, provider and attempts |
| 6 | Inspect the controls with a failed scene present | PASS: exactly four: the details toggle, "Retry scene 1", one textarea, "Save correction and retry". The textarea holds `the original instruction`. **No control holds the script**, and there is still no regenerate or narration text |
| 7 | Type a new instruction into the textarea and click "Save correction and retry" | PASS: the request succeeded; the scene went `failed` -> `chunk-complete` **without a reload** (live update), and shows `a corrected instruction typed in the UI` |
| 8 | Read the page and the store afterwards | PASS: the page still shows the original script; the store has the original script, title (`E2E lock test`) and language (`en`); the scene holds the corrected instruction |
| 9 | Browser console | PASS: no errors or exceptions |

### Backend log for the run

The requests the UI made to the API were: `GET /health`, `GET /languages`, `POST /sessions` (201), the live-update stream and `GET /sessions/:id` (200), and one `POST /sessions/:id/scenes/:sceneId/correct` (200), each preceded by a CORS preflight where needed. No request modifies a session after creation, and the log has 0 warn-level and 0 error-level lines.

### Limitation

The browser network tool only records from the moment it is first called, so it captured nothing for this run (the page had already loaded and the action had already happened). The list of requests above therefore comes from the backend's own log, which is complete for the run.

## Cleanup

- Browser tab closed (it was created for this run; no tab of the user's was used).
- Backend and frontend stopped (no response on either port afterwards).
- State left by the run: 1 session, 1 scene, 1 project folder, all five triggers.
- Cleaned through the test-only reset (`resetAll()`) on the scratch database: 0 rows, **all five triggers present**, 0 project folders.
- The default test store was never touched: 0 rows, 0 voice-overs, all five triggers, 0 project folders.
- The scratch folder was deleted after this report was written. The repository's tracked files were unchanged by the run.

## Outcome

- Step 10 status: PASS
- Blocking issues: none
- Not covered: the UI cannot be shown a completed voice-over yet (JOS-136 has not built the voice launch), so "no control regenerates a completed narration" is checked here only as the absence of any such control on the page, and by the API tests for the routes.
