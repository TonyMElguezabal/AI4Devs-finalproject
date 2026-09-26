# Step 7 Report — Unit Tests and Database State Verification

- Date: 2026-09-25
- Change: define-persistence (JOS-181)
- Agent: Claude (Sonnet 5)
- Scope: `openspec/changes/define-backend-stack/skeleton/test/` (`orchestrator.test.ts` from JOS-179, `persistence.test.ts` new in this change), run against an isolated database and project-folders root — never the shared demo state used for the live curl experiments in `reports/2026-09-25-step-8-curl-endpoint-testing.md`.

## Commands Executed

```bash
npx tsc --noEmit
DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects npx vitest run test/persistence.test.ts   # targeted
DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects npx vitest run                              # full suite
```

## Unit Test Results

- Targeted (`persistence.test.ts`): **7 passed, 0 failed**
- Full suite (`orchestrator.test.ts` + `persistence.test.ts`): **18 passed, 0 failed**, ~1.1s
- Notes: the full suite was run **twice in a row** deliberately (see below) to prove a fix, not just once.

Tests map to the required evidence as follows:
| Experiment | Test(s) |
|---|---|
| 5.3 idempotency (store-enforced) | "commits a scene result exactly once…"; "two 'concurrent' confirmations for the same scene: exactly one succeeds" |
| 5.5 same-title isolation | "gives two sessions with the same title in the same minute distinct folders"; "keeps two same-title sessions' records pointed at their own folder only" |
| 5.7 migration survival | "adds new columns with safe defaults without touching pre-existing rows" (against a hand-built version-1 fixture DB) |
| (supporting) | "writes and resolves an artefact relative to the session's own folder"; "creates scenes with a real, non-empty language…" |

5.1 (restart resumption) and 5.2 (unrecoverable case) are covered by the pre-existing `orchestrator.test.ts` (from JOS-179) and additionally re-proven live in `reports/2026-09-25-step-8-curl-endpoint-testing.md` against the now-real store.

## A real bug found and fixed during this step

Running the full suite a **second time** without wiping test state failed:
```
Expected: "My Trip 2026-09-25 04-42 (3) (2)"
Received: "My Trip 2026-09-25 04-42 (4)"
```
`resetAll()` cleared database tables but not the real project-folder directories the tests create on disk (Decision 4 made these real files, not simulated ones). A second run found the previous run's leftover folders and produced different collision-counter suffixes than expected. Fixed by having `resetAll()` also wipe and recreate `PROJECTS_ROOT`. Verified by running the full suite twice in a row after the fix (both green — see commands above). This is exactly the kind of gap that only surfaces by actually re-running the mandatory verification step, not by reasoning about the code, and is recorded as a finding for the ADR.

## Database State Verification

- Pre-test baseline (`data/test.sqlite`, `data/test-projects/`): neither existed
- Post-test validation: `runs=1, scenes=0, provider_requests=0, scene_results=0`, `data/test-projects/` contains 1 entry
  - Consistent with expectations: `beforeEach` resets state before each test, so what remains is whatever the *last* test in the file left — here, `createRun(..., "Language Test", "es")` with no scenes, matching the last test's own assertions.
- State restored: **N/A for the shared demo database** — this isolated test database/folder pair was never shared with `data/skeleton.sqlite` / `data/projects/`, so there is nothing there to restore. The isolated test artifacts themselves are disposable (recreated by the next test run's own `resetAll()`), consistent with `docs/adr/0001-backend-stack.md`'s established pattern.

## Outcome

- Step 7 status: **PASS**
- Blocking issues: none remaining (one found and fixed — see above)
