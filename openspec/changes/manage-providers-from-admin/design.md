## Context

After JOS-174 and JOS-171 the code is organised like this:

- `config/settings.ts` validates the settings files once; `config/providers.ts` freezes the result into constants (`IMAGE_PROVIDER`, `VIDEO_PROVIDER`, `VOICE_PROVIDER`, `DECOMPOSITION_PROVIDER`, `ALIGNMENT_PROVIDER`, `VIDEO_ADMITTED_DURATIONS_SECONDS`, `SEGMENTATION_*_BOUND_SECONDS`).
- Each stage has one adapter factory that reads those constants and loads its key by a vendor name through `loadCredential` (`ELEVENLABS_KEY` for voice and alignment, `OPENAI_KEY` for reasoning and for script moderation, `FAL_API_KEY`, `RUNNINGHUB_API_KEY`). Every factory already takes a `loadKey` seam.
- Each stage has a registry `{ defaultIdentifier, adapters, labels?, aliases? }`, and `activeProviderId(stage)` (`activeProvider.ts`, JOS-171) picks the adapter id a stage binds to: the `/admin` choice in `active_providers`, else `defaultIdentifier`.
- Bound ids stored today: voice, image and video by provider name (`ElevenLabs`, `Fal.ai`, `RunningHub`, plus the legacy model and endpoint aliases for the last two); reasoning `openai-decomposition`; alignment `elevenlabs-forced-alignment`.
- The settings schema accepts one provider name per stage and its parameters: reasoning `model`; voice `model`, `voiceId`, `voiceName`, `outputFormat`, `speed`; alignment `endpoint`; image `model`; video `endpoint` and `admittedDurationSeconds`.
- `/admin` (JOS-173) is a child plugin behind `registerAdminGate`; JOS-171 adds `GET /admin/providers` and `PUT /admin/providers/{stage}` and an "Active providers" section.

Product owner decisions (2026-10-21, with this change): keys entered on `/admin` are stored encrypted in the local SQLite database; the change covers providers, keys and per-provider parameters; the non-provider operational settings (segmentation lower bound, speed limit, maximum times, request caps, resolution, languages) stay in the settings files.

## Goals / Non-Goals

**Goals:**

- The Administrator adds, edits and deletes providers on `/admin`, edits each provider's parameters, and enters its API key there.
- The application never names a vendor key: it asks for the stage's role.
- Nothing is re-entered after the upgrade, and no existing binding breaks.
- A provider that is invalid or has no key cannot be made active.

**Non-Goals:**

- A vendor for which the app ships no adapter, and a generic or declarative HTTP adapter described on `/admin`. A second real provider (adapter plus live verification) is JOS-219.
- Letting the Administrator type an endpoint host. Each adapter type keeps its vendor host in code, so a key can only be sent to that vendor.
- Editing the non-provider operational settings on `/admin`.
- Moving a failed stage to another provider (JOS-172) and any automatic switching.
- Strong protection against someone who can read the whole application-data folder (Decision 5).

## Decisions

### Decision 1 — A provider profile is a row; the first profiles keep today's ids

Table `provider_profiles(id TEXT PRIMARY KEY, stage TEXT NOT NULL, adapter_type TEXT NOT NULL, label TEXT NOT NULL, parameters TEXT NOT NULL, api_key_encrypted TEXT, retired_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`. `parameters` is JSON validated by the adapter type's schema. `stage` is one of the five stages JOS-171 uses.

The profile id is what bindings store. The profiles seeded from the settings take the ids already stored in the database (`ElevenLabs`, `Fal.ai`, `RunningHub`, `openai-decomposition`, `elevenlabs-forced-alignment`), so no stored binding or attempt row changes. The legacy image and video aliases (`fal-ai/flux/dev`, the RunningHub endpoint path) stay as aliases of the seeded image and video profiles. A profile the Administrator adds gets a ULID, which never collides with those.

**Alternative:** one table row per stage with a JSON list. Rejected: per-profile retire, key and timestamps are simpler as rows, and `active_providers.provider_id` already references an id.

### Decision 2 — Adapter types are the shipped catalogue, with their own parameter schema

`providerTypes.ts` lists, per stage, the adapter types the build ships: `openai-reasoning`, `elevenlabs-voice`, `elevenlabs-alignment`, `fal-image`, `runninghub-video`. Each entry holds: its stage, a display name, a zod schema for its parameters, a list of field descriptors for the form (key, label, kind `text|number|choice`, required, default, help text), a factory `(parameters, loadKey) => adapter`, and the legacy credential name (`OPENAI_KEY`, ...). The settings schema reuses these parameter schemas, so a rule is written once.

A profile's `adapter_type` must be a type of its stage. The vendor host stays inside each adapter. The Administrator chooses the model, endpoint path, voice and so on, not the host.

**Alternative:** a generic HTTP adapter described by the Administrator. Rejected as a non-goal: it needs request and response mapping, error classification and per-vendor verification, which is what JOS-219 does per vendor.

### Decision 3 — Registries are built from the profiles and rebuilt on every change

The default registry of each stage is built from the stage's non-retired and retired profiles: `adapters[profile.id] = factory(profile.parameters, () => keyFor(profile.id))`; retired profiles stay in `adapters` (so bound retries resolve) but are listed in the new `retired` set, which `selectableProviders` excludes, as it already excludes `aliases`. `defaultIdentifier` is the seeded profile of the stage, so `activeProviderId` is unchanged. Any change to a profile or key calls `rebuildRegistries()`. In-flight calls keep the adapter instance they hold; the next retry resolves the new one, so an edited parameter applies to the next request. The test seams (`set…ProviderRegistry`) keep replacing the registries, and a test that never calls them is unaffected by the profiles.

Reasoning and alignment keep their injected default instance through `resolveBoundAdapter` (JOS-171): the instance injected through `DecompositionDependencies` stands for the stage's seeded profile id.

### Decision 4 — Parameters are read per request; admitted durations come from the active video provider

An adapter is created with its profile's parameters, so every request after an edit uses the new values. What the session has established is not rewritten: requested durations, speed factors, intervals and chunks stay as stored (PRD §11.2).

The video admitted durations are used before a video provider is bound (segmentation and clip-duration request at registration). They are read at that moment from the **active** video provider: `activeVideoDurations()` replaces the start-up constants `VIDEO_ADMITTED_DURATIONS_SECONDS` and `SEGMENTATION_UPPER_BOUND_SECONDS` in `admittedDurations.ts`, `db.ts`, `segmentation.ts`, `clauseSplitting.ts` and `sceneRegistration.ts`. The segmentation lower bound stays a setting.

Cross-check: a video profile whose admitted minimum is longer than the segmentation lower bound is refused at save (the rule JOS-174 applies at start-up, now at save time), and the active-provider change to such a profile is refused.

Edge case: a scene registered under provider A (requested duration 5 s) whose video stage then binds to provider B that does not admit 5 s. The video stage checks the stored requested duration against the active video provider's range **before binding**; if it is not admitted, the scene fails not-retryable with a message naming the duration and the provider, and stays unbound, so the Administrator can switch back and use the normal manual retry. Nothing is regenerated and nothing is sent to the provider.

### Decision 5 — Keys: encrypted in the database, a master key in a separate file

`api_key_encrypted` holds `base64(iv || ciphertext || tag)` from AES-256-GCM (`node:crypto`, random 12-byte IV per write, no new dependency). The 32-byte master key is a file created on first use with mode `0600`, at `PROVIDER_KEY_PATH` (default `data/provider-keys.key`, relative to the backend working directory like the settings override). It is never in the database, the repository or a log.

Honest limit: someone who can read both the database and the key file can decrypt. The encryption protects against the database being copied, shared or backed up on its own, and against a key showing in a casual look at the file. A packaged build should put the key file in a different folder from the database (open question).

Resolution order for a profile's key, in `keyFor(profileId)`: the stored key; else, only for the five seeded profiles, the legacy vendor name from the environment or `.secrets.json` (`loadCredential`). A missing key throws the existing "missing credential" error naming the role, never a value.

**The role API.** `stageApiKey(stage, boundId?)` returns the key of the profile the stage instance is bound to, or of the active profile when none is given: the one entry point the rest of the application uses. The role names `REASONING_APIKEY`, `VOICE_OVER_APIKEY`, `ALIGNMENT_APIKEY`, `IMAGE_APIKEY` and `VIDEO_APIKEY` appear in the error messages and the documentation as the application's vocabulary. No source file other than the key store and the legacy fallback names a vendor key.

**Masking.** The API never returns a key. A profile view carries `keyStatus: "stored" | "environment" | "missing"` and `keyHint`, the last four characters of a stored key of at least 12 characters, else null. The form's key field is never pre-filled; an empty value on save keeps the current key.

**Alternatives:** plaintext in `.secrets.json` (the app would edit a file the user also edits; plaintext at rest), and an unencrypted column. Rejected by the product owner. The operating-system keychain would be stronger but needs a native dependency per platform; deferred.

### Decision 6 — Validation, and what "usable" means

A save validates the adapter type, the parameters (zod, every problem listed with its field path, no value echoed for the key), the label (non-empty, unique within the stage), and the video cross-check of Decision 4. A profile is **usable** when its parameters are valid and `keyFor` resolves. `PUT /admin/providers/{stage}` (JOS-171) refuses a profile that is not usable with a new 409 `{ ok: false, reason: "not-usable", problems }`, and refuses a retired profile as not selectable (400, as for an unknown id).

Because a profile with a missing key can be saved (the Administrator may add the key later), `GET` lists `usable: boolean` and `problems` per profile so `/admin` can say why a profile cannot be chosen.

### Decision 7 — Deleting

`DELETE /admin/provider-profiles/{id}`:

- active for a stage (an `active_providers` row, or the stage's default when there is no row): refused, 409, naming the stage;
- referenced by a binding or an attempt (`runs.*_provider_id`, `scenes.provider`, `scenes.video_provider`, `stage_attempts.provider_id`): the row is **retired** (`retired_at` set, key and parameters kept, never offered again), the answer says `retired`; a retired profile can be removed for good only by a later story;
- otherwise removed, the answer says `removed`.

At least one profile per stage always remains selectable, because the active one cannot be deleted. Retiring keeps the key so a bound stage can still retry.

### Decision 8 — Seeding and the role of the settings files

At start-up, after the migration, `seedProviderProfiles(settings)` inserts the seeded profile of a stage when the stage has no profile at all: id from Decision 1, adapter type from the stage's single shipped type, label from `settings.<stage>.name`, parameters from `settings.<stage>` without `name`. Afterwards the settings' provider sections are no longer read for runtime behaviour; the file still validates as a whole (JOS-174), and when a provider section differs from the seeded profile the app logs one notice that `/admin` owns it. Operational settings keep working as before.

`stageDiagnostics.ts` takes a provider's display name and model from its profile, which removes the "Unknown provider" label for any profile.

### Decision 9 — Admin API

All inside the `/admin` child plugin, behind the gate; the surface test adds `admin/provider-profiles` to its list of deliberate app-level settings routes, as JOS-171 did for `admin/providers`.

- `GET /admin/provider-types`: per stage, the adapter types with their field descriptors and defaults.
- `GET /admin/provider-profiles`: every profile: `id, stage, adapterType, label, parameters, keyStatus, keyHint, usable, problems, active, retired`.
- `POST /admin/provider-profiles` `{ stage, adapterType, label, parameters, apiKey? }`: 201 the profile; 400 `{ ok: false, problems }`.
- `PUT /admin/provider-profiles/{id}` `{ label, parameters, apiKey? }`: 200; 400 problems; 404. The adapter type and stage never change.
- `DELETE /admin/provider-profiles/{id}`: 200 `{ result: "removed" | "retired" }`; 404; 409 naming the stage.

The request body with `apiKey` is never logged: the server's request logging already omits bodies; a test proves a key sent to the API is in neither the log file nor standard output.

### Decision 10 — `/admin` "Providers" section

Under the active-provider selectors: per stage, a list of profiles (label, adapter type, key status with hint, usable or the reason, active, retired hidden), an "Add provider" form chosen by adapter type, and edit and delete buttons per profile. The form is generated from the field descriptors; the key field is a password input that is never pre-filled. A delete answer of `retired` is explained in text. The section uses the access state of the page (`onDenied` on 401).

### Decision 11 — Script moderation uses the reasoning role's key

`scriptModeration.ts` loads its key with `stageApiKey("reasoning")`, the active reasoning profile's key, since the moderation endpoint belongs to the reasoning vendor. Only one reasoning adapter type exists today, so this is the key it already used.

## Risks / Trade-offs

- **A parameter edit changes the next retry of a bound stage.** → Accepted and stated in the spec: the provider is the profile. Established results and stored durations never change.
- **Admitted durations from the *active* provider at registration may differ from the provider the scene later binds to.** → The check-before-bind rule of Decision 4; the scene fails clearly and can be retried after switching back.
- **Encryption key next to the database.** → Documented limit (Decision 5); a separate folder is recommended for packaged builds and tracked as an open question.
- **A wrong key typed on `/admin` fails only when a stage runs.** → No live "test connection" call: each vendor call costs money and the adapters make one request per call by rule. The profile shows `keyStatus` only. Revisit with JOS-219.
- **Registries rebuilt on change while calls are in flight.** → An in-flight call keeps its instance; only the next resolution sees the new one.
- **Large refactor of the five factories and the constants.** → Done stage by stage under tests; existing tests keep passing because defaults equal today's values and the stub seams are unchanged.

## Migration Plan

1. Migration 19 creates `provider_profiles`. Nothing is inserted by SQL.
2. The first start after the upgrade seeds the five profiles from the settings, with today's bound ids, and nothing else changes: no `active_providers` rows are created, keys keep coming from the environment or `.secrets.json`.
3. Rollback by reverting: the table is ignored by the old code, and the old code still reads the settings and the vendor keys.

## Open Questions

- Where a packaged build keeps `provider-keys.key` so it is not next to the database (the application-data folder of each platform).
- Whether a retired profile should be removable for good once nothing references it any more.
- A "test connection" check per vendor, with JOS-219.
- Whether the role names should also be accepted as environment variables for a stage's active profile (not needed by the acceptance criteria, so not built).
