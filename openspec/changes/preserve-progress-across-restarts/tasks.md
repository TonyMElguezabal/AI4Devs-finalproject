# Tasks — Preserve project progress across restarts (JOS-160, US-28)

Every code change starts with a failing test (TDD), and every scenario in `specs/restart-recovery/spec.md` has at least one test. Restarts in unit tests use a `simulateRestart()` helper. It discards all in-memory state (request-cap queues and counts, timers, launch counters, stub jobs, the launcher registry), keeps the store, then runs `recoverOnBoot()`. Providers are stubs. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-160-preserve-progress-across-restarts` from `origin/feature/entrega-2-JAME` (the MVP integration branch), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 `git fetch`. Base re-checked against `origin/feature/entrega-2-JAME` (`9bb4059`, merged into this branch as `11fbec1`). Result: JOS-136, 149, 156, 166, 184, 185 and 186 are merged. `reconcileOnBoot` still covers image and clip scenes only; JOS-186 already relaunches queued `submitted` / `image-complete` scenes and counts resumed requests against the cap; orphaned `voice-over` attempts are timed out by JOS-185's startup sweep; `timestamps`, `decomposition` and `assembly` in-flight attempts are not settled.
- [x] 1.2 Re-scoped proposal, design and spec to the remaining gaps (see design Decisions 1-4): dropped the queued-work relaunch and slot-leak items (done by JOS-186), added the voice-over pin, the `decomposition` instructions settle and the assembly settle and boot pending rule, and deferred the decomposition pending rule.
- [x] 1.3 Production wiring exists (`decompositionDependencies.ts`), but nothing in the running app launches decomposition after the voice-over. Recorded as out of scope for the decomposition pending rule (design Decision 4). The timestamps and instructions settles ship.

## 2. Backend: restart harness and consultation (TDD; design Decision 5)

- [x] 2.1 Add `simulateRestart()` to the test helpers. Extend the existing restart test in `orchestrator.test.ts` to use it.
- [x] 2.2 Write a failing-or-pinning test in a new `restart-recovery.test.ts`:
  - build sessions in each session state, with scenes in each scene state, stored results, errors, a paused session with held work, and `failedSceneIndexes`;
  - restart;
  - `GET /sessions/:id` equals the pre-restart read, apart from update times and recovery changes.

  Record which parts already passed. **Result:** all of it passed on the first run (a pinning test): scenes in `submitted`, `image-complete`, `chunk-complete` and `failed` with their results and errors, a paused session with held work, and a session with no scenes read the same after `simulateRestart()`. In-flight scene states are covered by group 3.
- [x] 2.3 Write a test: a paused session sends nothing at boot, and its held work is unchanged.

## 3. Backend: settle pass (TDD; design Decisions 1-3)

- [x] 3.1 Write tests pinning the existing behaviour: an image scene in `image-generating` with a bound provider is settled as transient "interrupted by a restart" and sends exactly one new request within budget; an exhausted one becomes `failed`; a submitted clip task is polled again and its original result is applied; a missing request id is transient. **Result:** passed on the first run. The image cases (including the exhausted one, `restart-settle.test.ts`) and the clip cases (`video-stage.test.ts`, `restart-concurrency.test.ts`) already held.
- [x] 3.2 Write a test pinning JOS-185: an `in-flight` `voice-over` attempt at boot ends `timed-out` and its retry is scheduled. **Result:** passed once the test imported `voiceOverPhase.ts`, which registers the timeout handler as the running app does.
- [x] 3.3 Write failing tests: an `in-flight` `timestamps` attempt is completed as `transient` with the restart cause, through the phase's failure path. The session then records a retryable decomposition failure and stops deriving `chunk-decomposing`. The same for an `in-flight` `decomposition` attempt.
- [x] 3.4 Write a failing test: an `in-flight` `assembly` attempt is completed as `transient` with the restart cause.
- [x] 3.5 Add `settleInFlight` to `StageLauncher`. Move the image and clip settle code into their launchers; add the timestamps/decomposition settle (export and reuse the failure path from `narrationTimestampsPhase.ts` and the division failure path) and the assembly settle. Make 3.3 and 3.4 pass; 3.1 and 3.2 stay green.

## 4. Backend: relaunch pass (TDD; design Decisions 1-3)

- [x] 4.1 Write tests pinning the existing behaviour: `submitted` scenes queued behind the cap are launched once after restart; `image-complete` scenes with a requested duration have their clip launched once; paused sessions launch nothing. **Result:** already held and pinned by `restart-concurrency.test.ts` ("waiting work survives a restart"); no new test needed.
- [x] 4.2 Write failing tests for assembly:
  - all scenes complete, no final video, attempt settled by the restart with budget left: one new attempt, numbered next in the sequence;
  - budget spent, or latest attempt not retryable: nothing launched;
  - gate closed, or session paused: nothing launched.
- [x] 4.3 Write a failing test: the units `heldWork` reports while paused, the units `continueSession` launches, and the units boot relaunches when unpaused are the same set, for image and clip.
- [x] 4.4 Implement the assembly boot pending rule, `recoverOnBoot()` (settle, relaunch over the extended candidate sessions, then log the stages with no launcher) and replace `reconcileOnBoot` in `server.ts`. Make 4.2 and 4.3 pass.

## 5. Backend: no duplicates (TDD; design Decision 1)

- [x] 5.1 Write tests: an image attempt settled with budget left is relaunched exactly once across settle and relaunch; an assembly attempt settled at boot is run exactly once; a live chunk event during boot does not cause a second send.
- [x] 5.2 Fix whatever 5.1 shows, if anything; record the result. **Result:** 5.1 passed as written (image and live-event cases; the assembly case is in `restart-assembly.test.ts`), so nothing needed fixing.

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Review the tests that call `reconcileOnBoot` (`orchestrator.test.ts`, `image-stage.test.ts`, `video-stage.test.ts`, server boot tests) and the launch-gate tests (`StageLauncher` shape, `NOT_YET_LAUNCHABLE` contents); move them to `recoverOnBoot` and the new interface.
- [x] 6.2 Confirm every scenario in `specs/restart-recovery/spec.md` has at least one test, and map ticket AC1-AC4 to tests; list both in the step 7 report.
- [x] 6.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents.
- [x] 7.2 Run the targeted tests: `restart-recovery`, `orchestrator`, `image-stage`, `video-stage`, `launch-gate`, `obtain-narration-timestamps`, `assembly`.
- [x] 7.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`.
- [x] 7.4 Verify the post-test state matches the baseline; restore it if not.
- [x] 7.5 Create the report `openspec/changes/preserve-progress-across-restarts/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`.
- [x] 7.6 Mark this step complete only after the tests pass and the report file exists.

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the real server on a scratch store and scratch projects folder, with stub providers, the image stub slow and the request cap at 1; confirm `GET /health`.
- [x] 8.2 Create a decomposed session with several scenes, so one is in flight and the others are queued. `curl GET /sessions/:id` and save the body. Kill the process (`kill -9`). Then:
  - restart it;
  - `curl GET /sessions/:id` matches the saved body apart from the recovery changes;
  - the boot log shows the settle and relaunch counts;
  - every scene eventually completes.
- [x] 8.3 Insert an `in-flight` `timestamps` attempt, and an `in-flight` `assembly` attempt on a session with all scenes complete, in the scratch store, then restart (the assembly one is relaunched once). `curl GET /sessions/:id` shows `failed` with `failedPhase: "decomposition"` and a restart cause, no longer `chunk-decomposing`.
- [x] 8.4 Pause a session with held work, then restart. `curl` shows it still paused with the same held work, and the stub log shows no request for it. `POST /continue` then launches it.
- [x] 8.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/preserve-progress-across-restarts/reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`.

## 9. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 9.1 Decide applicability: no UI change, but AC1-AC3 are user-visible across a restart, so it applies.
- [x] 9.2 Run backend (scratch store, slow stubs) and frontend. Open a session mid-processing and note its scene states.
- [x] 9.3 Kill and restart the backend. The page reconnects without a reload, shows the same session and scenes, and continues to progress to completion.
- [x] 9.4 Restore the environment and save `openspec/changes/preserve-progress-across-restarts/reports/YYYY-MM-DD-step-9-e2e.md`.

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 `docs/api-spec.yml`: confirm no change is needed (no route or schema changes); record that in the step 7 report.
- [x] 10.2 `docs/data-model.md`: record what is persisted and what is in memory only (cap queues, timers), and that pending work is recomputed from the store at boot.
- [x] 10.3 `docs/backend-standards.md`: document the boot sequence (settle, then relaunch), the `StageLauncher` recovery contract each new stage must implement, the per-stage table.
- [x] 10.4 Note that a backend restart is safe mid-processing, and what the boot log reports. Written in `backend/README.md` (*Restarting*), not `docs/development_guide.md`: that file is a leftover from another project (Prisma and PostgreSQL setup, no Vid4You content), and the README is the developer-facing run guide of this backend.

## 11. Close out

- [ ] 11.1 Ask the user before commenting on JOS-159 (assembly boot rule consistent with its retry state) and on the story that launches decomposition after the voice-over (it adds the decomposition pending rule).
- [ ] 11.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-160.
- [ ] 11.3 Obtain review by at least one human, not only AI agents.
- [ ] 11.4 Archive the OpenSpec change after merge.
