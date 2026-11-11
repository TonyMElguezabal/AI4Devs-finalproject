# Step 7 Report - Manual Endpoint Testing with curl

- Date: 2026-11-06
- Change: admin-tabs-and-tables (JOS-270)
- Agent: Claude Code (Sonnet 5.5)

This change adds and changes no endpoint. The check is that the Administrator endpoints the tabs call answer as before.

## Setup
Backend from this branch on `127.0.0.1:3170` (the packaged app owns 3100), with scratch `DB_PATH`, `PROJECTS_ROOT`, `SECRETS_PATH`, `SETTINGS_PATH` and `PROVIDER_KEY_PATH`, `ADMIN_PASSWORD=e2e-admin-pass` and the success stubs for every provider.

## Commands and answers (before any session was created)
| # | Request | Answer |
|---|---|---|
| 1 | `GET /admin/access`, no password | 401 `{"ok":false,"reason":"password-required"}` |
| 2 | `GET /admin/access`, wrong password | 401 `{"ok":false,"reason":"wrong-password"}` |
| 3 | `GET /admin/access`, right password | 200 `{"configured":true,"granted":true}` |
| 4 | `GET /admin/reports/provider-usage`, no password | 401 `password-required` |
| 5 | same, right password | 200 `{"from":null,"to":"…","sceneAttemptsFollowCurrentProvider":true,"rows":[]}` |
| 6 | `GET /admin/reports/estimated-cost`, right password | 200 `{"rows":[],"totals":[],"totalsExcludeUnpriced":false,…}` |
| 7 | `GET /admin/reports/sessions`, right password | 200 `{"rows":[]}` |
| 8 | `GET /admin/reports/provider-usage?from=yesterday`, right password | 400 `querystring/from Invalid datetime` |
| 9 | `GET /admin/providers`, right password | 200, five stages with `selectable` lists |

## Data and cleanup
All requests were reads. Two sessions were then created with `POST /sessions` (stub providers) only to give the reports rows for the E2E step; they live in the scratch database, which is deleted at the end of step 8. No real database was touched.

## Outcome
- Step 7 status: PASS
