# Step 8 Report - E2E Testing in the browser

- Date: 2026-10-27
- Change: report-failures-and-retries (JOS-224)
- Agent: Claude Sonnet 5.5 (Chrome browser tools; the Playwright MCP is not installed in this environment)

## Setup
- Backend of this worktree on port 3124 and the frontend dev server on port 5241 (`VITE_API_BASE` pointing at the backend; `CORS_ALLOWED_ORIGINS` allowing the frontend's origin), on the scratch copy of the Windows-run database with the synthetic failure rows of step 7.
- The test Administrator password was set for this run only, through `ADMIN_PASSWORD`.

## Scenarios
| Scenario | Result |
|---|---|
| Open `/admin` without the password | Only the password field is shown; no report (AC5, UI side) |
| Unlock with the test password | The page shows the Reports section; the Failures and retries, Most frequent failure wordings and Scenes failed now tables are under the pipeline-time tables |
| Default period (last 30 days) vs. the curl answer of step 7 | Same figures: voice 3 / 0 / 1 / 1 / 1, reasoning 0 / 1 / 0 / 0 / 1, image 76 / 0 / 0 / not recorded / not recorded; wordings 3, 1 and 1; scenes failed now image 1, clip 2 (AC1 to AC3) |
| Last 7 days | Image drops to 74 (the two older attempts of another image provider leave the period) and equals the provider-usage table's 74 for the same period; the other rows and the failed-now counts do not change |
| All time | Image 76; failed-now still image 1, clip 2 |
| Text of the scenes' failures | `MARKER-IMAGE-FAILURE-TEXT` and `MARKER-CLIP-FAILURE-TEXT` appear nowhere in the page text (AC4) |

Not exercised in the browser (covered by component tests and curl instead): the empty period, a 401 mid-session and the failures request failing on its own.

## Cleanup
- Browser tab closed; the two servers stopped by the process ids listening on their ports; the scratch database copy and project folder removed.
- `Winrun_results/vid4you.sqlite` checksum unchanged.

## Outcome
- Step 8 status: PASS
- Blocking issues: none
