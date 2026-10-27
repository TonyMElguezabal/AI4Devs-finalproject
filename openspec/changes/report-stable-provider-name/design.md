## Context

Telemetry records provider calls in two places in `backend/src/db.ts` (add-observability-telemetry, JOS-199, Decision 4):

- `reportStageAttempt` (voice-over, timestamps, decomposition, assembly) sends `row.provider_id ?? "unknown"`.
- `reportProviderRequest` (image, clip) sends `scenes.provider` or `scenes.video_provider`, `?? "unknown"`.

What those columns hold today:

| Stage | Stored identifier | Source |
|---|---|---|
| decomposition | `openai-decomposition` (seeded profile id) or an `/admin` ULID | `bindReasoningProviderFor` |
| voice-over | `ElevenLabs` or a ULID | voice binding |
| timestamps | `elevenlabs-native` (not a profile) or the alignment profile id / ULID | `narrationTimestampsPhase.ts` |
| image | `Fal.ai`, a ULID, or legacy `fal-ai/flux/dev` | `scenes.provider` |
| video | `RunningHub`, a ULID, or legacy `/openapi/v2/minimax/hailuo-h3/image-to-video` | `scenes.video_provider` |
| assembly | `null` (local ffmpeg; `orchestrator.ts`) | — |
| stubs | `stub-image-provider`, `stub-video-provider`, `stub-voice` | tests and offline runs |

So the `unknown` series the ticket asks about is the assembly stage, not a recording bug.

`stageDiagnostics.describeProvider` maps these identifiers for the page, but since manage-providers-from-admin (JOS-218, Decision 8) it returns the profile's `label`, which a person types and can rename on `/admin`. Every profile has an `adapter_type` from the fixed set in `providerTypes.ts` (`PARAMETER_SHAPES`), and each adapter type belongs to exactly one vendor, because the adapter holds the vendor's host.

## Goals / Non-Goals

**Goals:**

- One fixed `provider` value per vendor in every provider metric and error record.
- No stored identifier, ULID, endpoint path, model name or admin label leaves the app through `provider`.

**Non-Goals:**

- No new attribute key (the relay allowlist stays as it is) and no model label.
- No change to the diagnostics screen or to what the database stores.
- No migration of series already in Grafana.

## Decisions

### Decision 1: The vendor comes from the profile's adapter type, not from the diagnostics label

Add `ADAPTER_VENDORS: Record<keyof typeof PARAMETER_SHAPES, string>` to `providerTypes.ts`: `openai-reasoning` → `OpenAI`, `elevenlabs-voice` and `elevenlabs-alignment` → `ElevenLabs`, `fal-image` → `Fal.ai`, `runninghub-video` → `RunningHub`. Keyed by the shapes' keys, a new adapter type does not compile until it names its vendor.

*Alternative:* `describeProvider(stage, id).name`, as the ticket's AC1 suggests. Rejected: since JOS-218 that name is the profile's editable label, so it changes when someone renames a profile and would send typed text to telemetry. The values for the seeded profiles are the same names the ticket lists, so the dashboards read as the ticket intends.

### Decision 2: One resolver in `db.ts`, used by both report functions

A private `telemetryProviderOf(identifier: string | null, stage: string): string` in `db.ts`:

1. `null` and stage `assembly` → `local`.
2. `elevenlabs-native` → `ElevenLabs`.
3. An identifier starting `stub-` (`stub-image-provider`, `stub-video-provider`, `stub-voice`) → `stub`. A prefix, not three imported names: `videoProvider.ts` is heavy to import from `db.ts`, and no profile id can start with `stub-` (seeded ids are fixed names, added ones are ULIDs).
4. The two legacy identifiers → their seeded profile id (`SEEDED_PROFILES.image.id`, `SEEDED_PROFILES.video.id`). The two strings are copied into `db.ts` as literals, because `config/providers.ts` loads the settings file when imported; a test pins them to `LEGACY_IMAGE_PROVIDER_IDENTIFIER` and `LEGACY_VIDEO_PROVIDER_IDENTIFIER`.
5. `SELECT adapter_type FROM provider_profiles WHERE id = ?` → `ADAPTER_VENDORS[adapter_type]`.
6. Anything else → `unknown`.

It reads the table directly instead of calling `getProfile`/`resolveProfileId`, because `providerProfiles.ts` and `keyStore.ts` import `db.ts`. Both report functions already run inside the telemetry `try`, so a lookup failure can never fail the write.

*Alternative:* a separate module in `telemetry/`. Rejected: it would need the database too, and `telemetry/index.ts` is imported by `db.ts`.

### Decision 3: Assembly reports `local`, stubs report `stub`

Assembly attempts are part of the provider-usage metrics by spec (JOS-199), so they keep being counted; `local` says what they are instead of hiding them in `unknown`. `unknown` then means only an identifier nothing maps, which is worth noticing on a dashboard.

### Decision 4: Grafana panels stay as they are

Every `providers.json` query groups by `provider` and none filters on a value, so a re-import shows one series per vendor without editing a panel. The README lists the possible values.

## Risks / Trade-offs

- [The legacy constants live in `config/providers.ts`, which loads the settings at import, so `db.ts` cannot import it without that side effect (checked in task 1.2)] → The two strings are copied into the resolver with a comment pointing to their source and pinned by a test (Decision 2).
- [A profile removed from `provider_profiles` while attempts still name it] → It reports `unknown`. `providerAdmin.ts` retires, rather than removes, a profile that attempts or scenes still use, so its row and adapter type stay and this should not happen.
- [A one-row lookup per reported call] → One indexed primary-key read, only when consent is on; negligible next to a provider call.
- [Old series remain in Grafana] → They expire with retention; the ticket accepts this.
