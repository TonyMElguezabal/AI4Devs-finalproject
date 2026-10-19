# Tasks — Protect /admin with an Administrator password (JOS-173)

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-173-protect-admin-with-password` from `origin/feature/entrega-2-JAME` (the MVP integration branch) with `--no-track`, in the worktree `../AI4Devs-jos-173`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the base still matches design.md § Context: `loadCredential` in `backend/src/config/credentials.ts`, all routes in the `routes.ts` plugin, `App.tsx` with no router. Check whether JOS-194's static frontend serving, JOS-171 or JOS-174 has merged; if so, update design.md (Decisions 3, 5 and 7) first.
- [x] 1.2 PRD draft (next free version after JOS-174's and JOS-171's; §2.1, §2.3, §12.3, §16) written and marked as awaiting the product owner's approval, before any code.

## 2. Backend: password reading and the gate (TDD; design Decisions 1 and 3)

- [x] 2.1 Write failing tests in `backend/test/admin-access.test.ts` for `readAdminPassword()` with a scratch secrets file: environment wins over the file; the file is used when the environment has none; neither, or an empty value, gives `undefined`.
- [x] 2.2 Write failing tests, through `buildApp()` and `.inject()`, for a test-only route registered inside the `/admin` child plugin (spec "A later Administrator endpoint is protected by default"): no password configured → `401 not-configured`; configured and no header → `401 password-required`; a wrong password → `401 wrong-password`; the correct one → the handler runs. In every `401` case the handler's side effect did not happen, and the body contains neither password.
- [x] 2.3 Implement `backend/src/adminAccess.ts` (`readAdminPassword`, SHA-256 plus `timingSafeEqual`, the `requireAdministrator` `onRequest` hook) and the `/admin` child plugin in `routes.ts`. Make 2.1 and 2.2 pass with `npm run typecheck` clean.

## 3. Backend: `GET /admin/access` and regular routes (TDD; design Decision 4, spec AC1–AC3)

- [x] 3.1 Write failing tests: `GET /admin/access` with the correct password → `200 { configured: true, granted: true }`; the three `401` reasons as in 2.2; the response schema is zod-validated and appears in `/docs/json`.
- [x] 3.2 Write a test that, with `ADMIN_PASSWORD` set, `GET /languages`, `POST /sessions` and `GET /sessions/:id` succeed with no `Authorization` header (AC3), and that the app starts and serves them with no password configured.
- [x] 3.3 Implement `GET /admin/access` with its zod schemas and the `administratorPassword` bearer security scheme in the OpenAPI registration. Make 3.1 and 3.2 pass.
- [x] 3.4 Write a test that runs the app with request logging written to a buffer (add an optional logger parameter to `buildApp` only if there is no existing way), sends a wrong and a correct sentinel password, and asserts neither sentinel appears in the buffer (design Decision 6).

## 4. Frontend: `/admin` page (TDD; design Decisions 2 and 5)

- [x] 4.1 Write failing tests in `frontend/test/admin-page.test.tsx` with a mocked `fetch`: not configured → the "No Administrator password is configured" text with `ADMIN_PASSWORD` and "restart", and no password field; locked → a password field and "Unlock"; a wrong password → "Wrong password" and no Administrator area (AC2); the correct password → the Administrator area with "No Administrator tools yet" (AC1); a later `401` while unlocked → back to locked.
- [x] 4.2 Write a failing test that after unlocking, the password is in neither `localStorage` nor `sessionStorage`, and that `adminFetch` sends `Authorization: Bearer <password>`.
- [x] 4.3 Write a failing test that `App` renders `AdminPage` at `/admin`, and that `/` and `/?sessionId=` render as before with no password field and no `/admin` link in the top bar (AC3).
- [x] 4.4 Implement `adminFetch` and `getAdminAccess` in `frontend/src/api/client.ts`, `frontend/src/components/AdminPage.tsx` (existing tokens and styles, no new dependency), and the `/admin` branch in `App.tsx`. Make 4.1–4.3 pass with `npm run typecheck` clean.

## 5. Packaged app serving (design Decision 7)

- [x] 5.1 If JOS-194's static frontend serving is on the base branch: write a failing test that `GET /admin` returns the frontend page while `GET /admin/access` stays the API, then make it pass. If it is not: comment on JOS-194 that `GET /admin` must serve the frontend page, and record that here. **Recorded 2026-10-19:** the base has no static frontend serving in product code (`GET /` returns the backend skeleton page), so the requirement is commented on JOS-194, naming follow-up story L6 (the backend serves the built frontend, and must answer `GET /admin` too) and L3 (the origin guard). No test here: nothing in this change serves the page.

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Review the tests that build the app or assume no Authorization (`session-creation`, `server-runtime-load`, `credentials`, frontend `components`), and any that would break if `ADMIN_PASSWORD` is present in the developer's environment or `backend/.secrets.json`. Make the admin tests set and clear the value themselves.
- [x] 6.2 Map every scenario in `specs/administrator-access/spec.md`, and JOS-173 AC1–AC3, to at least one test. List the mapping in the step 7 report.
- [x] 6.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, `data/projects/` contents.
- [x] 7.2 Run the targeted tests from 2–5.
- [x] 7.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` and no `ADMIN_PASSWORD` in the environment, then once more in a fresh worktree.
- [x] 7.4 Verify the post-test state matches the baseline; restore it if not.
- [x] 7.5 Create the report `openspec/changes/protect-admin-with-password/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`.
- [x] 7.6 Mark this step complete only after the tests pass and the report file exists.

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the real server on a scratch store and scratch projects folder with stub providers and no `ADMIN_PASSWORD`. `GET /health` and `GET /languages` work; `GET /admin/access` returns `401 not-configured`, with and without a header.
- [x] 8.2 Restart with `ADMIN_PASSWORD` set to a scratch value. `GET /admin/access` returns `401 password-required` with no header, `401 wrong-password` with a wrong one, and `200 { configured: true, granted: true }` with the right one.
- [x] 8.3 With the password set, `POST /sessions` and `GET /sessions/:id` work with no header (AC3).
- [x] 8.4 Search the server's log file and stdout for both passwords used; neither appears.
- [x] 8.5 Delete the created sessions and the scratch store and folder. Confirm the default store is untouched. Save `openspec/changes/protect-admin-with-password/reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`.

## 9. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Run the backend (scratch store, stub providers, no password) and the frontend. `/admin` shows the "not configured" message and no form.
- [ ] 9.2 Restart the backend with `ADMIN_PASSWORD`. On `/admin`: a wrong password shows "Wrong password" and no Administrator area (AC2); the right one shows the Administrator area (AC1). Reload: the form is back, and browser storage holds no password.
- [ ] 9.3 Open `/` and start a project, then open its session page: no password is asked (AC3).
- [ ] 9.4 Restore the environment and save `openspec/changes/protect-admin-with-password/reports/YYYY-MM-DD-step-9-e2e.md` with screenshots.

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/PRD.md` → the next version (keep the previous one as `docs/PRD-v<previous>.md`): §2.1 adds the Administrator role with a password-gated `/admin`; §2.3 drops `/admin` and the Administrator role from out-of-scope; §12.3 adds one shared Administrator password, not accounts, and that regular pages need no login; §16 change log entry.
- [ ] 10.2 `docs/api-spec.yml`: `GET /admin/access`, the three `401` reasons, and the `administratorPassword` bearer security scheme that every `/admin/` endpoint uses.
- [ ] 10.3 `docs/backend-standards.md`: under Security, "Administrator endpoints go inside the `/admin` child plugin and add no authentication of their own"; replace "No accounts, sessions, or authentication" with the single-password exception; add the password-guessing risk next to the L3 gap.
- [ ] 10.4 `docs/frontend-standards.md`: the `/admin` route, `adminFetch`, and "the password lives in page memory only".
- [ ] 10.5 `docs/development_guide.md`: how to set `ADMIN_PASSWORD` (environment or secrets file), restart to apply, and a strong password recommended.
- [ ] 10.6 Comment on JOS-173 with the product owner's 2026-10-19 decision (secret, app starts when it is missing) and on JOS-174 that US-39's "missing password stops start-up" rule is superseded. Comment on JOS-171 that its routes go in the `/admin` child plugin and its section receives the password from `AdminPage`.
- [ ] 10.7 Run `graphify update .`.
