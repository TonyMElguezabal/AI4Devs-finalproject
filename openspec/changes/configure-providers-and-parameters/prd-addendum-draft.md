# PRD addendum draft — providers and parameters in settings files (JOS-174)

**Status: awaiting the product owner's approval.** Nothing below is in `docs/PRD.md` yet. After approval, task 9.1 applies it as PRD v1.10 and keeps v1.9 as `docs/PRD-v1.9.md`. The change must not be merged before the approval is recorded here.

## Proposed text

### Header (status line)

**Versión:** 1.10. **Status (v1.10):** providers and generation parameters are read from local settings files at start-up instead of being hardcoded (`configure-providers-and-parameters`, JOS-174, §2.1, §2.3, §11, §11.2, §11.3). All other product decisions remain closed. The previous version is kept in `docs/PRD-v1.9.md`.

### 2.1 Roles (replaces the paragraph after the table)

The MVP has a single role: the User. Providers and generation parameters are read at start-up from local settings files (§11): a default file that ships with the application and an optional per-user file that overrides it. A change takes effect after the application restarts. The MVP has no administration interface and no Administrator role, so settings are edited by hand and are not editable through the application. Provider credentials (API keys) are read from the process environment or from a credentials file in the user's application-data folder; they are never part of a settings file, never part of the application download, and never shown in the interface or logs. An Administrator role (a password for changing settings, diagnostics, and reports on `/admin`) is deferred post-MVP.

### 2.3 Fuera del MVP (two bullets change)

- Replace "Configuration files or any runtime configuration of providers and parameters (hardcoded in the MVP, §11)." with: "Changing providers or parameters from the application (interface or API), applying a change without a restart, and the Administrator password (§11)."
- Keep "Administrator role and any provider change, manual or automatic, including moving failed stages to another provider (§11.2)." and append: "Choosing a provider in the settings file is not a provider change in this sense (§11.2)."

### 11 Proveedores y operación (replaces the first paragraph; the Video row of the table changes)

In the MVP, the provider for each stage (reasoning, voice, alignment, image, video) and all generation parameters come from local settings files, read and validated once when the application starts. Configurable parameters: narration voice, quality, and speed; video admitted durations (minimum and maximum); segmentation lower bound; acceptable speed-factor limit; per-phase maximum times; output resolution and frame rate; supported script languages; and maximum simultaneous requests per stage. The application ships a default file holding the values recorded in §11.3; an optional file in the user's application-data folder replaces any subset of them. If the settings are missing a value, have a wrongly typed or out-of-range value, contain an unknown key, or are inconsistent, the application does not start and lists every problem. Editing a file while the application runs changes nothing until the next start. Provider credentials are read from the process environment or from a credentials file in the user's application-data folder, never from a settings file. There is one provider per stage, and it must be one for which the application ships an adapter.

Video row: "Animate a reference image with a requested duration within its capabilities. Its admitted durations and maximum are configured (§11.3: shipped default 5-15 seconds)."

### 11.2 Vinculación y cambio de proveedor (first paragraph and last paragraph change)

First paragraph: "In the MVP there is no provider change at run time: there is no manual or automatic switching, and a settings file cannot change a stage's provider while the application runs. The provider named in the settings when the application starts is the one used for new work. Manual provider changes and moving failed stages to another provider are deferred post-MVP."

Last paragraph: "A change to the configured admitted durations, languages, or any other setting, after a restart, does not alter what existing sessions have already established: intervals, chunks, requested durations, speed factors, warnings, the session's language, and completed results stay as they were. A stage that already has a bound provider keeps it for its retries."

### 11.3 Recorded providers and parameter values (intro changes)

"Defined by `define-provider-configuration` (JOS-165) and, since v1.10, shipped as the default settings file (`backend/config/settings.default.json`). The values below are those defaults; a per-user override file can replace them (§11)." The tables do not change.

### 16 Registro de cambios (new entry)

**From version 1.9 to 1.10.** Origin: `configure-providers-and-parameters` (JOS-174), 2026-10-19.

| Change | Origin |
|---|---|
| §2.1, §2.3, §11: providers and generation parameters are read from a shipped default settings file plus an optional per-user override, validated at start-up (every problem listed, unknown keys rejected, credentials excluded), and applied only after a restart. They are no longer hardcoded and "no configuration files" is removed from the MVP exclusions. | Product owner, JOS-174 |
| §11.2: a changed setting does not alter established work (intervals, chunks, durations, speed factors, warnings, language, results); a bound provider is kept for retries. | Product owner, JOS-174 |
| §11.3: its values are now the shipped defaults. | JOS-174 |
| The Administrator password is deferred to the story that adds `/admin` and the Administrator role. | Product owner decision, 2026-10-19 |

## Decisions already taken (2026-10-19)

- The Administrator password is deferred to the `/admin` story. Nothing would read it before then.
- Defaults ship with the application and a per-user file overrides them, so a fresh install starts.

## Pending

- Approval of this text by the product owner, and its recording on the status line above.
