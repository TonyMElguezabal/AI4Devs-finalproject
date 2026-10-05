# See provider and attempts per stage

Linear-Issue: JOS-166 (US-34)

## Why

PRD §3 requires every stage to keep the provider it used and the attempts it made, and to show them to the User so failures can be understood without exposing credentials or confidential data. Scene details show them in each scene; session-level stages show them in each phase's section. Most of the records already exist, but what reaches the page is wrong or missing:

- **Scene details show one `provider` and one `attempts` for two stages (AC1, AC2).**
  - `provider` is only the image provider. Before the image stage binds a provider, it holds the store's placeholder value `stub-image-provider`, which is not the provider that will be used.
  - `attempts` is a single counter that resets to 0 when the clip stage starts, so the image attempts disappear once the clip begins.
  - The clip's provider (`videoProvider`) is stored but never exposed.
- **Session-level stages show nothing (AC3).**
  - Voice-over, timestamps (native or forced alignment) and assembly record one attempt row per call in `stage_attempts`, but none of it reaches the session read.
  - The decomposition's call to the reasoning provider, which writes the `IMAGE` and `VIDEO` instructions, records no attempt at all.
- **No rule says what may be shown (AC4).** The attempt records hold provider error messages, external request ids and raw error codes. Nothing yet says which of those may reach the page.

## What Changes

- **Per-stage diagnostics on each scene**: the scene representation gains `stages.image` and `stages.video`. Each stage that has run carries:
  - `provider`: a readable name and model from the provider configuration;
  - `attempts`: the number of attempts recorded for that stage, across every retry cycle.

  A stage that has not run is absent.
- **BREAKING (internal API)**: the scene's top-level `provider` and `attempts` are removed. They are replaced by `stages`, and their only consumer, the scene details panel, moves to the new fields. No consumer outside this repository reads the session representation.
- **Per-stage diagnostics on each phase**: each phase entry introduced by `view-progress-by-phase` (JOS-168) gains `stages`, listing the session-level stages that have run in that phase:
  - Voice-over phase: `voice-over`;
  - Decomposition phase: `timestamps` (native or forced alignment) and `instructions` (the reasoning provider);
  - Final video phase: `assembly`, shown as local assembly with no external provider.

  Each stage carries the same `provider` and `attempts`. The Scenes phase has no session-level stage.
- **Record decomposition instruction attempts**: the call to the reasoning provider records an attempt row (stage `instructions`) before it is sent, and records its outcome. This is the same append-only record the other session-level stages already use.
- **A closed allow-list for diagnostics**: the only fields that leave the backend are the provider's display name, its model, and an attempt count. Credentials, API keys, request headers, external request ids, raw provider error codes and messages, and endpoint URLs are never part of the representation. Tests check every diagnostic field against that list.
- **The page shows them**:
  - Scene details list the provider and attempts per stage, `Image` and `Clip`.
  - Each phase section lists its stages with provider and attempts.

## Capabilities

### New Capabilities

- `stage-diagnostics`: which provider each stage used and how many attempts it made, for scene stages and session-level stages. It covers:
  - how both values are derived from the stored records;
  - the recording of the decomposition instruction attempts;
  - the allow-list that keeps credentials and confidential data out;
  - where the page shows the diagnostics.

### Modified Capabilities

None. The scene and phase representations this change extends belong to `scene-detail-view` (JOS-151) and `session-phase-progress` (JOS-168), neither of which is archived into `openspec/specs/`. This change is stated against them as they stand on this branch.

## Impact

- **Backend**:
  - `orchestrator.ts`: `sceneToPayload` builds `stages`; `toSnapshot` adds stage diagnostics to each phase entry.
  - A new pure module `stageDiagnostics.ts` maps stored provider identifiers to display names and holds the allow-list.
  - `db.ts`: one read that counts `provider_requests` per scene and stage, and the existing `getStageAttempts`.
  - `sceneRegistration.ts`: records the `instructions` attempt.
  - `types.ts`: `AttemptStage` gains `instructions`.
  - `routes.ts`: response schemas.
  - No migration: `stage_attempts.stage` is free text.
- **Frontend**: `types.ts`, `SceneRow.tsx` (per-stage rows instead of the single provider and attempts) and `PhaseSection.tsx` (from JOS-168).
- **API contract**: `docs/api-spec.yml`. Scene `provider` and `attempts` are removed and `stages` is added; phase entries gain `stages`.
- **Depends on**:
  - **`view-progress-by-phase` (JOS-168)**: implemented first. This branch stacks on it, because AC3 renders inside its phase sections.
  - **`generate-voice-over` (JOS-136)**: voice-over attempts appear once JOS-136 records them; until then the Voice-over phase shows no stage.
  - **`assemble-final-video` (JOS-149, PR #25)**: assembly attempts appear once it merges.
  - **`bounded-retry-policy` (JOS-184, US-22)**: adds retry cycles. The count shown here is total attempts across cycles, so it stays correct when cycles arrive. A per-cycle breakdown is left to that change.
- **Out of scope**:
  - attempt timelines, timestamps and outcomes per attempt;
  - per-cycle counts;
  - provider error text beyond the failure cause already shown (JOS-151, JOS-168);
  - provider switching (§11.2).
