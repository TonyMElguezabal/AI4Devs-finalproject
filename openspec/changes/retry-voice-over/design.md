# Design — Manually retry a failed voice-over

## Context

What exists, and what this story builds on:

- **On `feature/entrega-2-JAME` (merged)**:
  - **JOS-136, groups 1-6**: the voice-over records (`voice_overs`, unique per session), `stage_attempts`, `runs.voice_provider_id` (write-once through `bindVoiceProvider`), `runs.failure`, and the session state machine.
  - **JOS-137**: the store triggers that lock the script, title and language, `writeArtefactOnce`, and `canLaunchVoiceOver(runId)` in `voiceLaunchGuard.ts`. The guard decides from the voice-over **record**, not the state. A failed attempt never creates the record, so the session stays launchable.
  - **JOS-152**: the phase-launch gate (`admitLaunch`) and the stage-launcher registry. `voice-over` is in `NOT_YET_LAUNCHABLE`.
  - **The scene retry**: `POST /sessions/:sessionId/scenes/:sceneId/retry` answers 200 `{ ok }` or 409 `{ ok, reason }`. It resets the scene to `submitted` and launches through the gate.
  - **JOS-136, groups 4-6**: the `VoiceProvider` port and registry (`getVoiceProviderRegistry`), the voice-over phase (`generateVoiceOver`, `sendVoiceAttempt`, `voiceOverLauncher` in `voiceOverPhase.ts`), and the derivation of `voice-over-generating`. `voice-over` is registered with the gate.
  - **JOS-184**: the stage instance `(sessionId, "voice-over")`, cycles, scheduled attempts with `dueAt`, the failure fields `cycle`, `attemptsInCycle` and `manualRetryAvailable`, and `startNewCycle(ref, options)` in `retry/stageAttemptRecorder.ts`. It returns `{ started: true, attempt }` or `{ started: false, reason: "not-failed" | "not-retryable" }`. It opens cycle + 1 with a `manual` attempt that is `scheduled` and due now, and it **clears the session's recorded failure** for session-level stages. Sending goes through `armScheduledAttempt` and `releaseAttempt`, which ask the launch gate, and `voice-over` has a registered attempt sender.
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
  - `not-retryable`
  - `retry-already-pending`

*Alternative rejected:* a generic `POST /sessions/:id/retry` that infers the phase. The phase-specific checks (the narration guard here, the corrected `IMAGE` elsewhere) would collect in one handler, and the UI would lose a stable, per-phase contract. US-24 to US-27 follow the same pattern.

**Decision 2 — Check order: state, guard, cycle, gate — and all checks before any send.**
`retryVoiceOver(sessionId)` in a new `voiceOverRetry.ts` runs these steps in order:

1. The session exists. Otherwise 404.
2. It derives `failed` with `failedPhase: "voice-over"`. Otherwise 409, with `retry-already-pending` when a retry is pending (the latest `voice-over` attempt is `scheduled` or `in-flight` and is not the session's first attempt), and `not-failed-in-voice-over` for any other state.
3. `canLaunchVoiceOver(sessionId)` allows a launch. Otherwise 409 `narration-complete`. This is unreachable in normal flow, because a stored narration means the voice-over phase cannot be `failed`, but it is kept as the guard JOS-137 requires every voice launch to ask.
4. The failure is retryable (`failure.manualRetryAvailable`). Otherwise 409 `not-retryable`. See Decision 3.
5. `startNewCycle({ sessionId, stage: "voice-over" })` succeeds. It is atomic in the store and refuses an instance that is not `failed`, so two concurrent requests open one cycle. The loser gets 409 `retry-already-pending`. A `not-retryable` refusal from it is mapped to the same reason as step 4.
6. The retry is handed to the phase-launch gate, which sends it, or holds it while paused. `startNewCycle` already records the attempt as scheduled and arms the scheduler, so this step is `releaseAttempt` through the gate: nothing new is launched by hand.

The first attempt of a session is never a retry, so a session whose first request is in flight or scheduled is `voice-over-generating`, not `failed`, and answers `not-failed-in-voice-over`. The service is synchronous over a synchronous store, so a second request always runs after the first has committed. It finds the failure already cleared (Decision 7) and a pending retry, and answers `retry-already-pending` at step 2. Step 5's refusal covers a second process, and maps to the same reason.

Steps 1-5 read and write the store only. No provider request is possible before step 6.

**Decision 3 — A manual retry is offered only for a retryable voice-over failure.**
The product owner's answer to Open Question 1 (task 1.4) is to follow JOS-184: a failure that JOS-136 classifies as not retryable (a 4xx other than 408 and 429, a missing or rotated credential, an exhausted quota) carries `manualRetryAvailable: false`, and `startNewCycle` refuses it with `reason: "not-retryable"`. The command checks `failure.manualRetryAvailable` itself, before `startNewCycle`, so the refusal has its own reason, `not-retryable`, with its own sentence on the page. The page offers Retry only when the failure is retryable.

*Alternative rejected:* offering the retry after every failure. It would strand fewer sessions whose credential was fixed after the failure, but it needs `startNewCycle` and `manualRetryAvailable`, merged by JOS-184 for every stage including scenes, to change. That is outside this story.

**Decision 4 — The provider comes from the session, never from configuration, once bound.**
The retry passes no provider. `startNewCycle` copies the provider of the stage instance's latest attempt, and `sendVoiceAttempt` resolves its adapter from the attempt's provider, then `runs.voice_provider_id`. A bound identifier with no configured adapter fails the new attempt as not retryable, with a cause that names the provider and no credential, and sends nothing. This mirrors the image stage's "no adapter for the bound provider".

Every voice-over failure is written after an attempt exists, and the binding is written in the same transaction as the first attempt (JOS-136 Decision 2). So a session `failed` in voice-over always has a bound provider and an earlier attempt. A "failed before the first attempt" session, and a refusal reason for it, do not exist, and this change adds neither.

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
JOS-168 Decision 5 derives the in-progress state from a failure plus an in-flight attempt queued no earlier than it. `startNewCycle` clears the failure, and the accepted attempt is `scheduled`, not in flight, until the scheduler releases it. A retry held by a pause, or waiting for a request-cap slot, stays `scheduled`. With the merged rules, the session would derive `submitted` after the User pressed Retry. The rule is extended: `voiceAttemptInFlight` counts a `voice-over` attempt that is `scheduled` or `in-flight`. With no failure recorded, that is the only signal needed, and it also covers an automatic retry waiting for its delay. The `retryInFlight` rule of JOS-168 stays for a failure that still stands beside an in-flight attempt.

This matches the scene behaviour. A retried scene goes back to `submitted`, and its session reads `chunks-processing` even while paused. While paused, the Voice-over phase shows `In progress` together with `Waiting for you to continue (1 held)`. That works as merged: the voice-over launcher's `heldWork` counts one unit when the session has no failure, no voice-over record, no chunks and no in-flight attempt, and a scheduled manual attempt meets all four. A test pins it, and `launch` releases the scheduled attempt through `releaseSessionAttempts`.

*Alternative rejected:* keeping `failed` until the request is sent. The page would keep offering Retry for a retry already accepted. The second click would get 409, which is correct but confusing.

**Decision 8 — The page offers Retry exactly when the backend can accept it.**
`phaseActions` (which returns `{ retry: boolean }`) returns `{ retry: true }` for the voice-over entry when its status is `failed` and its `failure.retryable` is true. Following Decision 3, a not-retryable failure shows its cause and no button. The Voice-over phase section renders a button named `Retry voice-over`. A click calls `retryVoiceOver(sessionId)`. While the request is outstanding, the button is disabled. A 409 reason is shown as text in the section, mapped to a person-readable sentence by one lookup table. The new state arrives through the live update; the page does not set it optimistically.

## Risks / Trade-offs

- **[Two dependencies landed with a different shape]** → JOS-136 and JOS-184 are merged. Task 1 recorded where they differ from the first draft: `startNewCycle` refuses not-retryable failures and clears the failure, and no failure exists before a first attempt. This design now follows the merged code.
- **[Stacked on JOS-168]** → The UI parts need JOS-168's sections. If JOS-168 merges after this branch's base, rebase. The close-out retargets the PR to `feature/entrega-2-JAME`, because merging a stacked PR only folds it into its parent.
- **[Retry clicked while the derivation lags]** → `startNewCycle` is the atomic arbiter. A stale page gets a 409 with a readable reason and then the live update.
- **[The extended retry rule diverges from JOS-168]** → Decision 7 is written as a requirement in this change's spec. It is tested against JOS-168's existing in-flight tests, so both rules coexist, and the in-flight case is a special case of "scheduled or in flight".

## Migration Plan

No migration of its own. The scheduled attempt and cycle columns come from JOS-184's migration. Rolling back means removing the route, the service and the action. Sessions with an accepted but unsent retry keep their scheduled attempt, which JOS-184's startup rebuild sends or holds as usual.

## Open Questions

1. **Manual retry after a not-retryable failure**: answered "no" (Decision 3), following JOS-184. A later "yes" is a change to JOS-184's `startNewCycle` and failure fields, not to this story alone.
2. **Retry delay before the first automatic retry of a manual cycle**: owned by JOS-184 (its open question 1). This change sends the manual attempt immediately (`dueAt` = now).
