# Step 8 Report - Manual Endpoint Testing with curl

- Date: 2026-10-29
- Change: probe-provider-request-caps (JOS-188)
- Agent: Claude

No endpoint exposes the request caps (the proposal first said `GET /admin/settings` did; it returns the visual-style prompt and the reference image). The backend's boot log line is the only place the limits show, so the caps were checked there and `GET /admin/access` was used to prove the server answers.

## Setup
`node src/server.ts` from `backend/` with `DB_PATH`, `PROJECTS_ROOT`, `PROVIDER_KEY_PATH` and `SECRETS_PATH` in a scratch folder, `ADMIN_PASSWORD=probe-throwaway`, `PORT=3199`, `VID4YOU_NO_BROWSER=1`.

## Commands and responses
| # | Command | Response |
|---|---|---|
| 1 | `curl http://127.0.0.1:3199/admin/access -H "Authorization: Bearer probe-throwaway"` (default settings) | `200 {"configured":true,"granted":true}` |
| 2 | same with `Bearer nope` | `401` |
| 3 | boot log line of the default run | `concurrency`: decomposition 50, image 200, **voice 4, alignment 2, video 4** |
| 4 | restart with `SETTINGS_PATH` pointing to `{"maxSimultaneousRequests":{"video":1}}`; the `curl` of #1 | `200`; boot log shows **video 1**, voice 4, alignment 2 (the override wins, the other defaults hold) |

## Database and environment state
Scratch only; both servers were stopped (port 3199 no longer listening) and the real `backend/data` fingerprint is unchanged (step 7 report). The override file lives in the scratch folder, so no override remains.

## Frontend / E2E
Not applicable: no frontend change.

## Outcome
- Step 8 status: PASS
