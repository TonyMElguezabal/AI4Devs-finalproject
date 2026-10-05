# Tasks — Preserve project progress across restarts (JOS-160, US-28)

Every code change starts with a failing test (TDD), and every scenario in `specs/restart-recovery/spec.md` has at least one test. Restarts in unit tests use a `simulateRestart()` helper. It discards all in-memory state (request-cap queues and counts, timers, launch counters, stub jobs, the launcher registry), keeps the store, then runs `recoverOnBoot()`. Providers are stubs. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-160-preserve-progress-across-restarts` from `origin/feature/entrega-2-JAME` (the MVP integration branch), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [ ] 1.1 `git fetch`. Confirm the base still matches design.md § Context:
  - `reconcileOnBoot` covers only image and clip scenes;
  - the image branch launches its own retry;
  - nothing relaunches pending work;
  - `timestamps` in-flight attempts are not settled.

  Record which of JOS-136, JOS-149/159, JOS-156, JOS-166 and JOS-184 have merged.
- [ ] 1.2 For each merged story in 1.1, add its row from design Decision 3 to this change's scope:
  - **JOS-136**: voice-over settle and pending;
  - **JOS-149/159**: assembly settle and pending;
  - **JOS-166**: `instructions` settle;
  - **JOS-156**: add the decomposition pending rule to its launcher instead of registering one.

  Update the spec to match.
- [ ] 1.3 Check whether production instances of the alignment provider and the instruction generator are wired into the running app. If not, record it here as a blocker for the decomposition relaunch row. Ship the timestamps settle without it, and leave the decomposition pending rule tested only with injected stubs.

## 2. Backend: restart harness and consultation (TDD; design Decision 6)

- [ ] 2.1 Add `simulateRestart()` to the test helpers. Extend the existing restart test in `orchestrator.test.ts` to use it.
- [ ] 2.2 Write a failing-or-pinning test in a new `restart-recovery.test.ts`:
  - build sessions in each session state, with scenes in each scene state, stored results, errors, a paused session with held work, and `failedSceneIndexes`;
  - restart;
  - `GET /sessions/:id` equals the pre-restart read, apart from update times and recovery changes.

  Record which parts already passed.
- [ ] 2.3 Write a test: a paused session sends nothing at boot, and its held work is unchanged.

## 3. Backend: settle pass (TDD; design Decisions 1-3)

- [ ] 3.1 Write failing tests:
  - an image scene in `image-generating` with a bound provider is settled as transient "interrupted by a restart" and is *not* launched by the settle pass;
  - an exhausted one becomes `failed`.
- [ ] 3.2 Write tests pinning the existing clip behaviour: a submitted task is polled again and its original result is applied; a missing request id is transient.
- [ ] 3.3 Write failing tests: an `in-flight` `timestamps` attempt is completed as `transient` with the restart cause, through the phase's failure path. The session then records a retryable decomposition failure and stops deriving `chunk-decomposing`.
- [ ] 3.4 Add `settleInFlight` to `StageLauncher`. Implement it for image (no launch callback), clip (unchanged) and timestamps (export and reuse the failure path from `narrationTimestampsPhase.ts`). Make 3.1-3.3 pass.

## 4. Backend: relaunch pass (TDD; design Decisions 1, 2 and 4)

- [ ] 4.1 Write failing tests:
  - `submitted` scenes that were queued behind the cap are launched once after restart;
  - `image-complete` scenes with a requested duration have their clip launched once;
  - paused sessions launch nothing.
- [ ] 4.2 Write failing tests, with injected decomposition dependencies:
  - a session with a voice-over, no timestamps, no chunks and no failure is resumed and obtains the timestamps;
  - a session with stored timestamps and no chunks divides without a new `timestamps` attempt;
  - a session with a failure is not resumed.
- [ ] 4.3 Write a failing test: the units `heldWork` reports while paused, the units `continueSession` launches, and the units boot relaunches when unpaused are the same set, for image, clip and decomposition.
- [ ] 4.4 Implement `relaunchPendingWork(sessionId)` and `recoverOnBoot()` (settle, then relaunch, then log the stages with no launcher). Register or extend the `decomposition` launcher with its pending rule (Decision 4). Replace `reconcileOnBoot` in `server.ts`. Make 4.1-4.3 pass.

## 5. Backend: no duplicates (TDD; design Decision 5)

- [ ] 5.1 Write failing tests:
  - a stub scene queued twice sends one request and leaves no slot held;
  - an image attempt settled with budget left is relaunched exactly once across settle and relaunch;
  - a live chunk event during boot does not cause a second send.
- [ ] 5.2 Make the stub stage's `launchScene` release its slot on its early return; make 5.1 pass.

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 6.1 Review the tests that call `reconcileOnBoot` (`orchestrator.test.ts`, `image-stage.test.ts`, `video-stage.test.ts`) and the launch-gate tests (`StageLauncher` shape, `NOT_YET_LAUNCHABLE` contents); move them to `recoverOnBoot` and the new interface.
- [ ] 6.2 Confirm every scenario in `specs/restart-recovery/spec.md` has at least one test, and map ticket AC1-AC4 to tests; list both in the step 7 report.
- [ ] 6.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 7.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents.
- [ ] 7.2 Run the targeted tests: `restart-recovery`, `orchestrator`, `image-stage`, `video-stage`, `launch-gate`, `obtain-narration-timestamps`.
- [ ] 7.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`.
- [ ] 7.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 7.5 Create the report `openspec/changes/preserve-progress-across-restarts/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`.
- [ ] 7.6 Mark this step complete only after the tests pass and the report file exists.

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Start the real server on a scratch store and scratch projects folder, with stub providers, the image stub slow and the request cap at 1; confirm `GET /health`.
- [ ] 8.2 Create a decomposed session with several scenes, so one is in flight and the others are queued. `curl GET /sessions/:id` and save the body. Kill the process (`kill -9`). Then:
  - restart it;
  - `curl GET /sessions/:id` matches the saved body apart from the recovery changes;
  - the boot log shows the settle and relaunch counts;
  - every scene eventually completes.
- [ ] 8.3 Insert an `in-flight` `timestamps` attempt in the scratch store, then restart. `curl GET /sessions/:id` shows `failed` with `failedPhase: "decomposition"` and a restart cause, no longer `chunk-decomposing`.
- [ ] 8.4 Pause a session with held work, then restart. `curl` shows it still paused with the same held work, and the stub log shows no request for it. `POST /continue` then launches it.
- [ ] 8.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/preserve-progress-across-restarts/reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`.

## 9. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Decide applicability: no UI change, but AC1-AC3 are user-visible across a restart, so it applies.
- [ ] 9.2 Run backend (scratch store, slow stubs) and frontend. Open a session mid-processing and note its scene states.
- [ ] 9.3 Kill and restart the backend. The page reconnects without a reload, shows the same session and scenes, and continues to progress to completion.
- [ ] 9.4 Restore the environment and save `openspec/changes/preserve-progress-across-restarts/reports/YYYY-MM-DD-step-9-e2e.md`.

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/api-spec.yml`: confirm no change is needed (no route or schema changes); record that in the step 7 report.
- [ ] 10.2 `docs/data-model.md`: record what is persisted and what is in memory only (cap queues, timers), and that pending work is recomputed from the store at boot.
- [ ] 10.3 `docs/backend-standards.md`: document the boot sequence (settle, then relaunch), the `StageLauncher` recovery contract each new stage must implement, the per-stage table, and the slot-release rule for acquire callbacks.
- [ ] 10.4 `docs/development_guide.md`: note that a backend restart is safe mid-processing, and what the boot log reports.

## 11. Close out

- [ ] 11.1 Ask the user before commenting on JOS-136, JOS-149/159, JOS-156, JOS-166 and JOS-185. The first four should implement their rows of the recovery interface. JOS-185 should decide whether a resumed clip poll keeps its original time window.
- [ ] 11.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-160.
- [ ] 11.3 Obtain review by at least one human, not only AI agents.
- [ ] 11.4 Archive the OpenSpec change after merge.
