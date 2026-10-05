# View progress by phase

Linear-Issue: JOS-168 (US-18)

## Why

The session page shows one line for the session state, a "Failed phase" line, and a flat scene list. It has no section per phase, which §8.3 and AC21 require. Two parts of the data are also missing:

- **A phase failure has no visible cause (AC4).** When the voice-over or the decomposition fails, the session stores `{ phase, cause, retryable, occurredAt }`, but the session read exposes only `failedPhase`. The User learns which phase failed but not why.
- **A retried phase still reads `failed` (AC5).** A failure is cleared only when the retry *succeeds*. While a retry of the timestamps stage is running, the session still derives `failed`, not `chunk-decomposing`. §8.1 says a manual retry returns the session to the in-progress state of the retried phase.

Live updates (AC2), the failed phase (AC3), and the per-scene error and actions are already in place. They came from `consult-session` (JOS-135), `define-live-updates` (JOS-183), `gate-assembly-on-complete-scenes` (JOS-150) and `show-scene-results-and-actions` (JOS-151). This change organizes them by phase and fills the two gaps.

## What Changes

- **Phase list in the session read**: the session representation gains `phases`, always the four phases in pipeline order: `voice-over`, `decomposition`, `scenes`, `assembly`. Each entry has:
  - a `status` of `pending`, `in-progress`, `complete` or `failed`, derived from the session state and the failed phase. It is never stored.
  - the number of work units held by a pause, taken from the same derivation as `held`.
  - for a failed voice-over, decomposition or assembly phase, the failure's `cause` and `retryable`.

  The same `phases` value travels in every live-update snapshot.
- **A retry in flight is shown as in progress**: when the session's recorded failure belongs to a phase that has an attempt in flight, started after the failure, the session derives that phase's in-progress state (`voice-over-generating`, `chunk-decomposing`). The failure stays recorded for diagnostics (US-34) and is cleared only on success, as today. Scene retries already behave this way (`chunks-processing`) and are pinned by a test.
- **One section per phase on the session page**: four labelled sections in pipeline order. Each shows its status, the paused or held marker when it applies, and, when it has failed, its error and the applicable actions.
  - The scene list moves into the Scenes section and keeps its per-scene errors and actions (JOS-151).
  - The final-video download moves into the Final video section.
  - The session header keeps the session state, the paused marker, the failed phase and failed scenes, and the pause and continue buttons.
- **Actions per phase come from one function**, `phaseActions`, which mirrors `sceneActions`. For a failed voice-over, decomposition or assembly phase it returns no actions, because no manual-retry endpoint for those phases exists yet (US-23 to US-27). Those stories extend this function.

## Capabilities

### New Capabilities

- `session-phase-progress`: what the session read says about each processing phase, and what the session page shows per phase. It covers:
  - the ordered phase list and how each phase's status is derived;
  - the failure cause and retryability per phase;
  - held work per phase;
  - the in-progress state while a failed phase is retried;
  - the per-phase sections, with their errors and applicable actions;
  - live refresh of those sections without reloading.

### Modified Capabilities

None. `frontend-foundation` already requires documented accessible names for phase sections, and this change supplies them without changing that requirement. `live-updates-foundation` is used as it is. `session-consultation`, `scene-detail-view`, `scene-completion-gate` and `session-pause` are not archived into `openspec/specs/`, so there is nothing to modify in them. This change stays consistent with all four.

## Impact

- **Backend**:
  - `orchestrator.ts`: `deriveSessionState` gains the retry-in-flight rule, and a new pure function `derivePhaseProgress` feeds `toSnapshot`.
  - `routes.ts`: the session response schema gains `phases`.
  - No migration, no new endpoint, no new stored field.
- **Frontend**:
  - A new `PhaseSection` component and a new `phaseActions` module.
  - `SessionPage.tsx` is reorganized into the sections; `types.ts` gains `phases`.
- **API contract**: `docs/api-spec.yml` gains the `phases` field (additive, not breaking).
- **Documentation**:
  - `docs/frontend-standards.md`: accessible names for the phase sections.
  - `docs/data-model.md`: `phases` is derived, never stored.
- **Depends on**: nothing unmerged for what it builds.
- **Relationship to open work**:
  - **`assemble-final-video` (JOS-149, PR #25, open)** records assembly attempts but no session-level assembly failure. The Final video section therefore shows `failed` only once a session can derive `failedPhase: "assembly"`. This change accepts that value and does not invent the failure.
  - **`generate-voice-over` (JOS-136)** still owns deriving `voice-over-generating` and its own `failure` field. `phases` reads from whatever state the derivation produces.
  - **Manual-retry endpoints (US-23 to US-27)** add the voice-over, decomposition and assembly actions through `phaseActions`.
- **Out of scope**:
  - diagnostics, provider and attempt history (US-34);
  - per-phase timings;
  - any new retry endpoint;
  - tabs (sections are used; see design).
