# Design — Manually retry a failed decomposition

## Context

On `feature/entrega-2-JAME` (`ecfe430`):

- **`runDecompositionPhase(runId, { alignmentProvider, instructionGenerator })`** (`decompositionPhase.ts`):
  - asks `admitLaunch`;
  - calls `obtainNarrationTimestamps` only when no timestamps are stored;
  - then calls `segmentStoredTimestamps`, which segments, registers the chunks through `registerDecomposition`, and launches the image stage.

  Nothing in the running app calls it yet; JOS-136's voice phase will.
- **Timestamps step** (JOS-139):
  - Every call records a `timestamps` attempt before it reads or sends anything.
  - If an earlier attempt has `error_code = "native-unusable"`, it goes straight to forced alignment.
  - It never calls the voice provider: its only dependency is the `AlignmentProvider`.
  - Success clears `runs.failure`. Failure writes a decomposition failure (retryable except for an alignment 4xx other than 408/429).
  - A session with stored timestamps is refused with `already-obtained`.
- **Division step** (JOS-140, JOS-144):
  - Segmentation failures are recorded as not retryable ("the same input gives the same result").
  - Validation failures and invalid output from the reasoning provider are retryable. A reasoning 4xx is not.
  - Success registers the chunks and clears the failure in one transaction.
  - A session with chunks is refused with `already-registered`. The store refuses deleting chunks.
- **Session state**: with no chunks and a failure, the session derives `failed` with `failedPhase: "decomposition"`.
- **Launch gate**: `decomposition` is in `NOT_YET_LAUNCHABLE`, so nothing resumes it on continue.
- **Script locking**: script, title and language are locked by store triggers (JOS-137).

Designed, not built: JOS-184 (`startNewCycle`, scheduled attempts), JOS-168 (`phases`, the retry rule, `PhaseSection`, `phaseActions`), and JOS-155 (the voice-over retry, whose route pattern and rule extension this design shares).

## Goals / Non-Goals

**Goals:**
- One command retries a failed decomposition at the step that failed, on the stored audio and the locked script (AC1, AC2).
- The voice-over is never regenerated, rewritten or called (AC3).
- The retry respects the budget, pause and the request cap, through the same gate.
- One retry rule and one route pattern shared with the voice-over retry.

**Non-Goals:**
- Automatic retries (JOS-184).
- Launching decomposition after the narration (JOS-136).
- Instruction correction (US-25, US-26).
- Re-decomposing a session that has chunks.

## Decisions

**Decision 1 — The route follows the per-phase retry pattern.**
`POST /sessions/:sessionId/decomposition/retry` uses the same pattern as `retry-voice-over` Decision 1: a strict empty body, so any field answers 400. The responses are:

- **200** `{ ok: true, held }`.
- **404** for an unknown or malformed session.
- **409** `{ ok: false, reason }`, where `reason` is one of:
  - `not-failed-in-decomposition`
  - `already-registered`
  - `retry-already-pending`

If JOS-155 lands first, the route schemas and the reason-to-sentence table are reused, and this change only adds its reasons.

**Decision 2 — The failed step is decided from the records, not from the failure text.**
`retryDecomposition(sessionId)` in a new `decompositionRetry.ts`:

1. Checks that the session exists (404), that it is `failed` with `failedPhase: "decomposition"`, and that it has zero chunks. The zero-chunk check is a guard; a failed decomposition never has chunks.
2. Chooses the step:
   - **no stored timestamps** → the `timestamps` stage instance;
   - **stored timestamps** → the `decomposition` stage instance.
3. Calls `startNewCycle` on that instance. It is atomic, so a concurrent second request gets `retry-already-pending`.
4. Hands the session to the decomposition launcher through the gate (Decision 4).

No provider can be called before step 4.

*Alternative rejected:* tagging the failure with its step when it is recorded. That would add a field to every decomposition failure already written, while the records answer the question exactly. Stored timestamps mean the timestamps step succeeded, and `obtainNarrationTimestamps` refuses to run again once they exist. The two §10.3 rows map one-to-one onto the two stage instances the umbrella change `decompose-script-into-chunks` already names.

**Decision 3 — The retry is a re-entry into `runDecompositionPhase`; nothing new is written for the steps themselves.**
`runDecompositionPhase` already does the right thing on re-entry:

- It skips the timestamps step when timestamps are stored, which keeps AC2 from re-aligning.
- It goes straight to alignment after `native-unusable` (AC1).
- It segments the locked `run.script` (AC2).

Its dependencies are the alignment provider and the instruction generator only, so AC3 holds by construction: the voice provider is not in reach. Tests prove each of these through the retry command, not only through the function. That way a later change to the phase, such as JOS-136 wiring the voice phase in, cannot silently break them.

*Alternative rejected:* separate retry functions per step. They would duplicate the phase's ordering and its `already-obtained` and `already-registered` handling.

**Decision 4 — Register the `decomposition` stage launcher.**
The pause spec (JOS-152) requires a manual retry during a pause to be accepted, held, and launched on continue. That needs a launcher. This change registers `{ stage: "decomposition", heldWork, launch }`:

- `heldWork(sessionId)` counts 1 when the session is paused and its current decomposition-phase cycle has a scheduled, unsent attempt (JOS-184).
- `launch(sessionId)` calls `runDecompositionPhase` with the configured dependencies.

`decomposition` comes off `NOT_YET_LAUNCHABLE`. The pause spec's "decomposition awaiting continuation after the narration" scenario (`held` with the state `voice-over-complete`) also needs a `heldWork` term for "voice-over stored, no timestamps, no failure". That term is JOS-136's, because it is the story that launches decomposition after the narration. This launcher leaves a documented hook for it and does not implement it. If JOS-136 lands first and registers the launcher, this change extends it instead (task 1.2).

**Decision 5 — One retry-in-progress rule, table-driven.**
JOS-168 Decision 5 and JOS-155 Decision 7 together define this rule: a failed phase whose current cycle has a scheduled or in-flight attempt newer than the failure derives that phase's in-progress state. This change adds the decomposition row, which covers *either* attempt stage:

| Failed phase | Attempt stages | In-progress state |
|---|---|---|
| voice-over | `voice-over` | `voice-over-generating` |
| decomposition | `timestamps`, `instructions` | `chunk-decomposing` |

The `instructions` stage comes from JOS-166. Before it lands, only `timestamps` exists. A division retry then has no attempt record until the reasoning call, so it relies on the scheduled attempt of the `decomposition` cycle (JOS-184), which also counts. The rule is one function reading this table. It is not one branch per phase in `deriveSessionState`.

**Decision 6 — A manual retry is offered for every decomposition failure.**
This matches JOS-155 Decision 3. Even a not-retryable segmentation failure gets the button. A retry costs no provider call until segmentation passes, and it fails again at once with the same cause. The cause is shown before the click, and it says the script is not at fault. Hiding the button for some failures would need the page to tell the two steps apart, which the cause already explains in words.

*Alternative considered:* hiding retry when `retryable` is false. The product owner's answer to JOS-155's open question applies here too (task 1.3).

**Decision 7 — The page action.**
`phaseActions` returns `[{ kind: "retry" }]` for the decomposition entry when it is `failed`. The Decomposition section renders `Retry decomposition`, with the same pending, disabled and refusal behaviour as JOS-155 Decision 8, through the same shared component. Whichever story lands second extracts it if the first did not. The live update brings the new state.

## Risks / Trade-offs

- **[JOS-184 names the stage instances differently]** → Task 1.1 records its actual keys. The step choice (Decision 2) maps onto whatever the keys are, and only the mapping changes.
- **[Division retries repeat a deterministic segmentation failure]** → It costs no provider call and gives the same readable cause. It is accepted, see Decision 6.
- **[The instruction provider is called again on a division retry]** → Intended: new `IMAGE` and `VIDEO` instructions are part of dividing again (§10.3). It is one request per attempt, bounded by the cycle.
- **[Overlap with JOS-155 and JOS-166]** → Both touch `phaseActions`, the retry rule and the route pattern. Task 1 rebases on whichever has merged, and reuses its code rather than duplicating it.
- **[Stacked on JOS-168]** → Same close-out retarget as JOS-155 and JOS-166.
- **[Launcher registration collides with JOS-136]** → `registerStageLauncher` throws on a second registration, so the collision cannot be silent. Task 1.2 checks first.

## Migration Plan

No migration. The cycles and scheduled attempts come from JOS-184. Rollback means removing the route, the service, the launcher registration (putting `decomposition` back on `NOT_YET_LAUNCHABLE`) and the action.

## Open Questions

1. Manual retry after a not-retryable failure: shared with JOS-155 Open Question 1. One product-owner answer covers both.
