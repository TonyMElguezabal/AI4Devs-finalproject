# PRD addendum draft — an Administrator password protects /admin (JOS-173)

**Status: awaiting the product owner's approval.** The text below was applied to `docs/PRD.md` as v1.11 (task 10.1), whose status line and change-log entry say "awaiting the product owner's approval"; this branch's previous version is v1.9, kept as `docs/PRD-v1.9.md`. The change must not be merged before the approval is recorded here, and the "awaiting" markers are removed from the PRD at that point.

**Version numbering.** JOS-174 drafts v1.12 (providers and parameters in settings files) and JOS-171 drafts v1.13 (change the active provider from `/admin`). This change is v1.11. The three drafts edit the same paragraphs of §2.1 and §2.3, so whichever merges second and third rebases its text onto the version before it. The numbers follow merge order, not ticket order.

## Proposed text

### Header (status line)

**Versión:** 1.11. **Status (v1.11):** one shared Administrator password protects `/admin` (`protect-admin-with-password`, JOS-173, §2.1, §2.3, §12.3). All other product decisions remain closed.

### 2.1 Roles (one row added to the table, and the paragraph after it changes)

New table row: `| Administrator | Unlock `/admin` with the Administrator password. The Administrator tools themselves are added by later stories (change the active provider, move a failed stage); this version only has the gate. A User never needs the password. |`

Replace the sentence "the MVP has no administration interface, and no Administrator role" (as it reads after v1.10) with:

"The product has two roles. The User needs no login. The Administrator unlocks `/admin` with one shared password, not an account. The password is a local secret, read from `ADMIN_PASSWORD` in the process environment or, when the environment has none, from the credentials file in the user's application-data folder; it is never part of a settings file, never part of the application download, and never shown in the interface, a response or a log. When no password is configured the application still starts, and `/admin` says so and explains how to set one. `/admin` is not linked from the User's pages."

### 2.3 Fuera del MVP (two bullets change)

- Replace "Interfaz de administración, incluida la ruta `/admin`." with: "Administrator tools on `/admin`: the page exists behind the password, but each tool (changing the active provider, moving a failed stage, reports) is its own story."
- Replace "Administrator role and any provider change, manual or automatic, including moving failed stages to another provider (§11.2)." with: "Any provider change, manual or automatic, including moving failed stages to another provider (§11.2), until its story is built; more than one Administrator, user accounts, changing the password from the interface, login sessions and lock-out after failed attempts."

### 12.3 Modelo de acceso, descargas y aislamiento (one sentence changes)

Replace "The application has no accounts, authentication or authorization rules." with:

"The application has no accounts. The only credential is one shared Administrator password that unlocks `/admin` and every Administrator endpoint (`/admin/…`); the User's pages and endpoints need no login, whether or not a password is configured."

### 16 Registro de cambios (new entry)

**From version 1.10 to 1.11.** Origin: `protect-admin-with-password` (JOS-173), 2026-10-19.

| Change | Origin |
|---|---|
| §2.1: an Administrator role with one shared password that unlocks `/admin`; the password is a local secret (`ADMIN_PASSWORD`, environment or credentials file), never logged or returned; when it is missing the application still starts and `/admin` stays locked. | Product owner, JOS-173 |
| §2.3: `/admin` and the Administrator role are no longer out of scope; each Administrator tool, accounts, several passwords, password change from the interface, sessions and lock-out still are. | Product owner, JOS-173 |
| §12.3: "no authentication" becomes "no accounts; one shared Administrator password for `/admin`". | JOS-173 |
| US-39's rule "a missing Administrator password stops the application at start-up" is superseded: a fresh installation must start. | Product owner decision, 2026-10-19 |

## Decisions already taken (2026-10-19)

- The password is a local secret (environment or credentials file), not a settings value. This also keeps JOS-174's rule that a settings file never holds a credential.
- The application starts when the password is missing; `/admin` stays locked and says how to set it.

## Pending

- Approval of this text by the product owner, and its recording on the status line above.
- The order in which JOS-174, JOS-173 and JOS-171 merge, which fixes the version numbers.
