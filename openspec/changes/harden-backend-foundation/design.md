## Context

`backend/src/concurrency.ts` is a per-stage FIFO semaphore held in memory: a count of slots in flight per stage, plus a queue of waiting callbacks. `release(stage)` does not know who is releasing. If a waiter is queued, it hands the slot straight to that waiter. Otherwise it decrements the count, clamped at 0.

On boot, `server.ts` sets the image limit and then calls `reconcileOnBoot()` (`orchestrator.ts`). Reconciliation handles in-flight work in three ways:

| Branch | What happens today | Slot? |
|---|---|---|
| Image, bound to a real provider (Fal.ai, synchronous) | Treated as lost: one failed attempt is recorded, and any retry goes through `launchImageStage` → `acquire` | Correct: the lost request holds no slot, and the retry queues normally |
| Image, generic stub still pending | A `setTimeout` is re-armed that calls `handleProviderResult` → `concurrency.release("image")` | **No acquire.** Invisible to the cap while pending. On delivery, the unmatched release hands a slot to a waiter, so the stage goes over its cap |
| Video, request id known | `concurrency.acquire("video", poll)` | The request was already sent at the provider but may sit queued behind the cap: it is uncounted, and its polling is delayed |

The video limit is set at module load (`orchestrator.ts`, `PROVISIONAL_VIDEO_CONCURRENCY`). The image limit is set in `server.ts` before reconciliation. Both are in place before `reconcileOnBoot` runs.

Write capacity: one process, one `DatabaseSync` connection in WAL mode (`db.ts`). `node:sqlite` is synchronous, so writes within this process are serialized by the event loop, not by SQLite locking. The open question is whether recording results and enforcing the `scene_results` uniqueness constraint stay correct, and stay reasonably fast, at 300 scenes with duplicate deliveries. ADR 0002 only went to 20.

## Goals / Non-Goals

**Goals:**
- Already-sent requests count against the cap from the first moment after boot (spec `restart-safe-concurrency`).
- A stray or doubled release cannot change the cap.
- Repeatable evidence that result recording holds at 300 scenes (spec `concurrent-write-capacity`).
- Documentation matches the code: folder layout, the five-stage note, ADR risks closed, artefact decision recorded.

**Non-Goals:**
- Moving `backend/src/` into `domain/` / `persistence/` / `http/` (product owner decision, 2026-10-04).
- Counting work the provider may still be doing for a request we have already recorded as lost (the bound image branch). No identifier exists to poll, and PRD §12.1 already accepts this as one failed attempt.
- Keeping concurrency state across restarts (persisting the semaphore). The source of truth stays `provider_requests` plus scene state, and boot rebuilds the count from them.
- Final per-stage concurrency limits (JOS-167 owns them).

## Decisions

### Decision 1: Slots belong to a holder key

`acquire(stage, holder, onAcquired)` and `release(stage, holder)`, where `holder` is the scene id for scene-level stages (the run id for any session-level stage that later uses the semaphore). The semaphore keeps a `Set<string>` of holders per stage instead of a bare count, and the in-flight count is the set's size. `release` for a holder not in the set is a no-op. That makes double releases and stray releases harmless by construction. A queued waiter keeps its holder key, and when a slot is handed over, the outgoing holder is replaced by the incoming one.

A scene has at most one request in flight per stage at a time (attempts are strictly sequential, `handleProviderResult`'s own comment). The scene id is therefore a unique key within a stage.

A scene must also have at most one slot *or queue entry* per stage. A queued scene is still `submitted`/`image-complete`, so a second launch (for example `continueSession` after a pause that held it while queued) would queue it twice. The second grant sees the scene already moved on and releases, which with holder keys would free the first grant's live slot. So `acquire(stage, holder, onAcquired)` is a no-op when that holder already holds a slot or is already queued in that stage: the existing entry does the work.

*Alternatives considered:*
- **Slot handle object** (`acquire` gives the callback a `{ release() }` handle that only works once). Cleanest API, but every release site would need the handle threaded through closures and async polls (about 25 `release(VIDEO_STAGE)` sites), and a handle cannot survive the hops through `setTimeout`/poll re-entry without extra plumbing. The holder key is already in scope at every site.
- **Only fix the stub branch** (add the missing `acquire`) and keep the anonymous count. Fixes today's bug, but the next unmatched release reintroduces it silently. The spec asks for a guarantee, not a single patch.

### Decision 2: `occupy(stage, holder)` for requests already sent

A new `occupy(stage, holder)` adds the holder to the stage's set unconditionally, even at or above the limit, and never queues. `acquire` already only grants when `size < limit`, so new launches wait until the occupied requests drain below the cap. This reflects the real situation: those requests are at the provider now, and queuing them would neither stop the provider's work nor give an honest count.

`reconcileOnBoot` calls `occupy` for:
- the image-stub "still pending" branch, before re-arming the delivery timer (its delivery then releases a slot it actually holds);
- the video branch with a known request id, replacing today's `acquire`, so polling resumes right away.

`occupy` runs in a pre-pass at the top of `reconcileOnBoot`, before any scene is processed, not inside each branch. `getAllInFlightScenes` returns scenes in table order, so a lost request's retry (which goes through `acquire`) could otherwise start before a later pending request had been counted, which is the gap this change closes. A restart test with the lost scene created first pins that.

After reconciling in-flight requests, collect sessions with `submitted` or `image-complete` scenes and call `launchHeldWork` for admitted sessions. The existing stage launchers determine eligibility; holder deduplication prevents retries already queued during reconciliation from being queued twice. Paused sessions stay held.

Branches that record a failed attempt (provider lost the request, no request id, bound image) call nothing. Their retries take a slot through `acquire` as usual.

*Alternative:* a separate "legacy in-flight" counter added to the cap check. That means two counts to keep in step, and still no ownership. Rejected for the same reason as Decision 1's second alternative.

### Decision 3: The boot order stays as it is, and a test pins it

Both limits are set before `reconcileOnBoot`, and no HTTP request can launch work before `app.listen`, which happens after reconciliation. No change is needed. A test asserts that `stats(stage).inFlight` equals the number of resumed requests right after `reconcileOnBoot()` returns, before anything else runs. A future reorder would then fail that test instead of silently reopening the gap.

### Decision 4: The write-capacity test runs in-process with the stub provider

`test/write-capacity.test.ts` registers one session with 300 scenes, raises the image cap above 300 for the test, launches every scene through the stub provider with zero latency, and then calls `handleProviderResult` twice per request id. The order is shuffled, and each delivery is wrapped in `setImmediate` so deliveries interleave on the event loop instead of running as one synchronous block. Assertions: 300 rows in `scene_results`, 300 duplicate-ignored notes, no thrown store error, a derived session state equal to the small-scale all-complete state, and the same rows read back through a second `DatabaseSync` connection opened on the same file (no `closeDb` exists; the module-level connection stays open). Elapsed time is logged to the console and copied into the Step N+1 report. It is not asserted, because CI hardware varies and the spec makes it evidence, not a threshold.

300 = the upper end of "hundreds of scenes per session" (ADR 0002) at a typical 5-15 s per scene, which is roughly 25-75 minutes of narration. That is already beyond the PRD's realistic scripts.

*Alternative:* a separate load script against the running server over HTTP. That adds HTTP noise that has nothing to do with the store question, and it is not repeatable in `npm test`. Rejected. The curl step (Step N+2) still exercises a restart end to end.

### Decision 5: Per-scene artefacts stay as two columns

`scenes.result` (image path) and `scenes.video_result` (clip path), each with its own uniqueness-guarded commit table (`scene_results`, `scene_video_results`). The number of artefacts per scene is fixed by the PRD at exactly one image and one clip. Final assembly produces a session-level artefact, not a per-scene one. A generic artefacts table only earns its extra ceremony when a scene can hold a variable number of artefacts. Nothing in the PRD calls for that, so the decision is recorded in `docs/data-model.md` and ADR 0002, and no code changes.

### Decision 6: Documentation matches the code, not the other way round

`docs/backend-standards.md` § Project Structure is rewritten to list the actual flat `src/` modules, grouped by role in prose (orchestration, providers, persistence, HTTP, pure domain helpers), with no folder moves. Line 82's "still models … one generic stage" and § Not Yet Decided are corrected: each stage's change implements its own slice, and the generic stub remains only for scenes registered without a decomposition. ADR 0001 § Consequences and ADR 0002 § Risks mark their checks resolved, with links to this change's reports.

### Decision 7: Two small test aids so a restart can be observed by hand

- The stub video provider answers a poll for an id it never saw with its configured mode (`request-lost` still answers `not_found`). Its in-memory map is empty after a restart, so today every resumed stub clip turns into a lost attempt, and the curl step could never show one resuming or settling. Stub only; the RunningHub adapter is untouched.
- `server.ts` accepts the stub video modes directly in `USE_STUB_VIDEO_PROVIDER` (`pending`, `success-bytes`, `request-lost`, besides the older `success` alias); before, every other value fell back to `transient-failure`, so the curl step's `pending` run was not possible.
- `server.ts`'s boot log line adds each stage's `inFlight`/`limit` right after `reconcileOnBoot()`. This is the only observable place for the restart-time count, since no endpoint exposes semaphore stats, and adding one for a diagnostic is not worth an API change.

## Risks / Trade-offs

- [Changing `acquire`/`release` signatures touches every release site in `orchestrator.ts`, so open branches that edit the same lines will conflict] → The change is mechanical: the scene id is already in scope at every site. It lands as one isolated commit, which keeps rebases simple. The PR description lists the open branches to rebase (JOS-153 and any open stage branch).
- [`occupy` can push the in-flight count above the cap after a restart] → Intended, and stated in the spec. The count only drains from there, and no new request is sent while the count is at or above the cap.
- [Raising the image cap to 300 in the write test means the cap plays no part in that test] → Intended: the test isolates the store. The cap is covered by the restart-concurrency tests.
- [Interleaving with `setImmediate` is not true parallelism] → It does reflect the only concurrency this single-process backend has. True multi-connection contention is not a case this architecture can reach, and the report says so.

## Migration Plan

No schema or data migration. No API change. Rollback = revert the commit. The semaphore is in-memory only, so no state is left behind.

## Pre-implementation findings (tasks 1.1, 1.2)

**1.1 — `reconcileOnBoot` branches** (checked after merging `origin/feature/entrega-2-JAME`, 2026-10-05): still exactly the three listed in Context (bound image, stub pending, video). No open branch adds a reconciliation branch. Decision 2's list stands.

**1.2 — semaphore call sites:** all 26 are in `backend/src/orchestrator.ts` (plus 6 in `test/orchestrator.test.ts`). No other open `origin/feature/*` branch adds one: every branch that has them carries the same 26 as integration. The holder key is the scene id at every site: image (`launchScene`, `launchImageStage`, `runImageAttempt`, `handleProviderResult`, reconcile) and video (`launchVideoStage`, `runVideoAttempt`, `pollVideoRequestOnce`, reconcile) all have `sceneId` or `scene.id` in scope. `handleProviderResult` reaches it through `req`/`scene`. The assembly stage does not use the semaphore.

## Open Questions

~~Duplicate queued launches for one scene~~ — resolved in Decision 1 (`acquire` ignores a holder that already holds a slot or is queued).

None other blocking. If JOS-136 (voice-over) lands a session-level semaphore use before this change merges, it adopts the run id as its holder key per Decision 1.
