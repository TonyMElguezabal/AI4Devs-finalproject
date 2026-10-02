# Tasks — Pause the session and continue explicitly (JOS-152, US-20)

Every code change starts with a failing test (TDD), and every scenario in `specs/session-pause/spec.md` has at least one test. Stages that have no launcher in the code yet (voice-over, decomposition, video, assembly) are exercised through test launchers registered in the test, not through provider calls; the image stage and the stub stage are exercised for real.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Check for an existing `jos-152` branch (local and remote) before creating one
- [x] 0.2 Create branch `feature/jos-152-pause-and-continue-session` from `feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set
- [x] 0.3 Verify the branch was created and is the current branch

## 1. Confirm the baseline

- [x] 1.1 Confirm `orchestrator.ts` on the base branch still has the three inline `paused` checks (`launchScene`, `launchImageStage`, `runImageAttempt`) and the stub-versus-real choice in `continueSession`, `manualRetry` and `applyOutcome`. If another story changed them, update design.md before coding
- [x] 1.2 Check whether a JOS-136, JOS-146, JOS-184 or JOS-185 branch has added a launch, a retry scheduler or a clock since this proposal; record the overlap and which side adopts the gate
- [x] 1.3 Confirm the existing pause tests (`orchestrator.test.ts`, "session pause and continue") and the frontend header tests still describe today's behaviour, so the changes below are deliberate

## 2. The launch gate and the launcher registry (TDD; design Decisions 1, 3, 10)

- [x] 2.1 Failing tests in `launch-gate.test.ts`: `admitLaunch` admits a session that is not paused, holds a paused one with reason `session-paused`, and holds again after a second pause; an unknown session is not admitted
- [x] 2.2 Failing tests for the registry: `registerStageLauncher` keeps pipeline order regardless of registration order; registering a stage twice is refused; `PIPELINE_STAGES` and `NOT_YET_LAUNCHABLE` are disjoint from the registry (the completeness check: neither-nor and both-and fail, per the spec scenarios)
- [x] 2.3 Implement `launchGate.ts` (`admitLaunch`, `PIPELINE_STAGES`, `NOT_YET_LAUNCHABLE`, `registerStageLauncher`, `heldWork`), fully typed, with fields declared explicitly (no parameter properties or enums, strip-only Node), and make 2.1 and 2.2 pass
- [x] 2.4 Add a registry reset helper for tests only, as `concurrency.resetAll` does

## 3. Wire the existing launches through the gate (TDD; design Decisions 1, 2, 5, 11)

- [x] 3.1 Failing tests in `orchestrator.test.ts` and `image-stage.test.ts`, one per held scenario: a first generation, a scene queued for a cap slot when the pause arrives (no attempt consumed, slot passes on), an automatic retry after a sent request fails during the pause, a manual retry during the pause, a correction during the pause; and one per sent-request scenario: success and failure during the pause are applied and nothing new is sent
- [x] 3.2 Replace the three inline checks with `admitLaunch`, on entry and again inside the slot callback immediately before the in-flight mark; confirm by reading the code that no `await` sits between them (design Decision 2)
- [x] 3.3 Add `launchSceneStage(sceneId)` as the single stub-versus-real dispatcher and call it from the sweep, `manualRetry` and `applyOutcome`; remove the duplicated `if`
- [x] 3.4 Failing test then change: a pause landing between the admission and the in-flight mark cannot occur (a launch is sent or held), using an injected hook between the two steps of the stub path and of `runImageAttempt`
- [x] 3.5 Route `reconcileOnBoot` launches through the gate; failing test first: a paused session whose request resolved while the process was down gets the result applied and nothing launched
- [x] 3.6 Wire `runDecompositionPhase` and `segmentStoredTimestamps` to the gate: while paused they return `{ ok: false, reason: "held" }` and start nothing (failing test first; extend `DecompositionPhaseResult`)
- [x] 3.7 Make 3.1 to 3.6 pass

## 4. Held work and the image launcher (TDD; design Decisions 3, 4, 5, 6)

- [x] 4.1 Failing tests: `heldWork` for the image stage lists `submitted` scenes in ascending index; returns nothing for scenes already in flight; a retry recorded as pending is held; a scene queued for the cap in a session that is not paused is not reported held
- [x] 4.2 Register the image-stage launcher (`heldWork` from the `submitted` scenes, `launch` through `launchSceneStage`), remove `image` from `NOT_YET_LAUNCHABLE`, and make 4.1 pass
- [x] 4.3 Failing tests with test launchers for stages that do not exist yet: work that became startable during the pause (a decomposition and a video launcher whose `heldWork` becomes non-empty while paused) is reported held and is launched by continue; the session state before and after the pause is unchanged (design Decision 6)

## 5. Continue (TDD; design Decision 4)

- [x] 5.1 Failing tests: continue launches held scenes 1 to 3 in ascending order; continue launches held work of every registered stage in pipeline order; continue twice sends each unit once and both answer success; continue on a session that is not paused launches nothing; a pause during the sweep holds the remaining units; a retry whose due time is in the future waits for it
- [x] 5.2 Add the conditional store write that clears the marker only if it was set (`setRunPaused` returning whether a row changed, or a dedicated `clearRunPause`), and make `continueSession` sweep only when it did
- [x] 5.3 Make `continueSession` walk the registry instead of the `submitted` loop and make `pauseSession` idempotent (no broadcast when already paused); make 5.1 pass
- [x] 5.4 Failing test then change: a continue that races a cap-queued waiter for the same scene sends the scene once (the store state decides, not a flag)

## 6. Pause never reverts work; held time is not execution time (TDD)

- [x] 6.1 Failing tests: a long pause leaves every completed result, attempt, failure and file unchanged and readable; pause and continue write nothing but the marker; a held launch has no attempt and no `sentAt`, and its first attempt after continue is attempt 1 sent at or after the continue
- [x] 6.2 Make 6.1 pass; if it already holds, record that in the test name and keep the tests as the guard
- [x] 6.3 Failing test: a pause in one session leaves another session's launches sending, and the slot a paused waiter gave up is used by another session's waiter (`concurrency.ts` unchanged)

## 7. Representation and API (TDD; design Decisions 7, 8)

- [x] 7.1 Failing tests in `session-read.test.ts` and `session-api-surface.test.ts`: a paused session reports `held` stages with unit counts and scene `held` flags (scene 1 in flight not held, scenes 2 and 3 held); a decomposition awaiting continuation reports one unit while the state is `voice-over-complete`; a session that is not paused reports an empty `held` and no held scene; the held list equals what continue then launches
- [x] 7.2 Add `held` to the session and scene payload types and Zod response schemas (response only), computed in `toSnapshot` from the registry and only while paused; the paused marker stays its own field
- [x] 7.3 Failing tests for the endpoints: pause twice and continue twice answer `200 { ok: true }`; an unknown session answers 404; pause and continue are accepted in `failed` and `final-video`; a retry in a paused `failed` session is held
- [x] 7.4 Make 7.1 to 7.3 pass; confirm the live event carries the same fields as the read (`define-live-updates`), so an open page sees them without reloading

## 8. Frontend

- [x] 8.1 Failing component tests in `components.test.tsx`: the header shows "paused" plus the held stages and counts, distinct from a generating line; a held scene row says it is waiting for continue, and a generating scene in the same session does not; nothing shows held when not paused
- [x] 8.2 Update `types.ts`, `SessionHeader.tsx` and `SceneRow.tsx` (text, not colour alone, per `visual-design`); keep the pause and continue buttons; make 8.1 pass
- [x] 8.3 Failing test then change in `useLiveSession.test.tsx`: a `held` change in a live event re-renders without reload

## 9. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 9.1 Review every existing test that reads or sets `paused`, calls `launchScene`, `launchImageStage`, `pauseSession`, `continueSession`, `manualRetry` or `reconcileOnBoot`, and every test that builds a session payload by hand; update each to the gate and the `held` fields
- [ ] 9.2 Confirm module test coverage has not decreased (compare against this change's propose commit)

## 10. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 10.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents
- [ ] 10.2 Run the targeted tests (gate, registry, orchestrator, image stage, session read and API surface, components)
- [ ] 10.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`
- [ ] 10.4 Verify the post-test state matches the baseline; restore it if not
- [ ] 10.5 Create the report `openspec/changes/pause-and-continue-session/reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md`
- [ ] 10.6 Mark this step complete only after the tests pass and the report file exists

## 11. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Start the real server on a scratch store and scratch projects folder; confirm `GET /health`
- [ ] 11.2 Create a session and register chunks directly (`registerDecomposition`, as earlier steps did); `curl POST .../pause`, then `GET /sessions/:id`: `paused: true`, `held` listing the image stage, the state unchanged
- [ ] 11.3 With a request in flight, pause and confirm the scene reaches `image-complete` while paused and its next stage is not started; `curl POST .../continue` and confirm the held scenes launch once
- [ ] 11.4 Pause twice and continue twice: both answer `200 { ok: true }` and no second launch occurs
- [ ] 11.5 Error cases: pause and continue on an unknown session answer 404 in the documented shape; a retry on a failed scene while paused is accepted and held
- [ ] 11.6 `curl GET /docs/json`: `held` is documented on responses only and the pause and continue operations describe their idempotence
- [ ] 11.7 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/pause-and-continue-session/reports/YYYY-MM-DD-step-11-manual-endpoint-testing.md`

## 12. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 12.1 Decide applicability: the session header and scene rows change, so it applies
- [ ] 12.2 Run backend (scratch store) and frontend; prepare a session with scenes not yet launched and one in flight
- [ ] 12.3 Open the session page, pause, and confirm the header shows "paused" with the held stages, the in-flight scene finishes, and held scenes say they wait for continue
- [ ] 12.4 Continue and confirm the held scenes move to generating without a reload, and the held text disappears
- [ ] 12.5 Restore the environment and save `openspec/changes/pause-and-continue-session/reports/YYYY-MM-DD-step-12-e2e.md`

## 13. Update Technical Documentation (MANDATORY)

- [ ] 13.1 `docs/data-model.md`: record that `paused` is the only stored pause fact, that held work is derived (start rule per stage) and never stored, and the `held` response fields
- [ ] 13.2 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only content changes are `held` on the session and scene schemas and the idempotence notes on pause and continue
- [ ] 13.3 `docs/backend-standards.md`: record the launch-gate rule — every provider launch asks `admitLaunch` and has no `await` between it and the in-flight mark; a retry is recorded as scheduled before it asks the gate; a new stage registers a launcher and removes itself from `NOT_YET_LAUNCHABLE`
- [ ] 13.4 `docs/PRD-v1.4.md`: check §8.3 and §9 need no wording change; if the open question on in-flight clocks is answered, record the decision there
- [ ] 13.5 Check `docs/frontend-standards.md` for the held indicator; add a line only if the standards list session markers

## 14. Close out

- [ ] 14.1 Ask the user before commenting on JOS-184, JOS-185, JOS-136 and JOS-146 that their launches must call `admitLaunch` and record before gating, and that each registers a launcher
- [ ] 14.2 Ask the user to confirm Open Question 1 (does a pause also freeze the clock of a request already sent) before JOS-185 is implemented
- [ ] 14.3 Ask before pushing; open the PR with a description linking to JOS-152
- [ ] 14.4 Obtain review by at least one human, not only AI agents
- [ ] 14.5 Archive the OpenSpec change after merge
