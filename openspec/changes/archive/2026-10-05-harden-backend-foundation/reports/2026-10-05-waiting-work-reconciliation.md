# Waiting work reconciliation verification

The target worktree is outside the session's writable paths. Changes and checks were completed in `/private/tmp/jos186-fix.ZX2Drr`, copied from the clean `feature/jos-186-harden-backend-foundation` worktree. No target files or real database were modified.

Before implementation, the restart suite passed its six existing tests and failed all three added regression tests: waiting image/video queues were empty after restart, and free-capacity image work stayed submitted.

The fix relaunches admitted sessions with waiting scenes after in-flight reconciliation using the existing held-work launchers. Tests cover both stages, restored capacity, duplicate reconciliation, and paused sessions.

Validation in `backend/` with temporary `DB_PATH` and `PROJECTS_ROOT`:

- `npm test -- test/restart-concurrency.test.ts`: 9 passed.
- `npx tsc --noEmit`: passed.
- `npm test`: 69 files passed, 3 skipped; 1200 tests passed, 4 skipped; 28.04 seconds.

No API or schema changes. Existing manual endpoint tasks remain incomplete; this report records automated checks only.

## Re-verification in the real worktree (Claude)

The patch was applied to `feature/jos-186-harden-backend-foundation` and re-checked there: `npx tsc --noEmit` clean, `restart-concurrency` 9 passed, `openspec validate --strict` valid, full suite 1200 passed and 4 skipped (69 files passed, 3 skipped). One of two full runs failed `orchestrator.test.ts` "a transient failure consumes 1 + RETRY_BUDGET attempts". That file fails 4 of 25 runs both with and without this patch (5 ms stub latency and four chained attempts hit the stub's early-timer behaviour described in the step 6 report), so it is not caused by this change.
