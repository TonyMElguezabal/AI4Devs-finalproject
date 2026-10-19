# Configure providers and parameters in configuration files

Linear-Issue: JOS-174

## Why

Every provider and generation parameter is compiled into `backend/src/config/providers.ts` (PRD §11, `define-provider-configuration`, JOS-165). To change any of them today — a voice, a per-phase maximum time, a request cap re-measured after a plan upgrade — someone has to edit source and ship a new build. Several of these values are marked provisional in the code and in PRD §11.3, so they are expected to change. US-39 moves them into configuration files that can be edited on an installed copy and take effect after a restart.

## What Changes

- **New settings files.** The app ships a default settings file holding today's values. An optional settings file in the per-user data folder overrides any subset of them. The two are merged once, at start-up, and the result is fixed for the life of the process. A change takes effect after a restart, never while the app is running.
- **Configurable values** (the AC3 list, no more):
  - The provider for each of the five stages (reasoning, voice, alignment, image, video), with its model or endpoint identifier. Each stage has exactly one active provider. The name must match an adapter the app ships, and today each stage has only one.
  - The video provider's admitted durations (minimum and maximum).
  - Narration voice, quality (the output format) and speed.
  - The segmentation lower bound, the acceptable speed-factor limit, and each stage's maximum time.
  - The final output's resolution and frame rate.
  - The supported script languages.
  - Each stage's maximum simultaneous requests.
- **Start-up validation.** If the merged settings are missing a value, have an empty or wrongly typed value, contain an unknown key, or are inconsistent, the app refuses to start and lists **every** problem, not just the first one. For example, a segmentation lower bound shorter than the video provider's shortest admitted duration is inconsistent. An unknown key covers typos, and it also rejects any credential-looking field: credentials still load only from the environment or the local secrets file.
- **Same names for the code that reads these values.** `providers.ts` still exports the same constants, now filled from the validated settings instead of literals. The 23 modules that import from it keep working; only the five places that turn a maximum time into a timeout change, so that a stage with no maximum is not timed (design Decision 3).
- **Still hardcoded.** Values outside the AC3 list keep their current literals: script moderation, image generation size, the video generation tier, the retry budget and delays, and the not-retryable failure flag.
- **Deferred:** the Administrator password. Nothing would read it until `/admin` and the Administrator role exist, so the story that adds them also adds the password setting and its start-up check (product owner decision, 2026-10-19).
- **PRD change, v1.9 → v1.10:** §2.1, §2.3 and §11 change from "hardcoded, no configuration files" to "configured in local settings files, restart to apply". §11.3's values become the shipped defaults. This version needs the product owner's approval before it is merged.

## Capabilities

### New Capabilities

- `provider-and-parameter-settings`: where providers and parameters come from (shipped defaults plus an optional per-user override), when a change takes effect (only after a restart), the start-up check that lists every problem and refuses to start, the exclusion of credentials, and the guarantee that a changed setting does not rewrite established sessions, chunks or provider bindings (§11.2).

### Modified Capabilities

- `clip-duration-request`: requested durations come from the **configured** admitted durations, not hardcoded ones. Selection behaviour is unchanged.
- `stage-execution-time-limit`: each stage's maximum time comes from the settings. A stage with no configured maximum is not timed, which replaces "not yet defined in the constants module".

## Impact

- **Code**: new `backend/config/settings.default.json`, plus a settings loader and validator using the already-installed `zod`. `backend/src/config/providers.ts` derives its exports from the loaded settings, and `routes.ts`'s language enum reads the configured list. No new dependency.
- **Start-up**: `npm start` and the packaged app fail fast with a list of every problem when the settings are invalid. Tests run against the shipped defaults unless they point the override path elsewhere.
- **API**: no new endpoint. The `language` enum in the generated OpenAPI document follows the configured list, so `docs/api-spec.yml` documents it as configured.
- **Data**: no schema change. New image and video bindings store the provider name instead of the model or endpoint (design Decision 7); the registries still resolve the one value earlier builds wrote. Existing sessions keep their recorded intervals, requested durations, speed factors and provider bindings when settings change (§11.2).
- **Docs**: PRD v1.10 (§2.1, §2.3, §11, §16 change log), `docs/backend-standards.md` "Constants" rule, `docs/development_guide.md` (where the settings files live and how to change them), and ADR 0005 gets a pointer to where its values now live.
- **Relationship to JOS-194** (`define-production-deployment`): the per-user override file lives next to the credentials file and the database. This change reads its path the same way `DB_PATH` is read, so when JOS-194 moves the defaults to the OS application-data folder, this path moves with them.
- **Security**: no credential is ever read from or written to a settings file. The unknown-key check rejects such a field at start-up.
