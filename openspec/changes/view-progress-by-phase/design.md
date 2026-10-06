# Design — View progress by phase

## Context

Current state on `feature/entrega-2-JAME` (`ecfe430`):

- **The session read**
  - `toSnapshot` builds the session payload from `deriveSessionState(scenes, run.failure, progress)` (`orchestrator.ts`). The state is never stored.
  - The payload carries `state`, `failedPhase`, `failedSceneIndexes` (JOS-150), `paused`, and `held`, which lists stages with held work from `sessionHeldWork` (JOS-152).
  - `run.failure` (`{ phase, cause, retryable, occurredAt }`, voice-over or decomposition) is stored but never exposed.
- **The failed phase**
  - With no scenes and a recorded failure, the session derives `failed` with `failedPhase: failure.phase` (`"voice-over"` or `"decomposition"`).
  - With scenes, `failedPhase` is `"scenes"`, and only once no scene is still generating (JOS-150).
  - Nothing produces `"assembly"` yet. JOS-149 (PR #25, open) records assembly attempts but no session failure.
- **The retry gap.** `obtainNarrationTimestamps` records an in-flight `timestamps` attempt before it does anything. It clears `run.failure` only on success. So a timestamps retry runs while the session still derives `failed`.
- **The page**
  - `SessionPage` renders `SessionHeader`, title, script, `SceneList` and `FinalVideoDownload`, all one after another.
  - `SessionHeader` shows the state, the paused marker with held counts, the failed phase and failed scenes, and pause and continue.
  - `sceneActions` (JOS-151) is the one place that derives scene actions.
- **Live updates.** `useLiveSession` replaces the whole snapshot on every SSE message and resyncs on reconnect (JOS-183). Anything added to the snapshot is live with no transport change.

## Goals / Non-Goals

**Goals:**
- One section per phase, in pipeline order. Each shows its status, held work, and, when failed, its error and applicable actions (AC1, AC3, AC4).
- The User sees why a voice-over, decomposition or assembly phase failed (AC4).
- A retried phase shows its in-progress state while the retry runs (AC5).
- All of it refreshes on the open page without reloading (AC2).

**Non-Goals:**
- New retry endpoints (US-23 to US-27).
- Producing an assembly failure (JOS-149 or its follow-up).
- Deriving `voice-over-generating` (JOS-136).
- Diagnostics and attempt history (US-34).
- Per-phase timings.

## Decisions

**Decision 1 — The backend derives the phase list; the page renders it.**
`derivePhaseProgress({ state, failedPhase, failure, held })` is a pure function in `orchestrator.ts`. It returns four entries, always in the order `voice-over`, `decomposition`, `scenes`, `assembly`. `toSnapshot` attaches the result as `session.phases`. The page derives no status of its own, in line with `consult-session` Decision 6 ("no state is derived here").

*Alternative rejected:* deriving phase status in the frontend from `state`. That would put a second copy of the §8.1 mapping in the browser, a copy that drifts the first time a state rule changes (JOS-150 already changed one). It would also need `run.failure`, which the frontend does not have.

**Decision 2 — Phase status is a function of the derived state, not of new records.**

| Session state | voice-over | decomposition | scenes | assembly |
|---|---|---|---|---|
| `submitted` | pending | pending | pending | pending |
| `voice-over-generating` | in-progress | pending | pending | pending |
| `voice-over-complete` | complete | pending | pending | pending |
| `chunk-decomposing` | complete | in-progress | pending | pending |
| `chunks-processing` | complete | complete | in-progress | pending |
| `final-video-generating` | complete | complete | complete | in-progress |
| `final-video` | complete | complete | complete | complete |
| `failed` | phases before `failedPhase`: complete; `failedPhase`: failed; phases after it: pending |

A `failed` state with no `failedPhase`, or with a value outside the four phases, is a programming error: the function throws, and a test pins the four accepted values.

*Alternative rejected:* deriving each phase from its own records (voice-over record, timestamps, scenes, final video). That is a second state machine beside `deriveSessionState`. Two derivations can disagree, for example with a voice-over stored while the session derives `submitted`. One source keeps the header and the sections consistent.

**Decision 3 — The failure travels on the phase entry, as cause and retryability only.**
When the session derives `failed` and `run.failure.phase` equals `failedPhase`, that phase's entry carries `failure: { cause, retryable }`. `occurredAt` and the attempt details stay internal; they belong to diagnostics (US-34). The scenes phase carries no `failure`. Its errors are per scene and already shown on each scene row (JOS-151), and `failedSceneIndexes` names the failed scenes. The cause is already written for a person and never contains credentials or the script (JOS-136 Decision 9, JOS-144 Decision 6), so exposing it adds no new leak.

*Alternative rejected:* a top-level `failure` field on the session. JOS-136's spec plans one for the voice-over. Putting the failure on the phase keeps one place to read it for every phase. When JOS-136 lands, its top-level field and the phase entry must come from the same `run.failure`, and its gate task checks that.

**Decision 4 — Held work is reported per phase from the same derivation as `held`.**
Pipeline stages map to phases:

- `voice-over` → voice-over
- `decomposition` → decomposition
- `image` and `video` → scenes
- `assembly` → assembly

Each phase entry carries `heldCount`, the sum over its stages taken from `sessionHeldWork`. It is 0 when not paused. The top-level `held` stays as it is, because JOS-152's spec requires it. Both values come from the one `sessionHeldWork` call in `toSnapshot`, so they cannot disagree.

**Decision 5 — A retry in flight derives the retried phase's in-progress state.**
In `deriveSessionState`, with no scenes and a recorded failure, the session derives the phase's in-progress state instead of `failed`, if the latest attempt of that phase's attempt stage meets both conditions:

- its outcome is `in-flight`;
- its `queuedAt` is not earlier than `failure.occurredAt`.

The phase maps to its attempt stage and in-progress state as follows:

| Failed phase | Attempt stage | In-progress state |
|---|---|---|
| voice-over | `voice-over` | `voice-over-generating` |
| decomposition | `timestamps` | `chunk-decomposing` |

The failure stays recorded and is cleared on success, as today. A retry that fails again replaces it. `toSnapshot` passes a new `progress.retryInFlight` flag, so `deriveSessionState` stays pure.

*Alternative rejected:* clearing `run.failure` when a retry starts. The earlier failure must stay visible in diagnostics (§8.1). A crash mid-retry would also lose the cause.

*Alternative rejected:* waiting for the manual-retry endpoints. The state rule is §8.1's, and it is independent of who launches the retry. Today an automatic re-run of the timestamps stage already shows the wrong state. The endpoints in US-23 to US-27 inherit the rule; they do not each redefine it.

Scene retries already return the session to `chunks-processing`, because a retried scene goes back to `submitted` and `assemblyGate` sees it as processing. That is pinned by a test, not reimplemented. Assembly retries follow the same rule once JOS-149 records an assembly failure. Its gate task adds the `assembly` → `final-video-generating` row.

**Decision 6 — Sections, not tabs.**
Four `<section>` elements in pipeline order, each with the accessible name `{label} phase`:

- `Voice-over phase`
- `Decomposition phase`
- `Scenes phase`
- `Final video phase`

Each section shows:

- a heading;
- a status line with the label from a single status-to-label map: `Not started`, `In progress`, `Complete`, `Failed`;
- when `heldCount > 0`, the text `Waiting for you to continue ({n} held)`;
- when failed, the cause as an alert, plus the actions from `phaseActions`.

The Scenes section contains the existing `SceneList`, and the Final video section contains `FinalVideoDownload`. The status class comes from `styles/status.ts`, through a new `phaseStatusClass`, so no colour is hardcoded.

*Alternative rejected:* tabs. A failure in a tab the User has not opened is invisible. §8.3 allows either, and with only four short sections, tabs hide information for no benefit. Sections also need no extra keyboard pattern.

**Decision 7 — `phaseActions` is the one place phase actions are derived.**
`phaseActions(phase)` returns the actions that apply to a phase entry. Scenes return none at the phase level, because their actions are per scene in `sceneActions`. Voice-over, decomposition and assembly return none today, since no endpoint accepts their manual retry. US-23 to US-27 add `retry` there when they add the endpoints. A section renders exactly what the function returns. A test pins the empty result, so the page cannot offer an action the backend would reject (the same rule JOS-151 applied to clip failures).

**Decision 8 — The header keeps what other specs require of it.**
`SessionHeader` still shows the session state, the paused marker, the failed phase and failed scenes (required by JOS-150's `scene-completion-gate` spec), and the pause and continue buttons (JOS-152). It does not show per-phase detail. The sections do not repeat the session-level pause buttons.

## Risks / Trade-offs

- **[Assembly cannot show `failed` yet]** → JOS-149 records no session-level assembly failure, and `deriveSessionState` ignores `run.failure` once scenes exist. The Final video section will show `in-progress` or `complete` only, until a story derives `failedPhase: "assembly"`. That is recorded in the proposal, and a frontend test with an `assembly` failure fixture proves the section renders it as soon as it arrives.
- **[Merge overlap with JOS-149 (PR #25)]** → Both changes touch `toSnapshot`, `sessionResponseSchema` and `frontend/src/types.ts` (JOS-149 adds `finalVideoUrl`). The changes are additive and in different fields. Task 1 re-checks the base. If #25 merges first, rebase and keep both fields.
- **[Merge overlap with JOS-136]** → JOS-136 will derive `voice-over-generating` and add a top-level `failure`. Decision 2's table already covers `voice-over-generating`. Decision 3 notes the shared source. The retry rule in Decision 5 uses the existing `voice-over` attempt stage.
- **[An in-flight attempt left behind by a crash]** → Boot reconciliation (JOS-152/JOS-145) completes or fails orphaned attempts. Until it runs, the session reads as in progress, which matches what is actually happening (a request may still be running), not a false failure.
- **[Payload grows]** → Four small objects per snapshot. That is negligible next to the scene list.

## Migration Plan

No migration. `phases` is derived on every read, and old sessions get it at once. Rolling back means removing the field. No consumer outside this repository reads the session representation.

## Open Questions

- Which story derives an assembly failure at session level (`failedPhase: "assembly"`)? JOS-149's design does not. If none does, raise it with the product owner before US-27 (assembly manual retry) is planned.
