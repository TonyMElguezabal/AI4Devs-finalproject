# Step 8 Report - E2E Testing in the browser

- Date: 2026-10-29
- Change: show-app-version (JOS-238)
- Agent: Claude Sonnet 5.5
- Tool: the Playwright MCP is not available in this session, so the Chrome browser tools were used instead (navigation, DOM measurements, screenshots). Backend from source on `:3100` and Vite on `:5173`, scratch `DB_PATH` and `PROJECTS_ROOT`.

| Scenario | Result |
|---|---|
| Backend without `VID4YOU_VERSION`: start form, `/admin`, and a session address (no such session) | Top bar shows `Development build` at the right end on each; `aria-label` is `Vid4You version 0.0.0-dev` |
| Backend with `VID4YOU_VERSION=2026.10.28-3d00e7b VID4YOU_CHANNEL=production`: same three screens | Top bar shows `v2026.10.28-3d00e7b` on each |
| Scroll 2,500 px down a page made 4,000 px tall (start form) | The bar stays at `top: 0` and the label stays visible. A real session page was not scrolled: no session was created because that would call the paid providers |
| About 400 px wide (a 400 px iframe; the window resize did not change the viewport) | First attempt on the session screen: nothing overflowed but the label shrank to about 20 px, unreadable. Fixed under design Decision 4 (spec scenario and design updated first): up to 30 rem the bar wraps and the label takes its own right-aligned line. Re-measured at 396, 476 and 316 px: no horizontal overflow; at 396 px Privacy and New project stay on the first line, the bar is 84 px tall |
| Backend stopped, page reloaded | The bar renders with the wordmark only, no label and no alert |

Not covered: a session page with real content (the only session pages seen were the "No session was found" state). The consent dialog is open in the screenshots because the scratch database had no answer saved; it is unrelated to this change.

Outcome: PASS, with the one real-session scroll check left to the `dry-run` artifact check (task 9.4).

## Rerun with the Playwright MCP

- Agent: Claude Opus 5.5
- Setup: backend from source on `:3101` and Vite on `:5174` (the main checkout's Vite held `:5173`), with `VITE_API_BASE=http://127.0.0.1:3101` and `CORS_ALLOWED_ORIGINS=http://localhost:5174`. Scratch `DB_PATH`, `PROJECTS_ROOT`, `SETTINGS_PATH` and `PROVIDER_KEY_PATH` (no keys), stub voice, image, video and assembly providers, `ALLOW_TEST_ENDPOINTS=1`.
- Test data: one session inserted with `createRun` into the scratch database (`POST /sessions` would call the OpenAI moderation check first), then a voice-over and 30 scenes added through `/internal/test/quick-voice-over` and `/internal/test/quick-scene`. The session page is `/?sessionId=<id>`.

| Scenario | Result |
|---|---|
| Backend without `VID4YOU_VERSION`: start form, session page, `/admin` | Each top bar shows `Development build`; `aria-label` is `Vid4You version 0.0.0-dev` |
| Backend with `VID4YOU_VERSION=2026.10.28-3d00e7b VID4YOU_CHANNEL=production`: same three screens | Each shows `v2026.10.28-3d00e7b`; `aria-label` is `Vid4You version 2026.10.28-3d00e7b` |
| Scroll the 30-scene session page to the bottom (2,300 px tall, scrolled 1,500 px) | The label stays at `top: 20 px` and is visible |
| Viewport resized to 400, 360 and 320 px on all three screens | No horizontal overflow, no control off screen, label stays 13 px. Session page: Live and Privacy on the first line, New project on the second, the label on its own right-aligned line (bar 124 px). Start form: 84 px. `/admin`: 74 px |
| `/app/version` aborted with `page.route` on all three screens | No label, no `role=alert`, no page error; the wordmark and other controls render. The only console errors are the aborted request itself |

Console errors unrelated to this change: `favicon.ico` 404 and `/admin/access` 401 (admin not signed in).

Difference from the first run: on a real session page the Live indicator is also in the bar, so at about 400 px New project wraps to a second line (bar 124 px, not the 84 px measured on the "No session was found" page). Every control stays on screen, which is what the spec scenario asks for.

Restoration: servers stopped and scratch folders deleted; the shared database was not touched.

Outcome: PASS. The real-session scroll check is now covered here.
