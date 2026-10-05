# Design — Manually retry a failed decomposition

## Context

On `feature/entrega-2-JAME` (`1d04777`), after the gate of task 1:

- **`runDecompositionPhase(runId, { alignmentProvider, instructionGenerator })`** (`decompositionPhase.ts`):
  - asks `admitLaunch`;
  - calls `obtainNarrationTimestamps` only when no timestamps are stored;
  - then calls `segmentStoredTimestamps`, which segments, registers the chunks through `registerDecomposition`, and launches the image stage.

  Nothing in the running app calls it yet, and nothing configures its two providers at runtime (the voice phase has `setVoiceProviderRegistry`; these two have only their factory functions).
- **Timestamps step** (`narrationTimestampsPhase.ts`):
  - It records its own `timestamps` attempt with `recordStageAttempt` (in flight) before it reads or sends anything, and completes it with `completeStageAttempt`. It does not use the retry recorder, so it schedules no automatic retry.
  - If an earlier attempt has `error_code = "native-unusable"`, it goes straight to forced alignment.
  - Success clears `runs.failure`. Failure writes a decomposition failure (retryable except for an alignment 4xx other than 408/429).
  - A session with stored timestamps is refused with `already-obtained`.
- **Division step** (`segmentStoredTimestamps`, `registerDecomposition` in `sceneRegistration.ts`):
  - It records **no attempt**. Every failure only calls `setRunFailure`. `AttemptStage` is `"voice-over" | "timestamps" | "image" | "video" | "assembly"`: there is no `decomposition` stage.
  - Segmentation failures are recorded as not retryable. Validation failures and invalid output from the reasoning provider are retryable. A reasoning 4xx is not.
  - Success registers the chunks and clears the failure in one transaction. A session with chunks is refused with `already-registered`.
- **Cycles** (JOS-184, merged): the `timestamps` and `decomposition` stages share **one stage instance**, `<session>:decomposition` (`stageInstanceKeyOf`: "one state, one retry policy"), so cycles and the four-attempt bound count both steps together. `startNewCycle(ref, options)` returns `{ started: true, attempt }` or `{ started: false, reason: "not-failed" | "not-retryable" }`. It needs a latest attempt on the stage instance that ended `transient` or `not-retryable`. It opens cycle + 1 with a `manual`, `scheduled`, due-now attempt, **clears the session failure**, and arms the scheduler. `releaseAttempt` checks the launch gate, claims the attempt (`in-flight`), and hands it to the sender registered for its stage with `registerAttemptSender`.
- **Session state**: with no chunks and a failure, the session derives `failed` with `failedPhase: "decomposition"`. With no failure, `timestampsStarted` (a `timestamps` attempt recorded, or timestamps stored) derives `chunk-decomposing`.
- **Launch gate**: `decomposition` is in `NOT_YET_LAUNCHABLE`, so nothing resumes it on continue.
- **Script locking**: script, title and language are locked by store triggers (JOS-137).
- **Built by other stories**: JOS-136, JOS-184 and JOS-168 are merged. JOS-155 merged only its service (`retryVoiceOver`); its route, reason table, button and derived-state change are still to come. JOS-166's `instructions` stage is not built.

## Goals / Non-Goals

**Goals:**
- One command retries a failed decomposition at the step that failed, on the stored audio and the locked script (AC1, AC2).
- The voice-over is never regenerated, rewritten or called (AC3).
- The retry respects the budget, pause and the request cap, through the same gate.
- Both steps record their attempts, so a failed step can open a cycle.

**Non-Goals:**
- Automatic retries of the decomposition steps (JOS-184's recorder is not adopted by these steps here).
- Launching decomposition after the narration (JOS-136).
- Instruction correction (US-25, US-26).
- Re-decomposing a session that has chunks.

## Decisions

**Decision 1 — The route follows the per-phase retry pattern.**
`POST /sessions/:sessionId/decomposition/retry` uses the same pattern as `retry-voice-over` Decision 1: a strict empty body, so any field answers 400. The responses are:

- **200** `{ ok: true, held }`.
- **404** for an unknown or malformed session.
- **409** `{ ok: false, reason }`, where `reason` is one of:
  - `already-registered`
  - `retry-already-pending`
  - `not-failed-in-decomposition`
  - `not-retryable`

Whichever of JOS-155 and this change adds the route schemas and the reason-to-sentence table first, the other reuses them and adds only its reasons.

**Decision 2 — The service checks in a fixed order, and the failed step is decided from the records.**
`retryDecomposition(sessionId)` in a new `decompositionRetry.ts`:

1. The session exists, or `session-not-found` (404).
2. It has no chunks, or 409 `already-registered`. This comes first because a session with chunks derives a scenes or assembly state, never `failed` in decomposition.
3. No retry is pending: the latest attempt of the `timestamps` or `decomposition` stage is `scheduled` or `in-flight` and was not an `initial` attempt. Otherwise 409 `retry-already-pending`. A session whose first attempt is running derives `chunk-decomposing`, not `failed`, and answers `not-failed-in-decomposition`.
4. The session derives `failed` with `failedPhase: "decomposition"`, or 409 `not-failed-in-decomposition`.
5. The failure is retryable (`failure.manualRetryAvailable`), or 409 `not-retryable` (Decision 7).
6. The step is chosen from the records:
   - **no stored timestamps** → `stage: "timestamps"`;
   - **stored timestamps** → `stage: "decomposition"`.

   Both refs name the same stage instance, so the choice sets the stage of the scheduled attempt, and so which sender runs it.
7. `startNewCycle` with that stage. It is atomic, so a concurrent second request is refused. A `not-retryable` refusal maps to the same reason as step 5, and `not-failed` to `retry-already-pending`.
8. `releaseSessionAttempts` hands the scheduled attempt to the gate: `held` is true when a pause keeps it.
9. The session's new state is published to live subscribers (`broadcast`), whether the attempt was sent or held. Opening the cycle clears the failure and a held attempt runs nothing, so no step would publish it; without this the page would keep showing the failed phase until something else changed.

The service is synchronous over a synchronous store, so a second request after the first finds the failure already cleared and a pending retry, and answers at step 3. Steps 1-7 read and write the store only. No provider can be called before step 8, and the publish at step 9 follows the release so a subscriber never sees the retry before the gate has decided it.

*Alternative rejected:* tagging the failure with its step when it is recorded. That would add a field to every failure already written, while the records answer the question exactly: stored timestamps mean the timestamps step succeeded, and `obtainNarrationTimestamps` refuses to run again once they exist.

**Decision 3 — The division step becomes a recorded stage, `decomposition`.**
`startNewCycle` needs a failed attempt on the stage instance, and the division step records none. This change adds `"decomposition"` to `AttemptStage` and makes `segmentStoredTimestamps` record one attempt per try, exactly as `obtainNarrationTimestamps` does. The attempt joins the shared instance, so a first division after a successful timestamps attempt is attempt 2 of cycle 1 and carries `trigger: initial`, because it is the division's first try:

- The attempt is recorded in flight after the guards (unknown session, held, no timestamps, `already-registered`) and before segmentation or any request, and holds the configured decomposition provider's identifier, `openai-decomposition`.
- It completes as `success` when the chunks are registered, `transient` for a retryable failure and `not-retryable` for the others, with the failure's cause as the error message.
- The failure it writes carries the attempt's `cycle` and `sequenceInCycle` as `cycle` and `attemptsInCycle` (the existing `createDecompositionFailure` already accepts them), so the page shows the right cycle after a retry.

As with `timestamps`, completion uses `completeStageAttempt` directly, so no automatic retry is scheduled. JOS-166 later splits out an `instructions` stage; this stage is the division step as a whole, and that story decides whether to refine it.

*Alternative rejected:* skipping the cycle for a division retry. It would be unbounded and unrecorded, against §10.2.

**Decision 4 — The retry runs through attempt senders on the claimed attempt, with configured providers.**
`startNewCycle` leaves a *scheduled* attempt. Re-entering `runDecompositionPhase` would record a second attempt beside it and leave the scheduled one dangling. So, like the voice-over (`sendVoiceAttempt`):

- `obtainNarrationTimestamps` and `segmentStoredTimestamps` accept an optional already-claimed attempt. When given one, they complete it instead of recording a new one. Called without, they behave as today.
- `registerAttemptSender("timestamps", …)` and `registerAttemptSender("decomposition", …)` run the step on the claimed attempt, then continue to the next step as `runDecompositionPhase` does (a timestamps retry that succeeds goes on to divide, recording a first `decomposition` attempt).
- The providers come from a small registry in a new `decompositionDependencies.ts`: `getDecompositionDependencies`, `setDecompositionDependencies` and `resetDecompositionDependencies`, defaulting to the real alignment and instruction generator factories, as `voiceProvider.ts` does. Tests install stubs.

All three steps keep AC3 by construction: none of these functions reaches the voice provider. Tests prove it through the retry command, so a later change cannot silently break it.

*Alternative rejected:* separate retry functions per step. They would duplicate the phase's ordering and its `already-obtained` and `already-registered` handling.

**Decision 5 — Register the `decomposition` stage launcher.**
The pause spec (JOS-152) requires a manual retry during a pause to be accepted, held, and launched on continue. This change registers `{ stage: "decomposition", heldWork, launch }`:

- `heldWork(sessionId)` counts 1 when the session has no chunks and a `scheduled` attempt exists on the `timestamps` or `decomposition` stage.
- `launch(sessionId)` calls `releaseSessionAttempts`, which sends each through the senders of Decision 4.

`decomposition` comes off `NOT_YET_LAUNCHABLE`. The pause spec's "decomposition awaiting continuation after the narration" scenario needs a `heldWork` term for "voice-over stored, no timestamps, no failure, no attempt". That term is JOS-136's, because it is the story that launches decomposition after the narration. This launcher leaves a documented hook for it and does not implement it. The collision rule is the same as for the voice-over: `registerStageLauncher` throws on a second registration, and task 1.2 checked that none exists.

**Decision 6 — No new derived-state rule; the existing ones are pinned by tests.**
`startNewCycle` clears the failure, and a retried session has earlier `timestamps` attempts or stored timestamps, so `timestampsStarted` is true and the session derives `chunk-decomposing` from the moment the retry is accepted, scheduled, held or in flight, for either step. When the cycle fails, the step writes a new failure and the session derives `failed` again. JOS-168's `retryInFlight` rule is unchanged. Tests in `phase-progress.test.ts` pin the behavior so a later change to `timestampsStarted` cannot break it.

**Decision 7 — A manual retry is offered only for a retryable decomposition failure.**
The product owner's answer to the shared open question is to follow JOS-184, as for the voice-over: a failure with `manualRetryAvailable: false` offers no retry, and the command answers 409 `not-retryable`. Segmentation failures are recorded as not retryable ("the same input gives the same result"), so they offer no retry; validation failures and invalid reasoning output do. The cause on the page already says the script is not at fault.

**Decision 8 — The page action.**
`phaseActions` (which returns `{ retry: boolean }`) returns `{ retry: true }` for the decomposition entry when it is `failed` and its `failure.retryable` is true. The Decomposition section renders `Retry decomposition`, with the same pending, disabled and refusal behavior as `retry-voice-over` Decision 8, through the same shared component. Whichever story lands second extracts it if the first did not. The live update brings the new state.

The session header's pause and continue controls are shown for `chunks-processing` and `final-video-generating` only. A retry held by a pause derives `chunk-decomposing`, so the header adds that state: otherwise the User could hold a retry and have no control to release it.

## Risks / Trade-offs

- **[The division attempt is new on a hot path]** → It is one extra row per division try, written before the provider call, like the timestamps step. Existing tests of `segmentStoredTimestamps` and `registerDecomposition` are reviewed in task 8.1.
- **[A session that failed its division before this change has no attempt]** → `startNewCycle` answers `not-failed` and the command refuses. The MVP has no deployed data, only local databases, so this is accepted and not migrated.
- **[Division retries repeat a deterministic failure]** → A retryable validation failure can recur. The cause is shown and each retry is bounded by one click and one attempt.
- **[The instruction provider is called again on a division retry]** → Intended: new `IMAGE` and `VIDEO` instructions are part of dividing again (§10.3). It is one request per attempt.
- **[Overlap with JOS-155 and JOS-166]** → Both touch `phaseActions`, the route pattern and the page button. Task 1.2 rebases on whichever has merged and reuses its code. JOS-166's `instructions` stage may refine Decision 3.
- **[Stacked branches]** → This branch now stands on `feature/entrega-2-JAME` and is retargeted to it.
- **[Launcher registration collides with JOS-136]** → `registerStageLauncher` throws on a second registration, so the collision cannot be silent.

## Migration Plan

No data migration: `stage_attempts.stage` has no `CHECK` constraint on its values, and cycles and scheduled attempts come from JOS-184. Rollback means removing the route, the service, the senders, the launcher registration (putting `decomposition` back on `NOT_YET_LAUNCHABLE`) and the action.

## Open Questions

None. Question 1 (manual retry after a not-retryable failure) was answered "no" with JOS-155 (Decision 7). The division-stage question was answered "add the stage here" (Decision 3).
