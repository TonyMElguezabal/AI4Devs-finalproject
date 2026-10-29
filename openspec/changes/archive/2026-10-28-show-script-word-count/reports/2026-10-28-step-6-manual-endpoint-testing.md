# Step 6 Report - Manual Endpoint Testing

- Date: 2026-10-28
- Change: show-script-word-count (JOS-236)
- Agent: Claude Sonnet 5.5

## Scope
This change adds and changes no endpoint. The only backend call of the start form is `GET /languages`, which was checked for regressions. No POST, PUT or DELETE endpoint is involved, so there was no data to restore.

## Setup
Backend started from this worktree on scratch paths (`DB_PATH` and `PROJECTS_ROOT` under the session scratchpad) and port 3917. It was stopped by its own PID afterwards.

## Commands and responses
- `curl -s -i http://127.0.0.1:3917/languages`
  - `HTTP/1.1 200 OK`
  - `[{"code":"en","label":"English"},{"code":"es","label":"Español"}]`

## Cleanup
- Server stopped; scratch `projects/` folder was empty (0 entries), so no session or file was created.

## Outcome
- Step 6 status: PASS
