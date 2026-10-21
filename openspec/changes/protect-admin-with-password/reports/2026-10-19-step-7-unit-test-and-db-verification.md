# Step 7: unit tests and database verification (JOS-173, protect-admin-with-password)

Date: 2026-10-19. Branch `feature/jos-173-protect-admin-with-password`, base `f56c8c5d` (the propose commit, on top of `origin/feature/entrega-2-JAME` at `7055f0ac`).

## 7.1 Baseline

This worktree is new: before any run, `backend/data/` did not exist, there was no `backend/.secrets.json`, and `ADMIN_PASSWORD` was not set in the environment. There was therefore no default store to snapshot (no tables, no migrations, no `data/projects/`). Every backend run used a scratch `DB_PATH` and `PROJECTS_ROOT` in the session scratchpad.

## 7.2-7.3 Commands and results

| Check | Result |
| --- | --- |
| Targeted, backend (`admin-access`, `admin-access-route`) | 26 passed |
| Targeted, frontend (`admin-page`) | 13 passed |
| `npm run typecheck`, backend and frontend | clean (exit 0) |
| `npm test`, backend (scratch paths) | 1707 passed, 5 skipped (117 files passed, 4 skipped) |
| `npm test`, frontend | 261 passed (4 files) |
| `npm run build`, frontend | built |
| The same typechecks and both suites in a fresh detached worktree of commit `61d482f9` (no secrets file, no data folder, dependencies installed from the lockfile) | identical: backend 1707 passed and 5 skipped, frontend 261 passed |
| The four admin and credential suites with `ADMIN_PASSWORD=<another value>` in the environment, then with that key in a temporary `backend/.secrets.json` (deleted straight after) | 47 passed both times |

Tests added: 39. Backend `admin-access.test.ts` (15) and `admin-access-route.test.ts` (11), frontend `admin-page.test.tsx` (13). The base counts follow by subtraction (derived, the base suite was not re-run): 1681 backend and 248 frontend. No existing test file was changed or removed (`git diff --name-status f56c8c5d -- backend/test frontend/test` lists three added files).

**Coverage (task 6.3):** the project has no coverage tool installed and its standard asks for named branches, not a percentage, so none was added. The evidence is the count above, the diff check that no test was touched, and the scenario map below.

**Robustness (task 6.1):** the admin tests fix the password through a replaceable reader (`setAdminPasswordReader`) or an explicit secrets path, and clear `ADMIN_PASSWORD` first, so a developer's own value cannot change an outcome. The frontend tests install recording stand-ins for `localStorage` and `sessionStorage`, because Node 26 ships an experimental `localStorage` that is undefined without `--localstorage-file` and shadows jsdom's. They also show that the page writes nothing to either storage.

## 7.4 Post-test state

`backend/data/` still does not exist, no `.secrets.json` was left behind, and `git status` is clean. The temporary worktree was removed and pruned.

## 6.2 Scenario and acceptance-criterion coverage

administrator-access (spec) -> tests
- Password set in the environment: backend/test/admin-access.test.ts "is the environment value when ADMIN_PASSWORD is set, even if the secrets file holds another"
- Password set in the secrets file: admin-access.test.ts "is the secrets-file value when the environment has none"
- Fresh install with no password: admin-access-route.test.ts "work the same, and the app starts, when no password is configured" (languages, POST /sessions, GET /sessions/:id)
- Opening /admin with no password configured: frontend/test/admin-page.test.tsx "says so, explains how to set it, and offers no password field or Administrator action"
- Correct password on /admin (AC1): admin-page.test.tsx "shows the Administrator area for the correct password (AC1)"
- Correct password on an Administrator endpoint: admin-access-route.test.ts "answers 200 { configured: true, granted: true } for the correct password"
- Wrong password on /admin (AC2): admin-page.test.tsx "shows 'Wrong password' and no Administrator area for a different password (AC2)"
- Wrong password on an endpoint: admin-access.test.ts "answers 401 wrong-password for a different password, of any length"; admin-access-route.test.ts "answers 401 wrong-password"
- No password supplied: admin-access.test.ts "answers 401 password-required ..."; admin-access-route.test.ts "answers 401 password-required with no header"
- Password supplied while none is configured: admin-access.test.ts "answers 401 not-configured ..."; admin-access-route.test.ts "answers 401 not-configured ..."
- A later endpoint is protected by default: admin-access.test.ts "runs the handler only for the correct password", "refuses before the body is parsed", "leaves a route outside /admin/ alone"; admin-access-route.test.ts "Every route under /admin/ is gated" (the real route table) and "marks every /admin/ operation with the scheme"
- Regular pages with a password configured (AC3): admin-access-route.test.ts "work with no Authorization header when a password is configured"; admin-page.test.tsx "App routing (AC3)" x3
- Requests with a wrong and a right password are logged: admin-access-route.test.ts "is in neither the standard output nor the log file ..."; admin-access.test.ts "never puts the supplied or the configured password in a 401 body"
- The page is reloaded after unlocking: admin-page.test.tsx "is asked for again after the page is reloaded", "is in neither localStorage, sessionStorage, a cookie nor the address after unlocking" (records every storage write)
JOS-173 ACs: AC1 = "shows the Administrator area ..." + "answers 200"; AC2 = "Wrong password" page test + "answers 401 wrong-password"; AC3 = regular endpoints test + App routing tests
Extra (not in the spec, needed by the page): CORS preflight for the Authorization header (admin-access-route.test.ts)

