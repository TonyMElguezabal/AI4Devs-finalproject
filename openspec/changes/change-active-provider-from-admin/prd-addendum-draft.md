# PRD addendum draft — change the active provider from /admin (JOS-171)

**Status: awaiting the product owner's approval.** This text becomes `docs/PRD.md` v1.13 at task 11.1 (the previous version is kept as `docs/PRD-v1.12.md`). The status line and change-log entry of v1.13 say "awaiting the product owner's approval", and the change must not be merged before the approval is recorded.

**Version numbering.** v1.11 is JOS-173 and v1.12 is JOS-174, both merged. This change is v1.13. A later change takes v1.14.

## Proposed text

### Header (status line)

**Versión:** 1.13. **Status (v1.13, awaiting the product owner's approval):** the Administrator can change the active provider of each stage on `/admin` (`change-active-provider-from-admin`, JOS-171, §2.1, §2.3, §11, §11.2). All other product decisions remain closed.

### 2.1 Roles — Administrator row

| Administrator | Unlock `/admin` with the Administrator password and change the active provider of each stage there (§11.2). Further Administrator tools are added by later stories (moving a failed stage). A User never needs the password. |

### 2.3 Fuera del MVP

Replace "Administrator tools on `/admin`: the page exists behind the password, but each tool (changing the active provider, moving a failed stage, reports) is its own story." with:

- Administrator tools on `/admin` other than changing the active provider: moving a failed stage to another provider, reports, and editing any other setting. Each is its own story.

Replace "Changing providers or parameters from the application (interface or API) and applying a change without a restart (§11)." with:

- Changing a parameter from the application (interface or API) and applying a parameter change without a restart (§11). The active provider is the one exception (§11.2).

Replace "Any provider change, manual or automatic, including moving failed stages ..." with:

- Any automatic provider change, and moving a failed stage to another provider (§11.2), until its story is built; more than one Administrator, user accounts, changing the password from the interface, login sessions and lock-out after failed attempts.

### 11 (opening paragraph, last sentence)

Replace "There is one provider per stage, and it must be one for which the application ships an adapter." with:

"There is one active provider per stage, and it must be one for which the application ships an adapter. The settings name the provider each stage uses until the Administrator chooses another on `/admin` (§11.2)."

### 11.2 Vinculación y cambio de proveedor

Replace the first paragraph with:

"The Administrator can change the active provider of any stage (reasoning, voice, alignment, image, video) on `/admin`, among the providers for which the application ships an adapter. The choice is stored, overrides the provider named in the settings files, survives a restart and applies without a restart to every stage that is not yet bound to a provider. No other setting is editable on `/admin`; the rest still needs a file edit and a restart. There is no automatic switching: when a stage's retries are exhausted it stays on its provider."

Replace "La etapa conserva el proveedor utilizado..." with:

"Every stage is bound to a provider at its first attempt, once and for good: reasoning, voice and alignment per session; image and video per chunk. The binding is the provider active at that moment. The stage keeps it for its automatic and manual retries, whatever the active provider is later. Changing the active provider never regenerates a completed result."

### 16. Registro de cambios

**From version 1.12 to 1.13.** Origin: `change-active-provider-from-admin` (JOS-171), 2026-10-21. **Awaiting the product owner's approval.**

| Change | Origin |
|---|---|
| §2.1, §2.3, §11, §11.2: the Administrator changes the active provider of each of the five stages on `/admin`; the choice is stored, overrides the settings files, survives a restart and applies to the next unbound stage without a restart. | Product owner, JOS-171 |
| §11.2: all five stages bind to a provider at their first attempt (reasoning and alignment are added to voice, image and video); retries keep the bound provider; completed results are never regenerated; no automatic switching. | Product owner decision, 2026-10-19 |
| JOS-174's rule "settings are edited in the configuration files, not on `/admin`" gets one exception: the active provider. | JOS-171 |
| This version ships the mechanism only: each stage has one real adapter, and switching is proven with stub adapters. A second real provider is a separate story. | Product owner decision, 2026-10-19 |
