## JOS-186: Harden the backend foundation (restart-safe concurrency, write capacity, docs)

Target: `feature/entrega-2-JAME`.

### What changed

- **Slots belong to a holder.** `concurrency.acquire(stage, holder, …)` and `release(stage, holder)` keep a set of holders per stage (the scene id). A release by a scene with no slot, or a second release, changes nothing. A scene that already holds a slot or is queued is not queued twice.
- **Requests already sent count against the cap after a restart.** `occupy(stage, holder)` takes a slot even at or above the limit, and `reconcileOnBoot` calls it for every resumed request before processing any scene. New launches wait until the count drains below the cap.
- **Waiting work is relaunched at boot.** Launches queued behind the cap lived only in memory, so after a restart scenes stayed `submitted` or `image-complete` indefinitely. `reconcileOnBoot` now calls `launchHeldWork` for sessions that are not paused. This was found by the real `kill -9` check (step 7), not by the unit suites.
- **Write capacity is proven at 300 scenes.** One session, every result delivered twice: exactly one result per scene, no store error, same derived state, about 540 ms for 600 deliveries.
- **Test aids:** the stub video provider answers ids from before a restart with its configured mode and hands out ids that are unique across restarts; the boot log reports each stage's `inFlight`/`limit`; `USE_STUB_VIDEO_PROVIDER` accepts `pending`, `success-bytes` and `request-lost`.
- **Docs:** `docs/backend-standards.md` matches the real flat `backend/src/` layout and documents holder-owned slots; ADR 0001 and ADR 0002 mark their open checks resolved; the artefact modelling decision (two columns) is recorded in ADR 0002 and `docs/data-model.md`.
- No API, schema, migration or frontend changes.

### Verification

- `npx tsc --noEmit` clean; full backend suite 1201 passed, 4 skipped, also in a fresh worktree with no `backend/.secrets.json`.
- Real `kill -9` restart with the video cap at 3 and 6 scenes: video `inFlight` 3 of 3 right after reconciliation, every waiting scene ran exactly once afterwards.
- Reports: `openspec/changes/harden-backend-foundation/reports/`.
- Known pre-existing flake, not caused by this change: `orchestrator.test.ts` "a transient failure consumes 1 + RETRY_BUDGET attempts" fails about 4 runs in 25 with and without these commits (5 ms stub latency vs the stub's early timer).

### Merge notes

- The `acquire`/`release` signature change touches every call site in `orchestrator.ts` (one mechanical commit, 2.3). No open `origin/feature/*` branch that is not yet in the integration branch touches `orchestrator.ts`, `concurrency.ts` or `orchestrator.test.ts`, so none needs more than a normal merge. A branch that adds a new `concurrency.acquire`/`release` call must pass its scene id (or the run id for a session-level stage) as the holder.
- Linear: comments posted on JOS-186 (narrowed scope) and JOS-167 (restart-time accounting enforced).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
