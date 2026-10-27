# Step 9 Report - E2E Testing in the Browser

- Date: 2026-10-27
- Change: record-provider-changes (JOS-229)
- Agent: Claude Sonnet 5.5

The Playwright MCP is not installed in this environment; the check was made with the Chrome browser tools (as for report-sessions), against the real backend and the real frontend dev server of this worktree.

## Setup
- Backend on port 3129 on a scratch copy of the Windows-run database (migrated to 25), `ADMIN_PASSWORD` set for the run, `CORS_ALLOWED_ORIGINS=http://localhost:5174`.
- Frontend dev server (`vite`, port 5174, `VITE_API_BASE=http://127.0.0.1:3129`). Port 5173 is served by the main checkout's own dev server, which was left alone; the second origin was added through `CORS_ALLOWED_ORIGINS`.
- The copy already held the three entries of step 8 (two active-provider changes and one clip move).

## Steps and results
1. Opened `/admin`, unlocked it with the run's Administrator password. The Reports section loaded with a "Provider changes" table holding the three entries of step 8, newest first (the move shows its session "Windows project" and scene 3).
2. In "Active providers" selected **RunningHub B** for the video stage. It saved at once (no button); sqlite then held a fourth entry `RunningHub → RunningHub B`.
3. Selected **RunningHub** again: a fifth entry `RunningHub B → RunningHub`.
4. Chose "Last 7 days" in the period selector to reload the reports. The table showed five rows, newest first: the change back (1:11:31 PM), the change to B (1:11:18 PM), the clip move, and the two earlier changes. Both new rows read "Active provider changed", "Video", blank session and scene, and carry both provider names. Times are shown in the computer's time zone.
5. "Failed stages" showed "No failed stage is on a provider other than the active one" after the move.

The table does not refresh by itself when a provider is changed in the same page; it reloads when the period is changed or the page is opened again (the same as the other reports).

## Cleanup
- Backend (pid 95757) and dev server (pid 95776) stopped by their own process ids, matched to their ports and working directories. The scratch copy, its logs and the test master key file were removed. The browser tab was closed.
- `Winrun_results/vid4you.sqlite` checksum unchanged (`ad5830c5…`).
