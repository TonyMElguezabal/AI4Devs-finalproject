# Preserve project progress across restarts

Linear-Issue: JOS-160 (US-28)

## Why

§12.1 and AC14 promise that a restart loses no progress. Every session, chunk, state, result and error must still be there afterwards. Work interrupted mid-flight must also be recovered: wait for the provider's original result if it still holds it, otherwise record a failed attempt and let the retry policy decide.

Much of this already exists:
- the store (SQLite, JOS-181) keeps every record;
- `reconcileOnBoot` (`orchestrator.ts`) recovers two cases:
  - an interrupted **image** request: Fal.ai answers synchronously and keeps nothing, so it is recorded as a failed attempt;
  - an interrupted **clip** request: RunningHub keeps the task, so polling resumes.

Checked on `feature/entrega-2-JAME` (`ecfe430`), what is still lost or stuck after a restart:

- **Work waiting for a slot is lost.** The per-stage request cap queues waiting launches in memory (`concurrency.ts`). A scene queued in `submitted` (image) or `image-complete` (clip) when the process stops is never launched again. Nothing at boot relaunches pending work, so the session stays in `chunks-processing` forever.
- **An interrupted timestamps attempt stays in flight forever.** Boot reconciliation only covers scenes. A `timestamps` attempt left `in-flight` is never completed. The session derives `chunk-decomposing` forever, and its retry can never start.
- **An interrupted decomposition step is never resumed.** A session stopped between storing its timestamps and registering its chunks has no failure and no chunks. It derives `chunk-decomposing` with nothing running.
- **There is no single place that says what a restart does for each stage.** Voice-over (JOS-136), assembly (JOS-149) and the instruction attempts (JOS-166) are being added. Each needs the same two answers, and today there is nowhere to put them.

## What Changes

- **One boot recovery sequence, in two passes**, run before the server accepts requests:
  1. **Settle what was in flight.** For every attempt or request left in flight, ask the stage whether its provider still holds the request:
     - if it does, resume waiting for the original result;
     - if it does not, complete the attempt as a failed, transient "interrupted by a restart" attempt, and apply the same failure handling a live failure would get (retry budget, then failure).

     Settling never launches anything.
  2. **Relaunch pending work.** For every session that is **not paused**, ask each registered stage launcher to launch its pending work through the phase-launch gate. Pending work is work that is due but has neither been sent nor recorded as failed: queued scenes, image-complete scenes awaiting their clip, a decomposition interrupted between steps. Paused sessions launch nothing, as `session-pause` requires.
- **Per-stage recovery rules, stated once**:

  | Stage | Interrupted request | Pending work relaunched |
  |---|---|---|
  | image | lost (Fal.ai is synchronous): failed attempt | `submitted` scenes |
  | clip | RunningHub keeps the task: polling resumes | `image-complete` scenes with a requested duration |
  | timestamps | lost (synchronous): failed attempt; today that records a retryable decomposition failure | — |
  | decomposition | — | a narration with no chunks and no failure: the phase is resumed from the step it reached |
  | voice-over (JOS-136) | lost: failed attempt | a registered session with no voice-over and no failure |
  | assembly (JOS-149) | lost (a local process): failed attempt | all scenes complete, no final video, no failure |

  This change implements the image, clip, timestamps and decomposition rows. The voice-over and assembly rows are requirements their stories implement through the same recovery interface. A gate task implements them here if those stories have already merged.
- **No duplicate launches**: settling does not launch, and relaunching is the only launch at boot. Every launch re-checks the scene or session state before sending, and a launch that finds nothing to do releases its request-cap slot. Tests show a restart never sends the same unit of work twice.
- **Consultation after a restart is proven, not assumed (AC1, AC3)**: tests take a session in every state, then discard all in-memory state while keeping the store, and confirm that the session read matches what it was before. That covers every state, scene state, result reference and error. One end-to-end check restarts the real process with the session page open.

## Capabilities

### New Capabilities

- `restart-recovery`: what a restart keeps and what it does. It covers:
  - the guarantee that a session reads the same after a restart;
  - settling each kind of interrupted request (wait if the provider holds it, otherwise a failed attempt under the retry policy);
  - relaunching pending work for sessions that are not paused, without duplicates;
  - the per-stage recovery interface the remaining stages implement.

### Modified Capabilities

None. `persistence-foundation` (archived) already requires attempts to be recorded before they are sent and repeated confirmations to be refused by the store. This change relies on both and changes neither.

## Impact

- **Backend**:
  - `orchestrator.ts`: `reconcileOnBoot` is split into the settle and relaunch passes. The image settle no longer launches; the relaunch pass does.
  - `launchGate.ts`: a `recoverOnBoot` hook next to each stage launcher, and one `relaunchPendingWork(sessionId)` that every launcher's `launch` serves.
  - `narrationTimestampsPhase.ts`: the failure path is exported, so settling uses the live one.
  - `concurrency.ts`: a launch that finds nothing to do releases its slot.
  - The `decomposition` launcher's pending-work rule.
  - `db.ts`: reads for in-flight session-level attempts and for sessions with pending work.
  - No migration.
- **Frontend**: no change. `useLiveSession` already resyncs on reconnect (JOS-183). The E2E check covers it.
- **API contract**: no change.
- **Depends on**: nothing unmerged for the four rows it implements.
- **Coordination**:
  - **`retry-decomposition` (JOS-156)** also registers the `decomposition` launcher. Whichever lands first registers it, and the other adds its pending-work term.
  - **`generate-voice-over` (JOS-136)** and **`assemble-final-video` (JOS-149)** / **`retry-final-assembly` (JOS-159)** implement their rows through the interface.
  - **`bounded-retry-policy` (JOS-184)** replaces "today's failure handling" with its policy. Settling calls the stage's own failure path, so it follows whatever policy is in force.
  - **`stage-execution-time-limit` (JOS-185)**: a resumed clip poll today restarts its time window. JOS-185 decides whether the window counts from the original send.
- **Out of scope**:
  - persisting the request-cap queue order: relaunch re-queues pending work, first come first served from boot;
  - per-phase time limits;
  - backups or schema migrations of the store.
