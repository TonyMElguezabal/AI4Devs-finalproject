# PRD addendum draft — move a failed stage to the current active provider (JOS-172)

**Status: awaiting the product owner's approval.** This text becomes `docs/PRD.md` v1.15 at task 12.1 (the previous version is kept as `docs/PRD-v1.14.md`). The status line and change-log entry of v1.15 say "awaiting the product owner's approval", and the change must not be merged before the approval is recorded.

**Version numbering.** v1.14 (JOS-218) is approved and merged. This change is v1.15.

## Proposed text

### Header (status line)

**Versión:** 1.15. **Status (v1.15, awaiting the product owner's approval):** the Administrator moves a failed stage to the current active provider on `/admin` (`move-failed-stage-to-active-provider`, JOS-172, §2.1, §2.3, §7.2, §11.2). All other product decisions remain closed.

### 2.1 Roles — Administrator row

Replace "Further Administrator tools are added by later stories (moving a failed stage)." with "and move a failed stage to the current active provider (§11.2). Further Administrator tools are added by later stories."

### 2.3 Fuera del MVP

Replace "Administrator tools on `/admin` other than managing the providers: moving a failed stage to another provider, reports, and editing an operational setting." with "Administrator tools on `/admin` other than managing the providers and moving a failed stage: reports, and editing an operational setting."

Replace "Any automatic provider change, and moving a failed stage to another provider (§11.2), until its story is built; more than one Administrator, ..." with "Any automatic provider change; more than one Administrator, ...".

### 11.2 Vinculación y cambio de proveedor

Replace "A stage tied to a provider that is unavailable keeps retrying that same provider until it recovers. Completed results are never regenerated." with:

"A stage tied to a provider that is unavailable keeps retrying that same provider until it recovers, unless the Administrator moves it. `/admin` lists the failed stages that are bound to a provider other than the current active provider of their stage type, with an action to move each one to the current active provider. A move binds that one stage to the provider that is active at that moment and nothing else: it sends no request and does not retry; the next retry, automatic or manual, goes to the new provider, and the attempts recorded before the move keep the provider they ran on. A stage whose failure offers no manual retry is not listed. A move never regenerates a completed result of the session or its scenes, and nothing moves by itself, not even when retries are exhausted. Completed results are never regenerated."

### 7.2 (the requested clip duration)

Append where the requested duration and the speed factor are said to be stored once and never change: "The one exception is a failed clip that the Administrator moves to another video provider (§11.2): its requested duration is chosen again from the new provider's admitted durations, by the same rule (the smallest speed change), and its duration warning, speed factor and speed-factor warning follow from it, while the chunk and its narration interval stay unchanged."

### 16. Registro de cambios

**From version 1.14 to 1.15.** Origin: `move-failed-stage-to-active-provider` (JOS-172), 2026-10-22. **Awaiting the product owner's approval.**

| Change | Origin |
|---|---|
| §2.1, §2.3, §11.2: the Administrator moves a failed stage that is bound to a provider other than the active one to the current active provider, on `/admin`; the move rebinds only, and the next retry goes to the new provider. | Product owner, JOS-172 |
| §7.2: a moved clip chooses its requested duration again from the new provider's admitted durations; the chunk and interval are unchanged. | JOS-172, ticket AC4 |
| §11.2: completed results are kept, nothing moves automatically, and a failure with no manual retry is not listed. | JOS-172 |
