# Step 7 Report - E2E Testing in the Browser

- Date: 2026-10-28
- Change: summarise-scene-progress (JOS-234)
- Agent: Claude (Sonnet 5.5), browser: Claude in Chrome

## Environment
- Backend from this worktree on port 3234 with a scratch `DB_PATH` and `PROJECTS_ROOT`; Vite on 5234 with `VITE_API_BASE=http://127.0.0.1:3234`.
- Session `01ARZ3NDEKTSV4RRFFQ69G5FB0`, 14 scenes seeded after boot (so boot recovery did not touch the in-flight states): 3 done (1-3), 2 queued (4-5), 4 generating an image (6-8, 11), 2 image ready (9-10), 1 generating a clip (12), 1 failed at image (13), 1 failed at clip (14).
- The telemetry consent dialog appeared on first load; it was declined with "Not now" (nothing sent).

## Scenarios
| # | Scenario | Result |
|---|---|---|
| 7.1 | Open the session. The panel summary, read from the DOM: `Done 3 of 14`, `Queued for image 2`, `Generating image 4 · 6–8, 11`, `Image ready, waiting for a clip slot 2 · 9–10`, `Generating clip 1 · 12`, `Failed at image 1 · 13`, `Failed at clip 1 · 14`, `Images left 7`, `Clips left 11`. Every figure and number matches the cards and the seed (AC1, AC2, AC4) | PASS |
| 7.2a | Live update: scene 9 changed to `video-generating` in the scratch database, then **Pause session** clicked (a pause broadcasts a fresh snapshot; continuing would have launched the queued scenes). With no reload the summary showed `Image ready ... 1 · 10` and `Generating clip 2 · 9, 12` (AC3) | PASS |
| 7.2b | The same page, now paused: the paused marker and the "Still generating / Waiting for continue" lines are unchanged and the counts are the same as before the pause (AC7) | PASS |
| 7.2c | Every scene set to `chunk-complete`, page reloaded: the summary shows only `Done 14 of 14` (AC5) | PASS |
| 7.2d | No `aria-live` ancestor on the summary; it contains no button, link or input (AC6) | PASS |
| 7.3 | Layout measured in same-origin iframes of exact widths (the window resize did not change the viewport, `innerWidth` stayed 1674). 375px, 1024px and 1440px: the summary stays inside the 312/320/320 px panel (summary width 264/272/272 px), no row clips its text (`scrollWidth <= clientWidth`) | PASS |

## Findings
- **At 375px the page scrolls horizontally by 15 px** (document `scrollWidth` 390). The element is the top bar's **New project** button (`.top-bar`, right edge at 390 px), not the summary: hiding the summary leaves `scrollWidth` at 390. It predates this change, and it contradicts the "no horizontal scroll from 375px" line in `docs/frontend-standards.md`. It is out of scope here and is reported to the user as a separate item.
- Only the dark theme was rendered: the app themes through `prefers-color-scheme` alone and the browser follows a dark system theme. The summary uses the existing `--color-muted` token and inherits the text color, so it follows the light palette the same way as the neighbouring `Scenes done` label; the light render itself was not checked.

## Environment restored
Both servers stopped, the browser tab closed, and the scratch database and directories deleted. No shared database was opened.

Outcome: PASS (one pre-existing finding recorded above)
