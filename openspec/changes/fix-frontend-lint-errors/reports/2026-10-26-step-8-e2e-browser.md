# Step 8 Report - E2E Testing in the browser

- Date: 2026-10-26
- Change: fix-frontend-lint-errors (JOS-231)
- Agent: Claude Sonnet 5.5 (Claude in Chrome)

## Setup
Backend on `127.0.0.1:3231` with a throwaway `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH`, `ADMIN_PASSWORD` set to a test value, `USE_STUB_VOICE_PROVIDER=hang`, and `CORS_ALLOWED_ORIGINS=http://localhost:5231,http://127.0.0.1:5231` (the origin policy only allows the usual dev port 5173 otherwise; the first load answered "Could not reach the app" for that reason and was repeated with the variable). Frontend: `vite --port 5231` with `VITE_API_BASE=http://127.0.0.1:3231`. Neither touched the developer's own servers (the dev server on 5173 kept answering).

## Scenario
| # | Step | Result |
|---|---|---|
| 1 | Open `http://localhost:5231/admin`, enter the test password, Unlock | Admin page opens; the Reports section shows "No provider activity" and "No pipeline activity" (period Last 30 days) |
| 2 | Stop the backend, choose **Last 7 days** | Both errors appear: "Could not load the provider usage report. Is the app running?" and "Could not load the pipeline time report. Is the app running?" (`step-8-errors-shown.jpg`) |
| 3 | Restart the backend, choose **All time** | Both errors are gone and the empty-state messages show (`step-8-errors-cleared.jpg`) |

The first click of step 2 landed on the label and did not change the period; the radio itself was clicked next. The guard test of group 1 covers the same flow in a component test.

## Cleanup
Backend and frontend stopped (ports 3231 and 5231 closed); the browser tab closed; the throwaway data is outside the repository; `backend/data` does not exist in the worktree.

## Outcome
- Step 8 status: PASS
- Blocking issues: none
