# Step 8 Report - E2E with Playwright MCP

- Date: 2026-11-06
- Change: admin-tabs-and-tables (JOS-270)
- Agent: Claude Code (Sonnet 5.5)

## Setup
Backend from this branch on `127.0.0.1:3170` and Vite on `127.0.0.1:5173` (`VITE_API_BASE` pointing at 3170); scratch database and directories; every provider stubbed (`success`); `ADMIN_PASSWORD=e2e-admin-pass`. Two sessions ("Lighthouse keeper", "Harbour morning") were created through `POST /sessions` to give the reports rows. The packaged app on 3100 was not touched.

## Scenarios executed
| # | Scenario | Result |
|---|---|---|
| 1 | Open `/admin`, unlock with the password | Settings tab selected; visual style and one compact row per active-provider stage, each with a source badge |
| 2 | Choose Reports | URL hash `#reports`; summary tiles (8 attempts, 100 %, estimated cost "—", 0 failed scenes), Provider usage and Sessions open, the other four panels closed |
| 3 | Change the hash to `#providers` in the same page | `hashchange` selected the Providers tab without a reload |
| 4 | Providers: open "More actions for Fal.ai" | The menu lists the actions (Delete only: the key is missing, so Test connection is not offered); Escape closed it and focus returned to its button |
| 5 | Choose Delete Fal.ai, then Cancel | The row asked "Confirm delete Fal.ai" / "Cancel"; Cancel left the profile in place (nothing was deleted) |
| 6 | Width 375 px: walk all four tabs | No element extends past the card outside a `.table-scroll` wrapper, and the page does not scroll sideways (checked by script on every tab) |
| 7 | Width 375 px: Reports | Period control wraps inside its box, tables scroll inside their wrappers |
| 8 | Keyboard: focus the checked period radio, ArrowRight twice | Moved to "Custom range"; the two date inputs appeared |
| 9 | Custom range 2026-11-01 to 2026-11-03 | "No provider activity in this period." (the sessions are from 2026-11-06) |
| 10 | Console | 3 errors, all expected: two 401 answers of `/admin/access` before unlocking and a missing `favicon.ico` |

## Fixes made after looking at the screenshots
Source badges stretched across the row; the period legend overlapped the control's border; numeric headers were left-aligned over right-aligned numbers; the tab row wrapped onto two lines at 375 px (it scrolls now); the provider problem line was unstyled; tiles stacked one per row at 375 px (two per row now). The screenshots in `screenshots/` were taken before these polish edits.

## Not exercised
The charged-test confirmation and "Test connection" (they need a stored key); the overflow menu of a configured connector's "Duplicate". Both are covered by the unit tests.

## Cleanup
Both servers stopped; the scratch database and directories are under the session scratchpad and hold no real data. Nothing outside the scratch directories was written.

## Outcome
- Step 8 status: PASS
