# Preserve project progress across restarts

Linear-Issue: JOS-160 (US-28)

## Why

§12.1 and AC14 promise that a restart loses no progress. Every session, chunk, state, result and error must still be there afterwards. Work interrupted mid-flight must also be recovered: wait for the provider's original result if it still holds it, otherwise record a failed attempt and let the retry policy decide.

Much of this already exists on `feature/entrega-2-JAME` (`9bb4059`):
- the store (SQLite, JOS-181) keeps every record;
- `reconcileOnBoot` (`orchestrator.ts`) settles interrupted **image** requests (a failed attempt, Fal.ai keeps nothing) and **clip** requests (polling resumes), and, since JOS-186 (`restart-safe-concurrency`), counts resumed requests against the cap and relaunches scenes queued in `submitted` / `image-complete`;
- JOS-136 and JOS-185: an orphaned `voice-over` attempt is timed out by the watcher's startup sweep (it has a 10 s limit and a timeout handler);
- JOS-184: `rebuildScheduler()` re-arms scheduled retries at boot.

Re-checked at gate task 1.1, what is still lost or stuck after a restart:

- **An interrupted `timestamps` or `decomposition` attempt stays in flight forever.** The timeout watcher only times out stages that registered a handler, and these two did not. The session derives `chunk-decomposing` forever, and its retry can never start.
- **An interrupted `assembly` attempt stays in flight forever, and assembly is not relaunched.** Assembly records its attempts but has no time limit (`"undetermined"`) and no handler. Boot relaunch only visits sessions with scenes in `submitted` / `image-complete`, so a session whose scenes are all complete is never visited.
- **There is no single place that says what a restart does for each stage.** Each stage's settle logic lives in a different file, or nowhere.
- **Not fixable here:** nothing in the running app calls `runDecompositionPhase` or launches decomposition after the voice-over (the decomposition launcher only releases scheduled retries). A "resume the interrupted decomposition" rule would be the first live launch of that phase, so it is left to the story that starts decomposition (see Out of scope).

## What Changes

- **One boot recovery sequence, in two passes**, run before the server accepts requests (`recoverOnBoot()`, replacing `reconcileOnBoot()`):
  1. **Settle what was in flight.** Every registered stage settles its in-flight units: wait for the original result if the provider still holds it, otherwise complete the attempt as transient "interrupted by a restart" through the stage's own live failure path. Settling never launches.
  2. **Relaunch pending work** for every session that is not paused, through the phase-launch gate.
- **Per-stage recovery rules, stated once**:

  | Stage | Interrupted request | Pending work relaunched | Status |
  |---|---|---|---|
  | image | lost: failed attempt | `submitted` scenes | exists (JOS-186); pinned by tests |
  | clip | polling resumes | `image-complete` scenes with a requested duration | exists; pinned by tests |
  | voice-over | lost: timed out by JOS-185's sweep | registered session without voice-over | exists; pinned by a test |
  | timestamps | lost: failed attempt, retryable decomposition failure | — | **this change** |
  | decomposition (instructions) | lost: failed attempt, same failure path | rule deferred (no live launch) | settle: **this change** |
  | assembly | lost: failed attempt, then the live retry rule | all scenes complete, no final video, latest attempt settled by a restart with budget left | **this change** |

- **`StageLauncher` gains `settleInFlight()`** so each stage declares its settle rule next to its `launch`.
- **No duplicate launches**: settling does not launch, and relaunching is the only launch at boot. A test shows an assembly attempt settled at boot is relaunched exactly once, and that image and clip pending work is not launched twice.
- **Consultation after a restart is proven, not assumed (AC1, AC3)**: tests take a session in every state, then discard all in-memory state while keeping the store, and confirm that the session read matches what it was before. One end-to-end check restarts the real process with the session page open.

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
  - `orchestrator.ts`: `reconcileOnBoot` becomes `recoverOnBoot`; the image and clip settle code moves into their launchers' `settleInFlight`; the assembly launcher gains a settle and a boot pending rule.
  - `launchGate.ts`: `settleInFlight` on `StageLauncher`, `relaunchPendingWork(sessionId)`.
  - `narrationTimestampsPhase.ts`, `decompositionPhase.ts`: a settle for their in-flight attempts through the live failure path.
  - `db.ts`: reads for sessions with pending work beyond queued scenes.
  - No migration.
- **Frontend**: no change. `useLiveSession` already resyncs on reconnect (JOS-183). The E2E check covers it.
- **API contract**: no change.
- **Depends on**: nothing unmerged. JOS-136, 149, 156, 166, 184, 185 and 186 are merged.
- **Coordination**:
  - **The story that launches decomposition after the voice-over** adds the decomposition pending rule to `decompositionLauncher` (held work, continue and boot then agree).
  - **`retry-final-assembly` (JOS-159)** must keep the assembly pending rule consistent with its own retry state.
  - **`stage-execution-time-limit` (JOS-185)** left a resumed clip poll restarting its time window; unchanged here.
- **Out of scope**:
  - the decomposition pending rule (needs a live launch path first);
  - persisting the request-cap queue order;
  - per-phase time limits;
  - backups or schema migrations of the store.
