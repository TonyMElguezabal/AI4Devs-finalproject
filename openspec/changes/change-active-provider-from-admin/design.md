## Context

Today each of voice, image and video has an adapter registry `{ defaultIdentifier, adapters }` (`voiceProvider.ts`, `imageProvider.ts`, `videoProvider.ts`) and binds on its first attempt with a conditional write that only succeeds while the binding is unset:

| Stage | Binding | Bind point |
|---|---|---|
| voice | `runs.voice_provider_id` | `bindVoiceProvider` (`db.ts`), `voiceOverPhase.ts` |
| image | `scenes.provider` (unbound sentinel = stub name) | `bindSceneImageProvider`, `orchestrator.ts` |
| video | `scenes.video_provider` | `bindSceneVideoProvider`, `orchestrator.ts` |

Every bind point passes `registry.defaultIdentifier`. Retries read the stored binding, or `attempt.providerId`, so they already stay on the bound provider.

Reasoning and alignment have no registry and no binding. `decompositionPhase.ts` records `providerId: "openai-decomposition"` and `narrationTimestampsPhase.ts` records `"elevenlabs-forced-alignment"` (or `"elevenlabs-native"` when the voice provider's timestamps are used) on `stage_attempts`, and both call their adapter directly.

The registry keys differ by stage: voice is keyed by provider name, image by model id (`fal-ai/flux/dev`) and video by endpoint path. Stored bindings use those keys.

Prerequisites, neither merged yet:

- **JOS-173** adds `/admin` and its Administrator password gate.
- **JOS-174** adds the settings files that name each stage's provider.

Product owner decisions, 2026-10-19:

- A provider chosen on `/admin` is stored in the database, overrides the files and applies live.
- All five stages can be switched.
- This change ships the mechanism only, proven with stub adapters.

## Goals / Non-Goals

**Goals:**

- One function, `activeProviderId(stage)`, decides the provider at every bind point.
- Reasoning and alignment get registries and per-session bindings, so all five stages follow the same rule.
- An Administrator-only API and a `/admin` section to read and change the active provider.

**Non-Goals:**

- A second real provider for any stage (a separate ticket with its own spike).
- Moving a failed bound stage to the active provider (JOS-172).
- Changing any other parameter from `/admin`.
- The `/admin` page shell and the password gate (JOS-173).

## Decisions

### Decision 1 — Keep each registry's existing identifiers; drop `defaultIdentifier`

Adapter ids stay as they are stored today, so existing bindings and attempt rows keep resolving without a data migration:

- voice: the provider name
- image: the model id
- video: the endpoint path
- reasoning: `"openai-decomposition"`
- alignment: `"elevenlabs-forced-alignment"`

Each registry entry gains a `label` (the provider name from JOS-174's settings) for display. `defaultIdentifier` is removed. The settings-file default is resolved by matching `providers.<stage>.name` against the entries' labels.

**Alternative:** re-key every registry by provider name. Rejected: that needs a migration that rewrites stored bindings and attempt rows, for no behaviour gain.

### Decision 2 — `active_providers` table, read on every bind

The table is `active_providers(stage TEXT PRIMARY KEY, provider_id TEXT NOT NULL, changed_at TEXT NOT NULL)`. `activeProviderId(stage)` returns the row's `provider_id` when the row exists and the registry has that adapter. Otherwise it returns the settings-file default. It reads SQLite directly with no cache, so a change applies to the next bind with no restart and no invalidation logic. A bind happens about once per stage instance, so the read cost does not matter.

If a stored choice names an adapter the current build no longer ships, for example after an app update, `activeProviderId` falls back to the settings default and logs a warning once. `GET /admin/providers` then reports the source as "settings files" and lists the orphaned choice. The app still starts.

**Alternatives:** an in-memory value with write-through. That adds cache invalidation for nothing. Writing the change to the settings override file was rejected by the product owner, because it needs a restart.

### Decision 3 — Reasoning and alignment bind per session

The migration adds `runs.decomposition_provider_id` and `runs.alignment_provider_id`, both nullable. They are bound with the same conditional `UPDATE … WHERE … IS NULL` as `bindVoiceProvider`, followed by a re-read, in two places:

- `decompositionPhase.ts`, at the first decomposition attempt
- `narrationTimestampsPhase.ts`, at the first attempt that actually calls alignment. Using native timestamps binds nothing, because no alignment provider is called.

Retries read the binding, or the attempt's `providerId`, exactly as voice does.

The same migration backfills both columns for existing runs from their earliest `stage_attempts.provider_id` of that stage, ignoring `elevenlabs-native`. A session that was mid-retry before the upgrade therefore stays on the provider it started with.

### Decision 4 — Every bind point calls `activeProviderId(stage)`

The five bind points replace `registry.defaultIdentifier` with `activeProviderId(stage)`. Everything after the bind already re-reads the stored binding, so a race between two first attempts across a change resolves to whichever bind wrote first (spec "Two first attempts race"). No code path reads the active provider for a stage instance that is already bound. That gives AC3 and AC5 with no extra logic. Tests prove it.

### Decision 5 — API

- **`GET /admin/providers`** returns, for each of the five stages: `activeProviderId`, `activeLabel`, `source: "settings" | "admin"`, `selectable: [{ id, label }]`, and `orphanedChoice` when there is one.
- **`PUT /admin/providers/{stage}`** takes `{ providerId }`. The `stage` path parameter is a zod enum of the five stages, and `providerId` must be one of that stage's adapter ids, otherwise the response is `400` with the selectable ids. On success the row is upserted and the response is the stage's new view (`200`). Sending the settings default again stores it as an `/admin` choice. Clearing a choice is not offered (YAGNI), because choosing the default has the same effect.
- **Access:** both routes sit behind JOS-173's Administrator gate, so a request without Administrator access gets `401` and nothing is written. This change adds no authentication of its own.

### Decision 6 — `/admin` section

The section is one row per stage: the stage name, a `<select>` of the selectable providers set to the active one, and a "from settings files" or "set on /admin" hint. A change sends the `PUT` and shows the returned view. A stage with a single option shows its select disabled. It lives in the page JOS-173 creates and uses that page's access state. It does not use live updates: the Administrator is the only writer.

### Decision 7 — Stub adapters for proof

Tests and the E2E step register two stub adapters (`stub-a`, `stub-b`) per stage through the existing `set…ProviderRegistry` seams, plus new ones for reasoning and alignment. Real registries keep one adapter each.

## Risks / Trade-offs

- **The `/admin` selector is a single-option list for every stage until a second real provider ships.** → Accepted by the product owner. A follow-up ticket adds a verified second provider.
- **A changed active provider can carry different parameters**, such as admitted durations, that JOS-174 configures once per stage rather than per provider. → Until a second real provider exists there is nothing to vary. The follow-up ticket must decide where per-provider parameters live, for example under `providers.<stage>.<id>` in the settings. Recorded as an open question.
- **The backfill guesses the provider from the earliest attempt.** → Only one real adapter per stage has ever existed, so the guess cannot be wrong for real sessions.
- **Depends on two unmerged changes.** → Tasks group 1 refuses to start until both are on the integration branch, and updates this design if their final shape differs.

## Migration Plan

1. An additive migration creates `active_providers`, adds the two `runs` columns and backfills them. Rollback by reverting: the new columns are ignored by the old code.
2. With no `/admin` choice, behaviour is identical to JOS-174's.

## Open Questions

- Where per-provider parameters (admitted durations, voice id, model) live once a stage has two real providers. Deferred to the second-provider ticket.
- Should the PRD record the active-provider history (who changed what, when) for diagnostics? Not required by AC1–AC5. `changed_at` is stored, but there is no history.
