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
