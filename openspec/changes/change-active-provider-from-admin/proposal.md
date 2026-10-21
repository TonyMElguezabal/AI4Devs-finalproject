# Change the active provider from /admin

Linear-Issue: JOS-171

## Why

After JOS-174, the provider for each stage comes from the settings files and changes only with a file edit and a restart. US-35 lets the Administrator change a stage's active provider on `/admin`, so new work can move to another provider while the app keeps running. Completed results are never regenerated, and work already bound to a provider stays on it (PRD §11.2).

## What Changes

- **Active-provider override, stored in the database.** For each of the five stages (reasoning, voice, alignment, image, video), the Administrator can choose the active provider on `/admin`. The choice is stored in the database, overrides the provider set in the settings files, survives a restart, and applies without a restart to the next stage that is not yet bound. All other parameters stay file-only and still need a restart (product owner decision, 2026-10-19).
- **Every stage binds on its first attempt.** Voice (per session), image and video (per scene) already do. This change adds the same bind-once binding for **reasoning** and **alignment** (per session) (product owner decision, 2026-10-19: all five stages). The bind reads the stage's *current active* provider instead of a fixed default. Automatic and manual retries keep using the bound provider (AC3).
- **An adapter registry for every stage.** Reasoning and alignment get a registry like the one voice, image and video already have. The `/admin` selector lists the adapters each stage ships, which is one per stage today. Switching is proven with stub adapters. A second real provider is a separate ticket, because it needs its own verification spike (product owner decision, 2026-10-19).
- **Admin API.** One endpoint reads the active provider, its source (settings files or `/admin`) and the selectable adapters per stage. Another endpoint changes the active provider. Both require the Administrator access from JOS-173; without it, the change is refused (AC2).
- **`/admin` section "Active providers"**: one selector per stage, shown inside the `/admin` page that JOS-173 adds.
- **Unchanged:** completed results are never regenerated (AC4). Exhausted retries never move a stage to another provider (AC5). Moving a failed stage manually is JOS-172.
- **PRD change** (v1.13, the version after JOS-174's v1.12): §2.1, §2.3 and §11.2 allow the Administrator to change the active provider on `/admin`. JOS-174's "settings are edited in the configuration files, not on `/admin`" gets one exception: the active provider. Needs the product owner's approval before merge.

## Capabilities

### New Capabilities

- `active-provider-selection`: what the active provider for each stage is (the `/admin` override, else the settings files), who may change it, when a change applies (the next unbound stage, with no restart), binding on the first attempt for all five stages, bound stages keeping their provider through automatic and manual retries, no regeneration of completed results, and no automatic switching.

### Modified Capabilities

None. The binding rules for voice, image and video live in change documents that have not yet been archived into `openspec/specs/`. This change states the full binding rule for all five stages in its new capability.

## Impact

- **Depends on JOS-173** (the `/admin` page and its Administrator password gate) and **JOS-174** (the settings files that supply the default active provider). Neither is merged yet. Implementation is gated on both (tasks group 1).
- **Backend:**
  - A new `active_providers` table.
  - New `runs.decomposition_provider_id` and `runs.alignment_provider_id` columns, which are additive migrations with no backfill.
  - Registries for decomposition and alignment.
  - The five bind points read `activeProviderId(stage)` instead of `registry.defaultIdentifier`.
  - `GET /admin/providers` and `PUT /admin/providers/{stage}`.
- **Frontend:** the "Active providers" section on `/admin`.
- **API docs:** `docs/api-spec.yml` gets the two admin endpoints. `docs/data-model.md` gets the table and the two columns.
- **No change** to existing sessions' bound providers, completed results or recorded attempts.
