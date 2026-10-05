# Design — Preserve project progress across restarts

## Context

On `feature/entrega-2-JAME` (`ecfe430`):

- **Store**: SQLite through `db.ts`. It holds sessions (`runs`, with `paused` and `failure`), scenes (state, attempts, results, bindings, instructions, interval, duration, factor), `provider_requests` (image and clip, one row per attempt), `stage_attempts` (session-level, recorded `in-flight` before sending), `voice_overs`, `narration_timestamps`, `scene_results` and `scene_video_results`. Files live in the project folder.
- **In memory only, lost on restart**:
  - the request-cap queues and in-flight counts (`concurrency.ts`);
  - poll timers;
  - launch counters for tests;
  - the clip poll loop;
  - the stub provider's simulated jobs.
- **`server.ts`** calls `reconcileOnBoot()` before `listen()`.
- **`reconcileOnBoot`**:
  - **Image scenes in `image-generating`**:
    - a real bound provider goes through `applyFailureOutcome(transient, "interrupted by a restart")`, with a relaunch callback;
    - a stub scene is polled through `provider.pollResult`.
  - **Clip scenes in `video-generating`**: a missing binding or request id is a transient failure; otherwise it re-acquires a slot and resumes `pollVideoRequestOnce`.
  - Nothing else is reconciled, and nothing pending is relaunched.
- **Launch registry** (JOS-152): `registerStageLauncher({ stage, heldWork, launch })`. Image and video are registered. Voice-over, decomposition and assembly are in `NOT_YET_LAUNCHABLE`. `continueSession` calls `launchHeldWork`, which launches every stage whose `heldWork` count is positive.
- **Decomposition**: `runDecompositionPhase` obtains the timestamps only when they are missing, then divides the script. Nothing in the running app calls it yet, and no production instance of its alignment and instruction dependencies is wired up. A `timestamps` failure records a retryable decomposition failure.

## Goals / Non-Goals

**Goals:**
- After a restart, every session reads exactly as before (AC1, AC3).
- Progress reached before the restart is kept, and pending work continues without User action (AC2).
- Each interrupted request is either awaited, if the provider holds it, or recorded as a failed attempt under the retry policy (AC4).
- A restart never sends the same unit of work twice, and never sends anything for a paused session.

**Non-Goals:**
- Persisting the cap queue order.
- Time limits (JOS-185).
- Implementing the voice-over and assembly stages.
- Store backups.

## Decisions

**Decision 1 — Two passes at boot: settle, then relaunch.**
`recoverOnBoot()` replaces `reconcileOnBoot()` and runs in `server.ts` before `listen()`:

1. **Settle.** For each registered stage, call its `settleInFlight()`. It finds the stage's in-flight units and, for each one:
   - if the provider still holds the request, resumes waiting for it;
   - if not, completes the attempt as failed, transient, "interrupted by a restart", through the stage's **own live failure path**.

   Settling never launches.
2. **Relaunch.** For each session that is not paused, for each registered stage, call `launch(sessionId)`, which launches that stage's pending work through the gate.

The order matters. Settling can turn an in-flight unit into pending work, for example a scene back to `submitted` within its budget, and the relaunch pass then picks it up. Running the relaunch pass once, last, is what keeps a boot from launching a unit twice.

*Alternative rejected:* each reconcile branch launching its own retry, as the image branch does today. Two code paths could then both launch the same scene at boot.

**Decision 2 — The recovery interface sits next to the launcher.**
`StageLauncher` gains `settleInFlight(): SettleSummary`. `launch(sessionId)` already exists. Its contract is tightened to "launch every due, unsent, unfailed unit of this stage for this session, through the gate". That is the same set `heldWork` counts when paused.

One definition of pending work then serves continue (JOS-152), boot relaunch (this change) and held reporting. `relaunchPendingWork(sessionId)` in `launchGate.ts` loops over the registered stages and returns how many units it handed to the gate. A stage in `NOT_YET_LAUNCHABLE` has no recovery. The boot log lists those stages, so the gap is visible.

**Decision 3 — Per-stage rules.**

| Stage | `settleInFlight` | Pending work for `launch` |
|---|---|---|
| image (real) | Scenes in `image-generating` with a bound provider: transient failure through `applyFailureOutcome`, **without** the launch callback. Fal.ai is synchronous and keeps nothing to poll. | `submitted` scenes (unchanged) |
| image (stub) | Poll `provider.pollResult`: resolved → apply; not found → transient; pending → re-arm the timer (unchanged) | same |
| clip | Missing binding or request id → transient. Otherwise re-acquire a slot and resume polling the original task (unchanged). | `image-complete` scenes with a requested duration (unchanged) |
| timestamps | `timestamps` attempts with outcome `in-flight` → complete as `transient`, "interrupted by a restart", through the timestamps phase's exported failure path. Today that records a retryable decomposition failure; under JOS-184 it follows its policy. | — (timestamps are pending only as part of decomposition) |
| decomposition | — (no attempt of its own before JOS-166; an in-flight `instructions` attempt, once JOS-166 lands, is settled like `timestamps`) | Voice-over stored, no chunks, no session failure, no in-flight `timestamps` or `instructions` attempt → `runDecompositionPhase`, which resumes at the step reached (Decision 4) |
| voice-over | Requirement for JOS-136: in-flight `voice-over` attempts → transient (ElevenLabs is synchronous) | Requirement for JOS-136: a registered session with no voice-over, no failure and no in-flight attempt |
| assembly | Requirement for JOS-149/159: in-flight `assembly` attempts → transient (a local process) | Requirement for JOS-149/159: gate open, no final video, no failure, no in-flight attempt |

**Decision 4 — Decomposition resumes at the step it reached; no new record is needed.**
`runDecompositionPhase` already skips the timestamps step when they are stored. So the relaunch rule "voice-over stored, no chunks, no failure, nothing in flight" resumes correctly in every case:

- interrupted before timestamps: it obtains them;
- interrupted after them: it divides;
- interrupted during the instruction call, which is synchronous and so has nothing to wait for: it divides again, sending the instruction request again.

The re-sent instruction request has no attempt record of its own until JOS-166, so it does not count against a budget. That is acceptable, because the reasoning stage has no automatic retries today. JOS-166 settles its orphan first, so it is counted.

This change registers the `decomposition` launcher with this pending rule if `retry-decomposition` (JOS-156) has not. If it has, this change adds the rule to JOS-156's `launch`. The launcher needs production instances of the alignment provider and the instruction generator. If no production wiring exists when this is implemented (none does today), task 1.3 records it as a blocker and only the timestamps settle is shipped for this row.

**Decision 5 — A launch that finds nothing to do releases its slot.**
`launchScene` (the skeleton stub stage), `runImageAttempt` and `runVideoAttempt` re-check the state inside the `concurrency.acquire` callback. The real image and clip stages release their slot when the state no longer matches. The stub stage's `launchScene` returns without releasing, which leaks a slot whenever a stub scene is queued twice. This change makes that early return release too, and adds a test that queues the same scene twice and checks one request and no leaked slot. This is what makes Decision 1's single relaunch safe against a unit that was also queued by a live event during boot.

**Decision 6 — Prove consultation with a simulated restart and with a real one.**
A test helper, `simulateRestart()`, discards all in-memory state while keeping the store file:

- cap queues and counts;
- timers;
- launch counters;
- stub jobs;
- the launcher registry, which is re-registered by re-importing.

It then runs `recoverOnBoot()`.

For each session state and scene state, the test compares `GET /sessions/:id` before and after the restart. Everything must match except `updatedAt` and the fields the recovery legitimately changed: an interrupted attempt now failed, a queued scene now launched. That covers results, errors, `paused`, `held`, `failedPhase` and `failedSceneIndexes`.

One E2E run kills and restarts the real server process with a page open. The page reconnects, resyncs, and shows the same session.

## Risks / Trade-offs

- **[Cap queue order is not kept]** → After a restart, pending work is queued again in the order the relaunch pass meets it: sessions by creation time, scenes by index. That is first come first served from boot. It is acceptable, because waiting is neither an attempt nor execution time (§10.1).
- **[A resumed clip poll restarts its time window]** → This is existing behaviour, left for JOS-185 to decide.
- **[Overlap with JOS-156, JOS-136, JOS-149/159, JOS-166 and JOS-184]** → They all touch launchers or failure paths. The interface in Decision 2 is the meeting point. Task 1 checks each against the merged code first.
- **[A large store makes boot slower]** → The relaunch pass reads only sessions that have pending work, through indexed reads. It does not consult every session.
- **[Decomposition has no production wiring]** → See Decision 4. The settle for `timestamps` ships regardless.

## Migration Plan

No migration. On the first boot with this change, sessions already stuck by the gaps above recover:

- orphaned `timestamps` attempts are settled;
- lost queued scenes are relaunched;
- interrupted decompositions resume, once the decomposition dependencies are wired.

Rolling back means restoring `reconcileOnBoot`.

## Open Questions

None blocking. Production wiring of the decomposition dependencies is tracked as a gate item, not a question.
