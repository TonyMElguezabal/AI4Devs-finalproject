# Step 8: manual endpoint testing (JOS-173, protect-admin-with-password)

Date: 2026-10-19. The real `node src/server.ts` of this branch on `127.0.0.1:3173`, driven with `curl`.

## Setup

- Environment cleared (`env -i`, only `PATH`, `HOME` and what the run sets), so no provider credential could be read. A scratch `DB_PATH` and `PROJECTS_ROOT`; `backend/.secrets.json` does not exist in this worktree. `NODE_ENV=development`, so the real logger runs (stdout and the rotating file in `logs/` beside the scratch store).
- `USE_STUB_VOICE_PROVIDER=not-retryable-failure`, so a created session fails its voice stage at once and nothing leaves the machine.
- `POST /sessions` runs a content check that needs an OpenAI credential. A scratch-only preload (`node --import`, kept outside the repository) makes it answer "clean". The server code ran unchanged.
- The two scratch passwords were `scratch-admin-pw-Rk7q2Lm9` (the configured one) and `scratch-wrong-pw-Zt4x8Vb3` (the wrong one).

## Results

| Step | Request | Result |
| --- | --- | --- |
| 8.1 | no `ADMIN_PASSWORD`: `GET /health`, `GET /languages` | 200, 200: the app starts and serves the regular endpoints |
| 8.1 | `GET /admin/access`, no header | 401 `{"ok":false,"reason":"not-configured"}` |
| 8.1 | `GET /admin/access` with `Authorization: Bearer anything-at-all` | 401 `not-configured` |
| 8.2 | `ADMIN_PASSWORD` set; no header | 401 `password-required` |
| 8.2 | a wrong password | 401 `wrong-password` |
| 8.2 | the right password | 200 `{"configured":true,"granted":true}` |
| 8.2 | the right value under the `Basic` scheme | 401 `password-required` |
| 8.2 | browser preflight (`OPTIONS`, `Origin: http://127.0.0.1:5173`, `Access-Control-Request-Headers: authorization`) | 204, `access-control-allow-headers: authorization`, no password needed |
| 8.3 | password set, no header: `GET /languages`, `POST /sessions`, `GET /sessions/<id>` | 200, 201, 200 (AC3) |
| 8.4 | search for both passwords in the stdout log and in `logs/vid4you.log` | 0 and 0 matches for each. Not vacuous: 5 stdout log lines mention `/admin/access` |

## Observations

- `GET /admin/nothing-here` (no such route) answers **404**, not 401. The gate protects the routes that exist, and the structural test (`Every route under /admin/ is gated`) fails if a new one is not behind it. A missing route leaks nothing.
- `GET /admin` itself answers 404 on the backend: the page is served by the Vite dev server in development, and by the packaged app's static serving once that exists. The requirement is recorded on JOS-194 (follow-up story L6).

## 8.5 Clean-up

The one session created lived only in the scratch store. The store, its logs and the scratch home were deleted, port 3173 is free, no server is running, and `backend/data/` does not exist in this worktree.
