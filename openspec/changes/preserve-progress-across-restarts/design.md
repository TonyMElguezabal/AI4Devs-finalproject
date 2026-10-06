# Design — Preserve project progress across restarts

## Context

On `feature/entrega-2-JAME` (`9bb4059`), after JOS-136, 149, 156, 166, 184, 185 and 186 merged:

- **Store**: SQLite through `db.ts`. It holds sessions, scenes, `provider_requests`, `stage_attempts` (session-level and scene-level, recorded `in-flight` before sending), `voice_overs`, `narration_timestamps` and results. Files live in the project folder.
- **In memory only, lost on restart**: request-cap queues and counts, poll timers, launch counters, the clip poll loop, stub provider jobs.
- **`server.ts` boot order**: `reconcileOnBoot()`, then `rebuildScheduler()` (JOS-184), then `startAttemptTimeoutWatcher()` (JOS-185, which sweeps once at start), then `listen()`.
- **`reconcileOnBoot`** (`orchestrator.ts`):
  - occupies cap slots for resumed image-stub and clip requests (JOS-186);
  - settles `image-generating` scenes (real provider: transient failure through `applyFailureOutcome` with a relaunch callback; stub: poll) and `video-generating` scenes (missing binding or request id: transient; otherwise resume polling);
  - relaunches queued work through `launchHeldWork`, but only for sessions with scenes in `submitted` or `image-complete`.
- **Launch registry** (`launchGate.ts`): `registerStageLauncher({ stage, heldWork, launch })`. Image, video, voice-over, decomposition and assembly are all registered.
- **Timeout watcher** (`attemptTimeoutWatcher.ts`): times out only in-flight attempts whose stage registered a handler and has a limit. Voice-over has both (10 s). `timestamps` and `decomposition` have no handler; `assembly` has neither a handler nor a limit.
- **Assembly** (`orchestrator.ts`): records an `assembly` attempt, runs the tool, completes the attempt, and retries inside the same function while `attemptNumber < 1 + RETRY_BUDGET`. It is launched from `triggerAssemblyIfReady` when the last scene settles.
- **Decomposition**: `decompositionDependencies.ts` holds production instances of the alignment provider and instruction generator. Nothing in the running app calls `runDecompositionPhase`; the decomposition launcher only releases scheduled retries (`releaseSessionAttempts`).

## Goals / Non-Goals

**Goals:**
- After a restart, every session reads exactly as before (AC1, AC3).
- Pending work continues without User action (AC2).
- Each interrupted request is either awaited, if the provider holds it, or recorded as a failed attempt under the retry policy (AC4), for every stage that records attempts.
- A restart never sends the same unit of work twice, and never sends anything for a paused session.

**Non-Goals:**
- Persisting the cap queue order.
- Time limits (JOS-185).
- Starting decomposition after the voice-over, and its boot relaunch rule.
- Store backups.

## Decisions

**Decision 1 — Two passes at boot: settle, then relaunch.**
`recoverOnBoot()` replaces `reconcileOnBoot()` and runs at the same place in `server.ts`:

1. **Settle.** For each registered stage, call `settleInFlight()`. It completes or resumes the stage's in-flight units. Settling never launches. (The image settle keeps the relaunch callback it has today: JOS-186's `acquire` ignores holders already queued, and a test pins that one request results.)
2. **Relaunch.** For each session that is not paused and has pending work, call `launchHeldWork`. The candidate sessions are those with scenes in `submitted` / `image-complete` (as today) **plus** sessions whose assembly is pending (Decision 3).

*Alternative rejected:* leaving the existing relaunch loop as is. It never visits a session whose scenes are all complete, so an interrupted assembly is never resumed.

**Decision 2 — The recovery interface sits next to the launcher.**
`StageLauncher` gains `settleInFlight(): SettleSummary` (`{ resumed, recordedFailedAttempt }`). Image and video implement it by moving their existing `reconcileOnBoot` blocks unchanged. Voice-over's settle is a no-op that documents the JOS-185 sweep. Timestamps and decomposition settle through the decomposition launcher. A stage in `NOT_YET_LAUNCHABLE` has no recovery, and the boot log lists it.

`launchHeldWork` already launches every stage whose `heldWork` is positive, so boot, continue and held reporting share one definition of pending work.

**Decision 3 — Per-stage rules.**

| Stage | `settleInFlight` | Pending work |
|---|---|---|
| image | unchanged (move) | `submitted` scenes (unchanged) |
| clip | unchanged (move) | `image-complete` scenes with a requested duration (unchanged) |
| voice-over | none: an `in-flight` attempt is timed out by the startup sweep (10 s limit). A test pins that it ends `timed-out` and schedules its retry. | unchanged |
| timestamps | `in-flight` `timestamps` attempts → `transient`, "interrupted by a restart", through `narrationTimestampsPhase`'s failure path (retryable decomposition failure) | — |
| decomposition | `in-flight` `decomposition` attempts → same failure path | rule deferred (see Decision 4) |
| assembly | `in-flight` `assembly` attempts → `transient`, "interrupted by a restart" | all scenes complete (gate open), no final video, no `in-flight` attempt, and the latest `assembly` attempt is a restart-settled `transient` with fewer than `1 + RETRY_BUDGET` attempts (or there is none) |

The assembly pending rule is narrower than its `heldWork`, which counts any open-gate session without a final video. That would relaunch an exhausted or not-retryable assembly at boot, and so reset its budget. Boot therefore adds the "latest attempt" conditions. The relaunch must continue the live attempt count, so the next attempt number is the number of recorded `assembly` attempts plus one.

**Decision 4 — The decomposition pending rule is deferred.**
Nothing in the running app starts decomposition, so a relaunch rule would be its first live launch. It would also change `heldWork`, so continue would start decompositions the live flow never starts. That is a product change for the story that adds the live start. This change ships the timestamps and instruction settles, which close the "stuck `chunk-decomposing` forever" case, and leaves `decompositionLauncher.launch` as it is. The spec scenario for it is dropped.

**Decision 5 — Prove consultation with a simulated restart and with a real one.**
A test helper, `simulateRestart()`, discards in-memory state while keeping the store file:

- cap queues and counts;
- timers;
- launch counters;
- stub jobs;
- the launcher registry, re-registered by re-importing.

It then runs `recoverOnBoot()`. For each session state and scene state, the test compares `GET /sessions/:id` before and after. Everything must match except `updatedAt` and the fields recovery legitimately changed. One E2E run kills and restarts the real server with a page open.

## Risks / Trade-offs

- **[Cap queue order is not kept]** → Pending work is queued again in the order the relaunch pass meets it. Acceptable, because waiting is neither an attempt nor execution time (§10.1).
- **[Assembly relaunch overlaps JOS-159's retry state]** → The pending rule reads only attempt outcomes and counts, which JOS-159 also writes. Task 1 re-checks the merged code, and the coordination note tells JOS-159.
- **[Moving the image and clip settle code]** → Pure moves under existing tests; any behaviour change fails them.
- **[A large store makes boot slower]** → The relaunch pass reads only sessions with pending work, through indexed reads.

## Migration Plan

No migration. On the first boot with this change, sessions already stuck with an orphaned `timestamps`, `decomposition` or `assembly` attempt recover. Rolling back means restoring `reconcileOnBoot`.

## Open Questions

None blocking. The decomposition pending rule is tracked as out of scope, not a question.
