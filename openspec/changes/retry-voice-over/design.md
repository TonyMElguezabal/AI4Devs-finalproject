# Design — Manually retry a failed voice-over

## Context

What exists, and what this story builds on:

- **On `feature/entrega-2-JAME` (merged)**:
  - **JOS-136, groups 1-3**: the voice-over records (`voice_overs`, unique per session), `stage_attempts`, `runs.voice_provider_id` (write-once through `bindVoiceProvider`), `runs.failure`, and the session state machine.
  - **JOS-137**: the store triggers that lock the script, title and language, `writeArtefactOnce`, and `canLaunchVoiceOver(runId)` in `voiceLaunchGuard.ts`. The guard decides from the voice-over **record**, not the state. A failed attempt never creates the record, so the session stays launchable.
  - **JOS-152**: the phase-launch gate (`admitLaunch`) and the stage-launcher registry. `voice-over` is in `NOT_YET_LAUNCHABLE`.
  - **The scene retry**: `POST /sessions/:sessionId/scenes/:sceneId/retry` answers 200 `{ ok }` or 409 `{ ok, reason }`. It resets the scene to `submitted` and launches through the gate.
- **Designed, not yet built**:
  - **JOS-136, groups 4-6**: the `VoiceProvider` port, the ElevenLabs adapter that classifies failures by HTTP status, the voice-over phase (state change, attempt record, provider binding before sending), and the derivation of `voice-over-generating`.
  - **JOS-184**: the stage instance `(sessionId, "voice-over")`, cycles, `startNewCycle` (requires `failed`, increments the cycle, records the next attempt with `trigger = manual`), scheduled attempts with `dueAt`, and the failure fields `cycle`, `attemptsInCycle` and `manualRetryAvailable`.
  - **JOS-168**: `phases`, the retry-in-flight rule (Decision 5), `PhaseSection`, and `phaseActions`, which returns nothing for voice-over.
- **Hand-off rules from JOS-136 and JOS-137** (comment on JOS-155, 2026-09-27):
  - call `canLaunchVoiceOver` first, and send nothing when it refuses;
  - never change the script;
  - reuse the bound provider without switching.

## Goals / Non-Goals

**Goals:**
- One command retries a failed voice-over with the stored script and the bound provider (AC1, AC2).
- A retry never deletes or rewrites anything that exists (AC3).
- The retry respects the budget, pause and the request cap, because it goes through the same gate as every launch.
- The page offers the retry exactly when the backend accepts it.

**Non-Goals:**
- Retrying other phases (US-24 to US-27).
- Switching providers.
- Editing the script.
- Retry delays and automatic retries (JOS-184).

## Decisions

**Decision 1 — A dedicated route per phase, mirroring the scene retry.**
`POST /sessions/:sessionId/voice-over/retry`. The params are validated by the existing session-id schema. The body schema is a strict empty object, so any field (for example `script`) answers 400. The responses are:

- **200** `{ ok: true, held: boolean }` when the retry was accepted. `held` is `true` when a pause holds it.
- **404** for an unknown or malformed session, as `consult-session` reports both.
- **409** `{ ok: false, reason }`, where `reason` is one of:
  - `not-failed-in-voice-over`
  - `narration-complete`
  - `retry-already-pending`
  - `voice-provider-not-bound`

*Alternative rejected:* a generic `POST /sessions/:id/retry` that infers the phase. The phase-specific checks (the narration guard here, the corrected `IMAGE` elsewhere) would collect in one handler, and the UI would lose a stable, per-phase contract. US-24 to US-27 follow the same pattern.

**Decision 2 — Check order: state, guard, cycle, gate — and all checks before any send.**
`retryVoiceOver(sessionId)` in a new `voiceOverRetry.ts` runs these steps in order:

1. The session exists. Otherwise 404.
2. It derives `failed` with `failedPhase: "voice-over"`. Otherwise 409 `not-failed-in-voice-over`.
3. `canLaunchVoiceOver(sessionId)` allows a launch. Otherwise 409 `narration-complete`. This is unreachable in normal flow, because a stored narration means the voice-over phase cannot be `failed`, but it is kept as the guard JOS-137 requires every voice launch to ask.
4. If the session has recorded `voice-over` attempts but no bound provider, it is inconsistent: 409 `voice-provider-not-bound`. A session that failed before its first attempt has neither, and passes. See Decision 4.
5. `startNewCycle({ sessionId, stage: "voice-over" })` succeeds. It is atomic in the store and refuses an instance that is not `failed`, so two concurrent requests open one cycle. The loser gets 409 `retry-already-pending`.
6. The retry is handed to the phase-launch gate, which sends it, or holds it while paused.

Steps 1-5 read and write the store only. No provider request is possible before step 6.

**Decision 3 — A manual retry is offered for every voice-over failure, retryable or not.**
§10.2 and §10.3 grant a manual retry on a failure without distinguishing its kind. Some causes JOS-136 classifies as not retryable can be fixed outside the application:

- a missing or rotated credential;
- an exhausted character quota, which renews monthly;
- an account-level 4xx.

The retry is bounded: it opens one new cycle of at most four attempts, and a not-retryable answer ends that cycle after one attempt, so the cost of trying is one request. The User sees the cause (JOS-168) before deciding.

*Alternative considered:* offering the retry only when `retryable` is true. It is simpler, but it strands a session whose credential was fixed after the failure. The open question in the proposal asks the product owner to confirm.

**Decision 4 — The provider comes from the session, never from configuration, once bound.**
The retry passes no provider. The voice-over phase (JOS-136 Decision 3) reads `runs.voice_provider_id` and resolves its adapter. A bound identifier with no configured adapter fails the new attempt as not retryable, with the cause "the voice provider bound to this session is not configured", and sends nothing. This mirrors the image stage's "no adapter for the bound provider".

A session whose first attempt never happened (failed before binding, for example a missing credential under JOS-136 task 5.10) is not refused. Its retry is its first real attempt, so the phase binds the configured default, exactly as a first launch would. Step 4 of Decision 2 therefore refuses only an *inconsistent* session: one with recorded `voice-over` attempts but no binding. That cannot happen, because the binding and the first attempt are written in one transaction (JOS-136 Decision 2). It is kept as a defensive check with its own reason.

**Decision 5 — The script is read from the store at send time; nothing about content travels with the command.**
The phase builds the provider request from `run.script`, `run.language` and the hardcoded voice, quality and speed (`VOICE_PROVIDER`). The command has no body, so "the same script" is structural rather than a comparison. A test asserts that the text the stub provider receives on the retry is byte-identical to the stored script, and identical to the first attempt's text.

**Decision 6 — Nothing is deleted: the retry adds records and never removes them.**
A retry does not touch:

- the project folder;
- the session row, beyond what the phase itself writes on its outcome;
- the earlier attempts;
- the earlier failure, which is replaced only when the new cycle ends (success clears it; a new failure overwrites it, as today).

On success the MP3 is written with `writeArtefactOnce`, which never replaces an existing file. A test snapshots the project folder listing and the session's rows before the retry, and checks after both a successful and a failed retry that nothing that existed is gone or changed. The only exceptions are the outcome fields the phase writes.

**Decision 7 — An accepted retry derives `voice-over-generating`, even while it waits.**
JOS-168 Decision 5 derives the in-progress state from an in-flight attempt newer than the failure. A retry held by a pause, or waiting for a request-cap slot, has no in-flight attempt yet. With that rule alone, the session would still read `failed` after the User pressed Retry. The rule is extended: an accepted retry counts when the latest `voice-over` attempt of the current cycle is scheduled (JOS-184) or in flight, and is newer than the failure.

This matches the scene behaviour. A retried scene goes back to `submitted`, and its session reads `chunks-processing` even while paused. While paused, the Voice-over phase shows `In progress` together with `Waiting for you to continue (1 held)`. That works because the voice-over launcher's `heldWork` counts the scheduled manual attempt as one held unit.

*Alternative rejected:* keeping `failed` until the request is sent. The page would keep offering Retry for a retry already accepted. The second click would get 409, which is correct but confusing.

**Decision 8 — The page offers Retry exactly when the backend can accept it.**
`phaseActions` returns `[{ kind: "retry" }]` for the voice-over entry when its status is `failed`. Following Decision 3, it does not look at `retryable`. The Voice-over phase section renders a button named `Retry voice-over`. A click calls `retryVoiceOver(sessionId)`. While the request is outstanding, the button is disabled. A 409 reason is shown as text in the section, mapped to a person-readable sentence by one lookup table. The new state arrives through the live update; the page does not set it optimistically.

## Risks / Trade-offs

- **[Two unbuilt dependencies]** → JOS-136 groups 4-6 and JOS-184 must land first. Task 1 is a hard gate. If either lands with a different shape, design.md is updated before coding. That covers `startNewCycle`'s name and signature, the scheduled-attempt representation, and the adapter-resolution API.
- **[Stacked on JOS-168]** → The UI parts need JOS-168's sections. If JOS-168 merges after this branch's base, rebase. The close-out retargets the PR to `feature/entrega-2-JAME`, because merging a stacked PR only folds it into its parent.
- **[Not-retryable retries cost money for nothing]** → One request per click at most, because a not-retryable answer ends the cycle at once. The button is disabled while a request is pending. A second retry needs a second deliberate click after the new failure.
- **[Retry clicked while the derivation lags]** → `startNewCycle` is the atomic arbiter. A stale page gets a 409 with a readable reason and then the live update.
- **[The extended retry rule diverges from JOS-168]** → Decision 7 is written as a requirement in this change's spec. It is tested against JOS-168's existing in-flight tests, so both rules coexist, and the in-flight case is a special case of "scheduled or in flight".

## Migration Plan

No migration of its own. The scheduled attempt and cycle columns come from JOS-184's migration. Rolling back means removing the route, the service and the action. Sessions with an accepted but unsent retry keep their scheduled attempt, which JOS-184's startup rebuild sends or holds as usual.

## Open Questions

1. **Manual retry after a not-retryable failure** (Decision 3): confirm with the product owner, together with JOS-184 open question 4.
2. **Retry delay before the first automatic retry of a manual cycle**: owned by JOS-184 (its open question 1). This change sends the manual attempt immediately (`dueAt` = now).
