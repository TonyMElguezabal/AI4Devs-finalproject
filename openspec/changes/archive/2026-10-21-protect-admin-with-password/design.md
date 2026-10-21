## Context

The app is a local, single-user install (PRD §12.3, ADR 0007). It listens on `127.0.0.1` and has no accounts. Every route lives in `backend/src/routes.ts`, a Fastify plugin with zod schemas. The frontend is one React page (`App.tsx`) that switches on `?sessionId=`; it has no router.

Provider keys are read by `loadCredential(name)` (`backend/src/config/credentials.ts`): the environment first, then the git-ignored secrets file, cached per path. It throws when the key is missing.

Two proposed changes put Administrator actions on `/admin` and expect this change to supply the gate:

- **JOS-171** `change-active-provider-from-admin`: `GET /admin/providers`, `PUT /admin/providers/{stage}`, and an "Active providers" section inside the `/admin` page.
- **JOS-172**: moving a failed stage to another provider (not proposed yet).

JOS-174 deferred the Administrator password to this story and rejects any credential-like key in its settings files.

Product owner decision, 2026-10-19: the password is a local secret (environment or secrets file). When it is missing, the app still starts and `/admin` stays locked.

The `Origin`/`Host` guard is a known release gap (L3 in `docs/backend-standards.md`), and the backend still registers CORS with `origin: true`.

## Goals / Non-Goals

**Goals:**

- One gate that every `/admin/` endpoint passes through, present and future, with no per-route code.
- A `/admin` page that unlocks with the password and offers a slot for JOS-171 and JOS-172.
- No change for regular pages and endpoints.
- The password never reaches a log, a response or browser storage.

**Non-Goals:**

- Accounts, several passwords, roles beyond "Administrator or not".
- Login sessions, tokens, expiry, logout endpoints.
- Changing the password from the interface, or password strength rules.
- Lock-out or rate limiting after failed attempts (see Risks).
- The `Origin`/`Host` guard (L3). It is a separate, app-wide release gap.
- Any Administrator action. JOS-171 and JOS-172 add them.

## Decisions

### Decision 1 — The password is a credential read through `loadCredential`

`adminAccess.ts` exports `readAdminPassword(): string | undefined`, which calls `loadCredential("ADMIN_PASSWORD")` and returns `undefined` when it throws. This reuses the environment-then-secrets-file rule, the secrets-file cache and the existing tests' patterns. An empty value is already "missing" in `loadCredential`.

It is read on each check, not once at start-up. The environment cannot change in a running process and the secrets file is cached, so in practice a change applies after a restart, which is what `/admin` tells the user.

**Alternatives:**
- A settings-file key (JOS-174): rejected by the product owner, and it would break JOS-174's "no credentials in settings files" rule.
- Refuse to start when missing (US-39 as written): rejected by the product owner, because a fresh install must start.

### Decision 2 — The password travels in every Administrator request; no tokens

The `/admin` page holds the entered password in React state and sends it as `Authorization: Bearer <password>` on every Administrator call, through `adminFetch(path, password, init)` in `frontend/src/api/client.ts`. The backend keeps no login state.

**Alternatives:**
- A login endpoint issuing a random token held in memory: it adds a token store, expiry and a logout path, for a single local user. Rejected (YAGNI). The `Authorization` header is the same either way, so a token can replace the password later without touching the routes.
- HTTP Basic auth with the browser's own dialog: it needs the page request itself to get `401`, which the Vite dev server and the packaged static file serving do not do, and its credentials are cached by the browser for the whole session. Rejected.
- Keeping the password in `sessionStorage` so a reload stays unlocked: it puts the secret in storage any script on the origin can read. Rejected; a reload asks again.

### Decision 3 — One `onRequest` hook for the `/admin/` prefix

`routes.ts` registers the Administrator routes inside a child plugin with `prefix: "/admin"`. That plugin adds one `onRequest` hook, `requireAdministrator`, so every route registered in it, now or later, is gated before its body is parsed or its handler runs. JOS-171 and JOS-172 add their routes to this child plugin.

The hook decides in this order:

1. No password is configured → `401 { ok: false, reason: "not-configured" }`.
2. No `Authorization: Bearer …` header → `401 { ok: false, reason: "password-required" }`.
3. The supplied value differs → `401 { ok: false, reason: "wrong-password" }`.
4. Otherwise the request continues.

The comparison hashes both values with SHA-256 and compares the digests with `crypto.timingSafeEqual`. Hashing first gives equal-length buffers, so the comparison never leaks the length.

**Alternatives:**
- A `preHandler` per route: a forgotten one leaves a route open. Rejected.
- A global hook that checks `request.url.startsWith("/admin/")`: it works, but the prefix plugin scopes the hook by construction and keeps the regular routes untouched. Rejected.

### Decision 4 — `GET /admin/access` is the only new endpoint

It sits behind the hook, so its handler only runs when access is granted, and it returns `200 { configured: true, granted: true }`. The `/admin` page uses the hook's `401` reasons to choose what to show:

| Call | Result | `/admin` shows |
|---|---|---|
| on load, no header | `401 not-configured` | "No Administrator password is configured" and how to set it |
| on load, no header | `401 password-required` | the password form |
| submit, with header | `200` | the Administrator area |
| submit, with header | `401 wrong-password` | the form with "Wrong password" |

The same responses are documented in `docs/api-spec.yml` with an `administratorPassword` bearer security scheme.

### Decision 5 — The `/admin` page and its slot

`App.tsx` renders `AdminPage` when `window.location.pathname === "/admin"`, before the `?sessionId=` logic, with no router dependency. `AdminPage` has three states: `not-configured`, `locked` (a password field and an "Unlock" button) and `unlocked`. When unlocked it renders a heading and the Administrator area. With no Administrator sections yet, the area says "No Administrator tools yet". JOS-171 adds its section there and receives the password to call `adminFetch`.

A `401` received while unlocked (for example after a restart with a changed password) returns the page to `locked`. Leaving or reloading the page drops the password.

The page is not linked from the top bar. The Administrator opens `/admin` directly, so a regular user never sees an Administrator entry point.

### Decision 6 — The password stays out of logs and telemetry

Fastify's default request serializer logs the method, URL, host and remote address, not headers, and the `401` bodies carry only a reason code. A test runs the app with a logger writing to a buffer, sends a wrong and a right sentinel password, and asserts neither appears. No telemetry signal is added.

### Decision 7 — Serving `/admin` in the packaged app

In development the Vite dev server already answers `/admin` with `index.html`. In the packaged app (ADR 0007, JOS-194) the backend serves the frontend. The backend must also answer exactly `GET /admin` with the frontend page; this does not collide with the API, because no Administrator endpoint is `GET /admin` itself. If JOS-194's static serving is on the integration branch when this is implemented, the task adds `/admin` to it. If not, the requirement is recorded on JOS-194.

## Risks / Trade-offs

- **[Any website open in the browser can send password guesses to `127.0.0.1`, and with CORS `origin: true` it can read the answer.]** → The L3 `Origin`/`Host` guard, which is already a release blocker, closes this for every endpoint. This change does not add a partial copy of it. The risk is recorded in `docs/backend-standards.md` next to L3, and a strong password is recommended in the development guide.
- **[No lock-out after failed attempts.]** → The app is local and single-user. Once L3 is in place, only the user's own interface can reach the endpoint. Lock-out is left until it is needed.
- **[The password is sent on every Administrator request.]** → The traffic stays on the loopback interface, and the header is never logged.
- **[Reload asks for the password again.]** → Accepted. It is the price of keeping it out of browser storage.
- **[A changed secrets-file password needs a restart, because the file is cached.]** → The `/admin` text says "then restart", which matches the provider keys.

## Migration Plan

1. No data migration. With no `ADMIN_PASSWORD`, the app behaves as today, plus a locked `/admin`.
2. Rollback means reverting the commit.

## Open Questions

- PRD version number: JOS-174 drafts v1.10 and JOS-171 the version after. This change takes the next free number when it is implemented. The PRD change needs the product owner's approval before merge.
