# Design — See provider and attempts per stage

## Context

What is stored today, on `feature/entrega-2-JAME` plus this branch's parent, `view-progress-by-phase` (JOS-168, proposed):

| Stage | Provider recorded in | Attempts recorded in | Reaches the page |
|---|---|---|---|
| Image | `scenes.provider`, bound once (`bindSceneImageProvider`). Holds the placeholder `stub-image-provider` until bound. The real value is `IMAGE_PROVIDER.model` (`fal-ai/flux/dev`). | One `provider_requests` row per attempt, `stage = 'image'`. `scenes.attempts` is the current attempt number. | `provider` and `attempts` on the scene, both misleading (see proposal) |
| Clip | `scenes.video_provider`, bound once. The value is `VIDEO_PROVIDER.endpoint`. | One `provider_requests` row per attempt, `stage = 'video'`. `scenes.attempts` is reset to 0 at clip start. | no |
| Voice-over | `runs.voice_provider_id`, plus `stage_attempts.provider_id` | `stage_attempts`, `stage = 'voice-over'`. JOS-136 records these; its phase code is not on the integration branch yet. | no |
| Timestamps | `stage_attempts.provider_id`: `elevenlabs-native` or `elevenlabs-forced-alignment` | `stage_attempts`, `stage = 'timestamps'` | no |
| Instructions (decomposition) | — | **nothing**. `registerDecomposition` calls `generator.generate` without a record. | no |
| Assembly | `stage_attempts.provider_id = null`: no external provider (JOS-149, PR #25) | `stage_attempts`, `stage = 'assembly'` | no |

`stage_attempts` rows also hold `external_request_id`, `error_code` and `error_message`, and `provider_requests` rows hold the provider mode and latency. The configuration (`config/providers.ts`) holds display names and models. Credentials live only in `backend/.secrets.json` and the environment, never in a record.

## Goals / Non-Goals

**Goals:**
- Every stage that has run shows its provider and its attempt count, in the view where the User already looks: scene details, or the phase section.
- The values come from the stored records, so they are correct after a restart and across retries.
- A rule enforced by a test keeps every other field of the attempt records out of the representation.

**Non-Goals:**
- Per-attempt timelines, outcomes or timings.
- Per-cycle counts (JOS-184).
- Showing provider error messages. The person-readable failure cause is already shown (JOS-151, JOS-168).

## Decisions

**Decision 1 — Diagnostics are derived on read from the attempt records, not counters.**
- An image or clip `attempts` value is the count of that scene's `provider_requests` rows for that stage.
- A session-level `attempts` value is the count of `stage_attempts` rows for the session and stage.

In-flight attempts count, because a request was sent. Both stores are append-only, so the count only grows and survives restarts and manual retries.

*Alternative rejected:* `scenes.attempts`. It is the current cycle's attempt number, and it resets when the clip stage starts and again on each manual retry. It answers "which attempt is this", not "how many attempts were made".

**Decision 2 — The provider shown is a display value from configuration, looked up by the stored identifier.**
`describeProvider(stage, identifier)` lives in a new pure module, `stageDiagnostics.ts`. It returns `{ name, model }` from `config/providers.ts`:

| Stage | Stored identifier | name | model |
|---|---|---|---|
| image | `fal-ai/flux/dev` | Fal.ai | fal-ai/flux/dev |
| clip | `VIDEO_PROVIDER.endpoint` | RunningHub | minimax/hailuo-h3 |
| voice-over | voice provider id | ElevenLabs | eleven_multilingual_v2 |
| timestamps, native | `elevenlabs-native` | ElevenLabs | native timestamps |
| timestamps, alignment | `elevenlabs-forced-alignment` | ElevenLabs | forced alignment |
| instructions | `DECOMPOSITION_PROVIDER.model` | OpenAI | gpt-6-astra |
| assembly | `null` | Local assembly | ffmpeg |
| any stage | the stub identifiers | Stub provider | the identifier |

The clip's model is a fixed label in the module, because the endpoint path is not shown (Decision 4).

An identifier with no entry is returned as `{ name: "Unknown provider", model: null }` and logged. The raw stored value is never echoed. A test checks that every identifier the code can bind has an entry.

The image provider is shown only once it is bound: the placeholder `stub-image-provider`, with no image attempt behind it, means the stage has not run. A stub provider that has actually run (tests, the skeleton) has `provider_requests` rows and is shown as "Stub provider".

For the timestamps stage, the provider shown is the latest attempt's. If an earlier attempt was native and the latest is alignment, the stage shows alignment, which is the mechanism in use (§11.1). The attempt count includes both.

*Alternative rejected:* showing the stored identifier as is. The values mix a model id, an endpoint path and internal ids. They are not readable, and the endpoint path is configuration detail the User does not need.

**Decision 3 — Record the instruction call as a `stage_attempts` row with stage `instructions`.**
`registerDecomposition` takes these steps:

1. Before calling `generator.generate`, it records an in-flight attempt: provider `DECOMPOSITION_PROVIDER.model`, `queuedAt` = `sentAt` = now.
2. After the call, it completes the attempt with `success`, `transient` or `not-retryable`. An `invalid_output` result counts as `transient`, because that is how its failure is already classified as retryable.

The person-readable reason goes in `error_message`, as the timestamps stage does. The stage is named `instructions`, not `decomposition`, because the decomposition phase has two provider stages: timestamps and instructions. A phase name would make the two ambiguous.

This new in-flight record also completes JOS-168's retry rule. While a decomposition failure is being retried, the in-flight attempt may be an `instructions` attempt rather than a `timestamps` attempt. So the decomposition row of JOS-168's Decision 5 checks the latest attempt of *either* stage. That is stated as a requirement here and tested (task 3).

*Alternative rejected:* a new table. `stage_attempts` already has the right shape, the store-enforced attempt numbering, and the outcome check.

**Decision 4 — A closed allow-list, enforced by a test.**
A stage diagnostic is exactly `{ stage, provider: { name, model }, attempts }`. The Zod response schemas declare those fields and use `.strict()` for them, so a field added by mistake fails validation in tests.

A test builds a session whose attempt records carry sentinel values in every free-text column: `external_request_id`, `error_code`, `error_message`, `mode`. It then asserts:
- none of the sentinels appears anywhere in the serialized session read or the live snapshot;
- the configured credential values (from a test secrets fixture) and `VIDEO_PROVIDER.endpoint` appear nowhere in them either.

*Alternative rejected:* filtering confidential fields out (a deny-list). A new column would leak by default.

**Decision 5 — Where the diagnostics sit in the representation.**
- **Scene**: `stages: { image?: StageDiagnostic; video?: StageDiagnostic }`. A key is present once that stage has at least one attempt.
- **Phase entry**: `stages: StageDiagnostic[]`, in pipeline order:
  - voice-over: `voice-over`;
  - decomposition: `timestamps`, then `instructions`;
  - scenes: none;
  - assembly: `assembly`.

  A stage appears once it has at least one attempt.

The scene's old `provider` and `attempts` are removed rather than kept beside `stages`. Two sources for the same fact would disagree as soon as the clip stage starts.

**Decision 6 — The page renders the diagnostics in the existing views, read-only.**
- **Scene details** (`SceneRow.tsx`): the current single `Provider` and `Attempts` rows are replaced by one row per present stage:
  - `Image: Fal.ai (fal-ai/flux/dev), 2 attempts`;
  - `Clip: RunningHub (minimax/hailuo-h3), 1 attempt`.

  The terms carry accessible names (`Scene {n} image diagnostics`, `Scene {n} clip diagnostics`).
- **Phase sections** (`PhaseSection.tsx`): a `Stages` list with one line per stage, labelled `Voice-over`, `Timestamps`, `Scene instructions` or `Assembly`.

No action is attached. A stage with no attempt is not listed, and an empty list renders nothing rather than a "no data" message.

## Risks / Trade-offs

- **[The stacked parent is not implemented yet]** → AC3 renders inside JOS-168's phase sections and extends its phase entries. Task 1 blocks implementation until JOS-168's tasks are done on the parent branch. If JOS-168's payload shape changes, this design is updated first.
- **[Stacked PR merge gap]** → Merging this PR folds it only into `feature/jos-168-view-progress-by-phase`. The close-out asks the user to retarget this PR to `feature/entrega-2-JAME` after #168 merges, or to open a follow-up PR.
- **[Overlap with JOS-149 (PR #25) and JOS-136]** → Both add attempt stages (`assembly`, `voice-over`). This change reads any stage generically. Task 1 re-checks whether JOS-149's migration made `provider_id` nullable, which assembly's `null` provider depends on.
- **[A counted in-flight attempt that never completes]** → Boot reconciliation completes orphaned attempts (JOS-145, JOS-152). The count is "requests sent", which stays true either way.
- **[Configuration renames a model]** → The display reads the stored identifier, so old sessions keep their own provider. A renamed identifier with no entry shows "Unknown provider" and is logged, never echoed. The coverage test catches a missing entry for the current configuration.

## Migration Plan

No schema migration. `stage_attempts.stage` is free text, and `instructions` rows start appearing on the next decomposition. Sessions decomposed before this change show no `instructions` stage, which is accurate: no attempt was recorded. Rollback means reverting the code. Leftover `instructions` rows are harmless to older code, which reads attempts only by named stage.

## Open Questions

- Should the voice-over stage show `runs.voice_provider_id` (the bound provider) when no attempt row exists, for example when a credential was missing and the failure happened before the request? The current decision is no: no attempt means the stage has not run. Revisit when JOS-136 lands.
