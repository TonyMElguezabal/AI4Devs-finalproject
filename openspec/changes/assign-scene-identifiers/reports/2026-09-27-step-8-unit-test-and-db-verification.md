# Step 8 Report - Unit Tests and Database Verification

- Date: 2026-09-27
- Change: assign-scene-identifiers (JOS-144)
- Agent: Claude Opus 5.5
- Branch: `feature/jos-144-assign-scene-identifiers` at `13fa2c1`

## Commands Executed

All from `backend/`, against the default test store (`data/skeleton.sqlite`, `data/projects/`):

- `sqlite3 data/skeleton.sqlite` for row counts, triggers, applied migrations and scene indexes, and `find data -maxdepth 2` (before and after)
- `npx vitest run test/scene-registration-persistence.test.ts test/visual-instructions.test.ts test/visual-instructions.contract.test.ts test/scene-registration.test.ts test/scene-registration-session.test.ts test/scene-api-surface.test.ts --reporter=verbose` (targeted)
- `npm test` (full suite)
- `npm run typecheck`
- Coverage (task 7.3), once, base `853d53d` in a temporary git worktree vs head, each on a scratch database: `npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/**'`

## Unit Test Results

- Targeted: 86 passed, 0 failed, 1 skipped (the opt-in contract test against the real provider, skipped by design; it runs in step 9)
- Full suite: 309 passed, 0 failed, 1 skipped (19 files)
- Type check: exit 0 (`erasableSyntaxOnly` on); `server-runtime-load.test.ts` passes
- Runtime: targeted 1.54 s, full 5.18 s
- **Known intermittent failure, not caused by this change:** `orchestrator.test.ts` (skeleton, JOS-179) sometimes fails with `waitFor timed out` in a full run while passing alone. Measured during this change: 7 of 12 full runs at one point, 0 of 15 and 1 of 12 later; 0 of 12 on the base commit `853d53d` (scratch database); 1 of 8 with this change's new test files excluded. This change touches none of the files that test exercises (`orchestrator.ts` only gained the failure argument of `deriveSessionState` and an exported `broadcast`, which the failing tests do not reach). A hypothesis (the stub provider's delivery timer firing a millisecond before its own readiness check, leaving the scene stuck) was tested with temporary logging and not confirmed in 15 runs; the logging was reverted. The run recorded above passed.

### Coverage (task 7.3)

| Metric | Base `853d53d` | Head | Change |
|---|---|---|---|
| All files, lines | 91.46% | 93.04% | +1.58 |
| All files, branches | 82.28% | 84.90% | +2.62 |
| All files, functions | 97.82% | 98.09% | +0.27 |
| `db.ts`, lines | 97.63% | 97.85% | +0.22 |
| `db.ts`, branches | 87.03% | 87.93% | +0.90 |
| `orchestrator.ts`, branches | 74.62% | 75.71% | +1.09 |
| `routes.ts`, lines | 74.60% | 76.74% | +2.14 |
| `routes.ts`, branches | 88.23% | 85.00% | see note |

`routes.ts` branch coverage reads lower only because V8 counts a function's branches once the function runs. No base test called `/pause`; this change's API-surface test does, so the pause route's unknown-session branch now appears as one uncovered branch (17 of 20 covered, against 15 of 17 before). No branch that was covered before lost its coverage. New files: `sceneRegistration.ts` 97.6% lines (the uncovered lines are the rethrow of a non-unique database error), `visualInstructions.ts` 100% lines (the uncovered branches are the production defaults, exercised by the contract test).

A first head measurement had `db.ts` branches at 85.71%: three `?? ""` fallbacks this change had added for the new `NOT NULL DEFAULT ''` columns could never trigger. They were removed.

## Scenario to Test Mapping (task 7.2)

All 17 scenarios of `specs/scene-registration/spec.md` have a test. `SR` = `test/scene-registration.test.ts`, `SP` = `scene-registration-persistence`, `SS` = `scene-registration-session`, `SA` = `scene-api-surface`, `VI` = `visual-instructions`.

| # | Requirement / scenario | Tests |
|---|---|---|
| 1 | Numbered 1..N: a decomposition is registered | SR "numbers the chunks 1 to N in fragment order with their prompt, image and video, all submitted" |
| 2 | Numbered 1..N: two sessions are registered | SR "gives each session its own chunk 1"; SP "allows the same number in two sessions" |
| 3 | Numbered 1..N: a duplicate number written to the store | SP "refuses a second scene with the same number in the same session"; SR "loses a race cleanly" |
| 4 | Four fields: chunks inspected after a registration | SR "numbers the chunks 1 to N ..." (prompt equals fragment text; image; video) |
| 5 | Four fields: the instructions are requested | SR "asks the generator once, with every fragment text in order and the session's language", "leaves the stored script unchanged"; VI "sends one chat-completions request ... every fragment in order" |
| 6 | Invalid: a duration violates the bounds | SR "refuses a fragment below / above the ... bound without a flag", "refuses a non-positive duration" (each asserts no chunks, phase `decomposition`, a cause that does not blame the script) |
| 7 | Invalid: the §6.1.1 exceptions are accepted | SR "accepts a single fragment below the lower bound flagged script-below-lower-bound", "accepts a fragment above the upper bound flagged unsplittable-sentence", "accepts the exact bounds"; refused misuse: "refuses a script-below-lower-bound flag on one of several fragments" |
| 8 | Invalid: fragments do not reconstruct the script | SR "refuses fragments that do not reconstruct the script", "refuses a fragment missing from the script"; accepted: whitespace differences and a clause-boundary split |
| 9 | Invalid: generated instructions incomplete | SR "refuses too few pairs / an empty instruction / invalid output from the generator"; VI the seven "reports ... as invalid output" tests |
| 10 | Invalid: the reasoning provider fails | SR "records a transient / not-retryable provider failure with its retryability"; VI the HTTP-status, network, time-limit and missing-credential tests |
| 11 | Invalid: the session reports the failure | SS "is failed with failed phase decomposition when a registration was refused", "shows failed with failed phase decomposition and no scenes after a refused registration", "publishes the failure after a refused registration" |
| 12 | Locked: number or prompt changed in the store | SP "refuses a change of idx / prompt / run_id, naming the field, and leaves the scene unchanged" |
| 13 | Locked: a chunk deleted in the store | SP "refuses deleting a chunk, and the chunk still exists" |
| 14 | Locked: visual instructions stay correctable | SP "still lets the visual instructions, the skeleton instruction and the status change" |
| 15 | Locked: API and session page inspected | SA all twelve tests (API). The session page part is covered by the step 10 browser check |
| 16 | Locked: a second decomposition attempted | SR "refuses a session that already has chunks and leaves them unchanged", "refuses a session that already has a scene created some other way" |
| 17 | Start states: a registration succeeds | SS "is chunks-processing right after a successful registration", "lists the chunks in ascending order with their prompt, image and video instructions", "publishes the session's state after a successful registration" |

## Database State Verification

- Pre-test baseline (default test store):
  - Row counts: `runs` 0, `scenes` 0, `provider_requests` 0, `scene_results` 0, `voice_overs` 0, `stage_attempts` 0
  - Triggers (9): `runs_language_locked`, `runs_script_locked`, `runs_title_locked`, `scenes_idx_locked`, `scenes_no_delete`, `scenes_prompt_locked`, `scenes_run_id_locked`, `voice_overs_no_delete`, `voice_overs_no_update`
  - Applied migrations: 2, 3, 4, 5, 6, 7; scene index `scenes_run_id_idx_unique`
  - `data/`: `projects/` (one empty leftover test folder), `skeleton.sqlite`, `-shm`, `-wal`, `store.sqlite`
- Post-test validation: row counts, the nine triggers, migrations and the index identical. The only difference was the name of the empty leftover folder the existing consultation test creates from the current minute (`Traversal Test 2026-09-27 23-56` before, `... 23-57` after).
- State restored: Yes. The empty leftover folder was removed with `rmdir`, leaving `data/projects/` empty.

## Other Evidence

- Mutation checks, both reverted: a temporary `DELETE /sessions/:sessionId/scenes/:sceneId` route and a `.../reorder` route made three `scene-api-surface` tests fail.
- Three older migration fixtures (two in `content-lock.test.ts`, one in `voice-over-persistence.test.ts`) built a database with only a `runs` table, which no real database has; they now create the baseline `scenes` table so migration 7 can alter it.

## Outcome

- Step 8 status: PASS
- Blocking issues: none
- Open: the intermittent `orchestrator.test.ts` failure above, raised with the product owner
