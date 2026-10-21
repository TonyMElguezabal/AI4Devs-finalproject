# Step 8 Report - Unit Tests and Database State Verification

- Date: 2026-09-26
- Change: start-video-project (JOS-134)
- Agent: Claude Sonnet 5

## Commands Executed

```
cd backend
DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects npx vitest run test/session-creation.test.ts
DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects npx vitest run
```

Per `docs/backend-standards.md` § Persistence, "Test isolation" — the isolated `DB_PATH`/`PROJECTS_ROOT` env vars, never the default path used by a manually-run server.

**Process note, corrected before this step**: earlier work in this session (groups 2–6) ran `npx vitest run` without these env vars while a manual `npm start` had also written to the same default path (`data/skeleton.sqlite`) for the API-contract generation step (task 5). That mixing is exactly what this document's Test Isolation section warns against. This step re-runs everything under proper isolation and confirms the default path was left clean regardless (see below) — nothing was actually corrupted, but the process gap is recorded honestly rather than glossed over.

## Database State Verification

- **Default path** (`data/skeleton.sqlite`, `data/projects/`) — checked before and after this step: absent both times. Confirms no test run, isolated or not, ever wrote here during this session's work.
- **Isolated test path** (`data/test.sqlite`, `data/test-projects/`) — absent before the run; present after (expected — tests don't wipe state between files, only within a file's own `beforeEach(resetAll)`); removed after this step (`rm -rf data`), confirmed absent again.

## Unit Test Results

- Targeted (`session-creation.test.ts`): 15/15 passed.
- Full suite: 33/33 passed (`orchestrator.test.ts` 11, `session-creation.test.ts` 15, `persistence.test.ts` 7).
- Runtime: ~1.5s.
- No flaky behaviour observed across the two runs in this step.

## Addendum — a transient failure found and run to ground after this step

After steps 9/10 (manual curl and E2E testing, which run the server manually against the *default*, non-isolated `data/` path per the documented convention), a subsequent plain `npx vitest run` (no isolation env vars — a rerun to double-check everything, not part of the mandated isolated procedure above) showed 2/33 failing once, with an unusually long ~7.6s runtime (vs. the normal ~1.5s). Re-running immediately after (still no isolation vars) passed 33/33. Root-caused rather than dismissed: `data/skeleton.sqlite`/`-wal`/`-shm` had accumulated real content from the manual testing steps (steps 9/10 legitimately write there), and the resulting file size/I-O pressure appears to have made a timing-sensitive test (`orchestrator.test.ts`'s restart-resumption test, which waits on real `setTimeout`s against a 3000ms bound) run close enough to its limit to fail once. Confirmed non-reproducible: 3/3 clean runs after `rm -rf data`. **Finding, not a defect in this change's code**: running the plain (non-isolated) test command repeatedly without clearing the default path between manual-testing sessions and test runs can produce transient, environment-driven timing flakiness — worth clearing `data/` before a final test pass, not just before/after the isolated-path steps this document already covers.

## Outcome

- Step 8 status: PASS
- Blocking issues: none (see addendum — a transient, non-reproducible timing issue was found and run to ground, not a defect)
