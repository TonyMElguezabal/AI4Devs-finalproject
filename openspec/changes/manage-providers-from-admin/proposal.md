# Manage providers, their parameters and their API keys from /admin

Linear-Issue: JOS-218

## Why

After JOS-171 the Administrator can switch the active provider of a stage on `/admin`, but only among the one adapter each stage ships, with parameters in settings files and API keys in vendor-named environment variables (`ELEVENLABS_KEY`, `FAL_API_KEY`, ...). To replace a provider (for example the image generator) the Administrator still edits files and restarts. JOS-218 makes `/admin` the place where providers, their parameters and their keys are managed, and makes the application ask for a key by the stage's role, not by the vendor.

## What Changes

- **Provider profiles, stored in the database.** A provider profile is one configured use of a shipped adapter type: stage, adapter type, display name, parameters, and a key. The Administrator can add, edit and delete profiles on `/admin` (several per stage, for example two Fal.ai models). The profiles of a stage are what its "Active provider" selector (JOS-171) offers. Today's settings-file providers become the first profiles, with their existing ids, so every existing binding keeps resolving.
- **Per-provider parameters are editable on `/admin`:** reasoning model; voice model, voice, output format and speed; alignment endpoint path; image model; video endpoint path and admitted durations. Each adapter type declares its parameters and their rules; a save is validated and every problem is listed.
- **API keys are entered on `/admin`, stored encrypted in the local database and masked afterwards.** The application asks for a key by the stage's role (`REASONING_APIKEY`, `VOICE_OVER_APIKEY`, `ALIGNMENT_APIKEY`, `IMAGE_APIKEY`, `VIDEO_APIKEY`) and the system returns the key of the provider bound to, or active for, that stage. No application code names a vendor key. Existing environment and `.secrets.json` keys keep working as a fallback for the migrated profiles, so nothing is re-entered.
- **Deleting a provider:** refused while it is the active provider of a stage; a provider that sessions or scenes are bound to is retired (not offered, still used by what is bound to it); otherwise it is removed.
- **Admitted durations follow the active video provider.** Segmentation and clip requests read them from the active video provider when they run, instead of from start-up constants.
- **Settings files keep every non-provider setting** (segmentation lower bound, speed limit, maximum times, request caps, resolution, languages). Their provider sections only seed the first profiles.
- **Admin API:** list the adapter types and their parameter descriptions, list profiles, add, edit and delete a profile. All behind the Administrator password from JOS-173.
- **`/admin` section "Providers":** per stage, the profiles with their parameters and key status, add, edit and delete forms, next to JOS-171's active-provider selectors.
- **Unchanged:** binding on the first attempt, bound stages keeping their provider for retries, no regeneration of completed results, no automatic switching (JOS-171). A provider can only be an adapter type the application ships: a vendor the app has no adapter for is the follow-up JOS-219, not this change.
- **PRD change** (v1.14, after JOS-171's v1.13): §2.1, §2.3, §11, §11.2, §12.3 and the credentials rule. It supersedes JOS-174's "settings are edited in the configuration files, not on `/admin`" for provider settings and its "keys only in the environment or a local secrets file" for keys entered on `/admin`. Needs the product owner's approval before merge.

## Capabilities

### New Capabilities

- `provider-profiles`: what a provider profile is, how the Administrator adds, edits, validates and deletes one, which profiles can be selected and made active, how the first profiles come from the settings files, and how admitted durations follow the active video provider.
- `provider-credentials`: where a provider's API key is stored, that it is encrypted, masked and never logged, how it is resolved by stage role to the bound or active provider, and the environment and secrets-file fallback for migrated profiles.

### Modified Capabilities

- `provider-and-parameter-settings`: the provider sections of the settings files only seed the first profiles; provider parameters are no longer fixed for the life of the process; the admitted durations used by segmentation and clip requests come from the active video provider; credentials may also come from the encrypted store.

## Impact

- **Depends on JOS-171** (the active-provider mechanism, PR #86 merged). The archived spec `active-provider-selection` is still in PR #87; once it is merged, its requirement "Only a shipped adapter can be chosen" is reworded as "Only a usable provider can be chosen" (tasks group 1).
- **Backend:**
  - A new `provider_profiles` table, a start-up seed from the settings, and an encrypted key store with a local master key file.
  - The five adapter factories take their parameters and a key loader from a profile; the registries are built from the profiles and rebuilt when one changes.
  - Segmentation, clip-duration and scene-registration code reads admitted durations from the active video provider.
  - Script moderation reads the reasoning role's key.
  - `GET /admin/provider-types`, `GET|POST /admin/provider-profiles`, `PUT|DELETE /admin/provider-profiles/{id}`; JOS-171's `PUT /admin/providers/{stage}` additionally refuses a profile that is not usable.
  - Stage diagnostics show the provider's display name instead of "Unknown provider".
- **Frontend:** the "Providers" section on `/admin`.
- **Docs:** PRD v1.14, `docs/api-spec.yml`, `docs/data-model.md`, `docs/backend-standards.md`, `docs/frontend-standards.md`, `docs/development_guide.md`, the readme's provider section.
- **No change** to existing sessions' bound providers, completed results or recorded attempts.
