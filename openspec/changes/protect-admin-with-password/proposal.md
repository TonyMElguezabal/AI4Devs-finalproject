# Protect /admin with an Administrator password

Linear-Issue: JOS-173

## Why

JOS-171 (change the active provider) and JOS-172 (move a failed stage) put Administrator actions on `/admin`. Today the app has no `/admin` page and no way to tell the Administrator apart from a regular user: every endpoint is open to whoever uses the app. US-38 adds one shared Administrator password, kept on the local machine, that unlocks `/admin`. Regular pages keep working with no login.

## What Changes

- **Administrator password as a local secret.** `ADMIN_PASSWORD` is read like the provider keys: the environment first, then the local secrets file, never the repository or a settings file. It is never logged and never sent back by any endpoint.
- **The app starts without it** (product owner decision, 2026-10-19). When no password is configured, `/admin` says so and explains how to set it, and every Administrator endpoint refuses. This replaces US-39's "a missing password stops the app at startup": a fresh install must start (the same decision recorded for JOS-174), and the regular pages never need the password.
- **One Administrator gate for the API.** Every endpoint under `/admin/` requires the password in the `Authorization` header. A missing or wrong password, or no configured password, gets `401` and nothing is done. JOS-171 and JOS-172 register their endpoints behind this gate and add no authentication of their own.
- **`GET /admin/access`** tells the `/admin` page whether a password is configured and whether the one it holds is correct. It is the only Administrator endpoint this change adds.
- **`/admin` page.** A password form, then an empty Administrator area that JOS-171 and JOS-172 fill. A wrong password shows an error and no Administrator area (AC2). The password stays in page memory only; reloading the page asks for it again.
- **Regular pages unchanged.** `/`, `?sessionId=` and every non-`/admin/` endpoint keep working with no password or account (AC3).
- **Not added:** user accounts, more than one password, password change from the interface, login sessions or tokens, lock-out after failed attempts.
- **PRD change** (the version after those drafted by JOS-174 and JOS-171): §2.1 and §2.3 add the Administrator role and `/admin`, and §12.3 adds a single shared Administrator password, not accounts. Needs the product owner's approval before merge.

## Capabilities

### New Capabilities

- `administrator-access`: where the Administrator password comes from, what happens when it is missing, how `/admin` and every Administrator endpoint check it, that a wrong or missing password grants nothing, that the password never leaves the machine's configuration (no log, no response), and that regular pages and endpoints need no password.

### Modified Capabilities

None. `backend-foundation`'s "Provider credentials outside source control" already covers how a secret is read; the Administrator password follows it without changing it.

## Impact

- **Backend:** a small `adminAccess.ts` (read the password, compare in constant time, a Fastify `preHandler` for `/admin/`), `GET /admin/access` in `routes.ts`. No new dependency (`node:crypto`).
- **Frontend:** `/admin` route in `App.tsx`, an `AdminPage` component with the password form, and an `adminFetch` helper that adds the header, for JOS-171 and JOS-172 to reuse.
- **Packaged app:** JOS-194 serves the frontend and the API from one origin. The backend must answer `GET /admin` with the frontend page; `/admin/…` paths below it stay API paths.
- **API docs:** `docs/api-spec.yml` gets `GET /admin/access` and the Administrator security scheme.
- **Data:** no schema change.
- **Depends on nothing unmerged.** It does not need JOS-174, because the password is a credential, not a settings value. JOS-171 and JOS-172 depend on this change.
- **Security:** the app still listens on `127.0.0.1` only. The `Origin`/`Host` guard listed as a known release gap (L3, `docs/backend-standards.md`) is still missing, so until it lands any website open in the user's browser could try passwords; see design.md Risks.
