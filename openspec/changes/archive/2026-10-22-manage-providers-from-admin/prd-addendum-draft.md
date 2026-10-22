# PRD addendum draft — manage providers, their parameters and their API keys from /admin (JOS-218)

**Status: approved by the product owner, 2026-10-22.** This text becomes `docs/PRD.md` v1.14 at task 12.1 (the previous version is kept as `docs/PRD-v1.13.md`). The status line and change-log entry of v1.14 say "awaiting the product owner's approval", and the change must not be merged before the approval is recorded.

**Version numbering.** v1.11 (JOS-173), v1.12 (JOS-174) and v1.13 (JOS-171) are merged. This change is v1.14.

## Proposed text

### Header (status line)

**Versión:** 1.14. **Status (v1.14, awaiting the product owner's approval):** the Administrator adds, edits and deletes providers, their parameters and their API keys on `/admin` (`manage-providers-from-admin`, JOS-218, §2.1, §2.3, §11, §11.2). All other product decisions remain closed.

### 2.1 Roles — paragraph after the table

Replace "Providers and generation parameters are read at start-up from local settings files (§11): a default file that ships with the application and an optional per-user file that overrides it. A change takes effect after the application restarts, and settings are edited by hand, not through the application; the one exception is each stage's active provider, which the Administrator changes on `/admin` and which applies without a restart (§11.2)." with:

"The operational settings (§11) are read at start-up from local settings files: a default file that ships with the application and an optional per-user file that overrides it. A change takes effect after the application restarts, and these settings are edited by hand, not through the application. The providers are the exception: the Administrator adds, edits and deletes the providers of each stage, their parameters and their API keys, and chooses each stage's active provider, all on `/admin`, and these apply without a restart (§11.2)."

Replace the credentials sentence "Provider credentials (API keys) are read from the process environment or from a credentials file in the user's application-data folder; they are never part of a settings file, never part of the application download, and never shown in the interface or logs." with:

"A provider's API key is entered on `/admin` and stored encrypted in the local database; it is never part of a settings file, never part of the application download, never returned by the application after it is saved (only its status and its last four characters) and never shown in a log. A key given in the process environment or in the credentials file in the user's application-data folder keeps working for the providers created from the first settings, until a key is stored for them."

### 2.3 Fuera del MVP

Replace "Changing a parameter from the application (interface or API) and applying a parameter change without a restart (§11). The active provider is the one exception (§11.2)." with:

- Changing an operational setting from the application (interface or API) and applying one without a restart (§11). The providers, their parameters and keys, and the active provider are the exception (§11.2).

Replace "Administrator tools on `/admin` other than changing the active provider: ..." with:

- Administrator tools on `/admin` other than managing the providers: moving a failed stage to another provider, reports, and editing an operational setting. Each is its own story. A provider for which the application ships no adapter, and a test of a provider's connection, are also later stories.

### 11 (opening paragraph)

Replace the sentence that says the provider for each stage and all generation parameters come from the settings files with: "The operational settings (maximum times, request caps, segmentation lower bound, speed-factor limit, output resolution and frame rate, supported languages) come from local settings files, read and validated once when the application starts. Each stage's providers are provider profiles managed on `/admin`: a profile is a stage, an adapter type the application ships for it, a display name, the parameters of that adapter type (reasoning model; voice model, voice, output format and speed; alignment endpoint path; image model; video endpoint path and admitted durations) and an API key. The first profile of each stage is created from the provider section of the settings the first time the application starts; afterwards those sections no longer change a profile."

### 11.2 Vinculación y cambio de proveedor

Append: "A change to a provider's parameters applies, without a restart, to the next request sent through it, including the retries of stages already bound to it; it never changes what a session has established (requested durations, speed factors, intervals, chunks, completed results). A provider that is the active provider of a stage cannot be deleted. A provider that sessions or scenes are bound to is retired instead of removed: it is no longer offered, and it keeps serving the retries of what is bound to it. A provider can be made active only when its parameters are valid and its API key can be found. The admitted durations used to segment a script and to request a clip are those of the active video provider when they run; a clip whose stored duration the active video provider does not admit fails, before it is bound, with a message that names it, and can be retried after the active provider is changed back."

### 16. Registro de cambios

**From version 1.13 to 1.14.** Origin: `manage-providers-from-admin` (JOS-218), 2026-10-21. **Awaiting the product owner's approval.**

| Change | Origin |
|---|---|
| §2.1, §2.3, §11, §11.2: providers become profiles managed on `/admin` (add, edit, delete), with their parameters and API key; the active provider is chosen among them. | Product owner, JOS-218 |
| §2.1, §11: API keys are entered on `/admin` and stored encrypted in the local database, shown only as a status and a hint; the environment and credentials-file keys remain a fallback for the first profiles. | Product owner decision, 2026-10-21 |
| §11.2: a parameter change applies to the next request without a restart; deleting retires a provider that work is bound to; the admitted durations come from the active video provider. | JOS-218 |
| JOS-174's rules "settings are edited in the configuration files, not on `/admin`" and "keys only in the environment or a local secrets file" get this exception for providers and keys. Operational settings are unchanged. | JOS-218 |
| A provider the application ships no adapter for, and a connection test, are later stories. | Product owner decision, 2026-10-21 |
