# Step 7 Report - E2E Testing in the Browser

- Date: 2026-10-28
- Change: show-script-word-count (JOS-236)
- Agent: Claude Sonnet 5.5 (Claude in Chrome)

## Setup
- Backend from this worktree on port 3100 with scratch `DB_PATH` and `PROJECTS_ROOT`, and `CORS_ALLOWED_ORIGINS=http://127.0.0.1:5174`.
- This worktree's Vite on port 5174. Port 5173 was already used by a dev server of the main checkout, so it was left alone.
- The telemetry consent dialog was dismissed with "Not now". The form was never submitted, so no provider was called and no session was created.

## Scenarios (all PASS)
| # | Action | Result |
|---|---|---|
| 1 | Type the ticket's example script into Script (field still focused) | `38 words · Estimated video duration ~0:15`; `aria-describedby="project-script-estimate"`; focus kept |
| 2 | Type `and more` | Line became `40 words · Estimated video duration ~0:16` while typing |
| 3 | Click the Title field (blur Script) | Line unchanged: `40 words · … ~0:16` |
| 4 | Select all and delete the script | The line element is gone and the textarea has no `aria-describedby` |
| 5 | Title, script and language not all filled | `Start project` stays disabled |

## Visual checks
- Screenshots in `reports/screenshots/`: `start-form-dark-1440.jpg`, `start-form-light-1440.jpg`, `start-form-light-375.jpg`.
- Light was forced by removing the `prefers-color-scheme: dark` rule in the page, because the app follows the system theme only.
- 375 px was checked in an iframe of that width, because the browser window cannot shrink below about 1676 px. The line wraps within the card and the page has no horizontal overflow.
- Not captured: a dark screenshot at 375 px. The hint colour is `--color-muted` in both themes, and its contrast was computed instead: 6.62:1 on the light surface and 6.96:1 on the dark surface (WCAG AA needs 4.5:1).

## Cleanup
- Tab closed; only the two servers started here were stopped (by PID); scratch data removed (0 project folders had been created).

## Outcome
- Step 7 status: PASS
