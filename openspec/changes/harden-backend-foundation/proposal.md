## Why

JOS-186 was written to bootstrap `backend/` from the `define-backend-stack` skeleton. Most of that has happened elsewhere since. `start-video-project` (JOS-134) promoted the skeleton into `backend/`. `define-persistence` (JOS-181) confirmed `node:sqlite` as the engine. Each stage story implements its own stage, as `docs/backend-standards.md` § Not Yet Decided already says: voice-over JOS-136, decomposition JOS-140/144, image JOS-145, video JOS-146, assembly JOS-149. The frontend already resyncs the full state on every SSE reconnect (`frontend/src/api/useLiveSession.ts`). It also already reads `scene.result` (`SceneRow.tsx` renders `result.imageUrl`/`result.videoUrl`).

Two checks the spikes flagged as "worth a dedicated check when this becomes real" were never done. One of them hides a real defect:

- **Concurrency accounting after a restart** (ADR 0001 § Consequences, JOS-167). The per-stage semaphore lives in memory and starts at zero on boot. `reconcileOnBoot` re-arms requests that are still pending without taking a slot. Each one later calls `concurrency.release` when it is delivered. That release has no matching acquire, so it hands a slot to a queued waiter, and the stage goes over its cap. Until then those requests are invisible to the cap. Video requests resumed after a restart go through `acquire`, so already-sent requests can end up queued behind the cap while the cap does not count them.
- **Concurrent-write capacity** (ADR 0002 § Risks). Store-enforced idempotency was proven at 20 scenes completing at the same time, never at the hundreds of scenes per session the MVP targets.

`docs/backend-standards.md` also describes a `domain/` / `persistence/` / `http/` folder layout that `backend/` does not have. The product owner chose to make the document match the real flat layout rather than move every file while several stage branches are still open (decided 2026-10-04).

## What Changes

- On boot, every provider request already sent and still in flight counts against its stage's concurrency cap **before** any new request can start. It holds its slot until it settles, even when there are more of them than the cap. New launches wait until the count drops below the cap.
- Each slot belongs to the request that holds it. A release by a holder that has no slot, or a second release of the same slot, does nothing. A stray or doubled release can no longer hand a slot to a waiter and push the stage over its cap.
- Resumed video polls no longer queue behind the cap. The request was already sent, so it takes its slot right away, like the boot-time image requests.
- A repeatable test proves store-enforced idempotency at MVP scale: 300 scenes in one session complete at the same time, each delivered twice. Every scene gets exactly one recorded result, the store raises no error, and the session reaches its final state. The measured time is recorded in the report.
- The decision on per-scene artefacts is recorded: two fixed columns on `scenes` (image `result`, clip `video_result`) or a separate artefacts table.
- `docs/backend-standards.md` § Project Structure describes the real flat `backend/src/` layout. The outdated "still models one generic stage" sentence is corrected. ADRs 0001 and 0002 mark their two open checks as resolved, with links to the evidence.
- No API, schema or migration changes. No frontend changes.

## Capabilities

### New Capabilities

- `restart-safe-concurrency`: how the per-stage concurrency cap counts provider requests that were already in flight when the process restarted, and the rule that every slot release has a matching slot.
- `concurrent-write-capacity`: the scale at which store-enforced idempotency and result recording must still hold within one session.

### Modified Capabilities

<!-- None. backend-foundation and persistence-foundation keep their requirements; this change adds evidence and closes the risks those ADRs recorded. -->

## Impact

- **Code:** `backend/src/concurrency.ts` (a way to count an already-sent request against the cap, plus release accounting) and `backend/src/orchestrator.ts` (`reconcileOnBoot` image-stub and video branches). `backend/src/server.ts` only if the boot order has to change so limits are set before reconciliation.
- **Tests:** new `backend/test/restart-concurrency.test.ts` and `backend/test/write-capacity.test.ts`. Existing `orchestrator.test.ts` / `video-stage.test.ts` restart cases are reviewed.
- **Docs:** `docs/backend-standards.md`, `docs/adr/0001-backend-stack.md`, `docs/adr/0002-persistence.md`, `docs/data-model.md` (artefact decision note only).
- **Merge risk:** low. No file moves. The edits to `orchestrator.ts` are limited to `reconcileOnBoot` and the release paths. Open branches that touch it (for example JOS-153 `distinguish-paused-session`) need a normal rebase only.
- **Linear:** JOS-186's description is outdated. A comment records the narrowed scope and links this change.
