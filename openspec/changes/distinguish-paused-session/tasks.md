# Tasks — Distinguish a paused session from running generations

Tests come first throughout: every behaviour gets a failing test before the code that satisfies it, and every scenario in `specs/paused-session-display/spec.md` has at least one functional test. Backend tests: `cd backend && npm test`. Frontend tests: `cd frontend && npm test`.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-153-distinguish-paused-session` from `feature/entrega-2-JAME` (fetched from origin first, so it includes JOS-146's video stage)
- [x] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations this change stands on

- [x] 1.1 Confirm US-20 (JOS-152) is on the branch: `paused`, `held` on session and scenes, `sessionHeldWork`, image and video launchers registered
- [x] 1.2 Confirm `markSceneInFlight` and the video in-flight mark are the only writers of `image-generating` / `video-generating`, and that both run after `admitLaunch` (US-20 Decision 2), so those states mean "request sent"
- [x] 1.3 List the `AttemptStage` values present on the branch and confirm each records an `in-flight` row before its request; if one does not, stop and record it rather than mapping it

## 2. Backend: running-work derivation (TDD)

- [x] 2.1 Write failing tests for `sessionRunningWork`: scenes `image-generating` count under `image`, `video-generating` under `video`; `in-flight` attempts map `voice-over` → `voice-over` and `timestamps` → `decomposition`; stages in pipeline order, zero counts omitted; empty when nothing is in flight
- [x] 2.2 Write a failing test that, for a paused session with running and held scenes, no scene is in both `running` and `held`
- [x] 2.3 Write a failing test that every `AttemptStage` value has a pipeline-stage mapping, so a new attempt stage without one fails the suite (design Decision 2)
- [x] 2.4 Write a failing test that `running` is reported for a session that is not paused while `held` stays empty (design Decision 3)
- [x] 2.5 Implement `sessionRunningWork` beside `sessionHeldWork`, reading scene statuses and in-flight stage attempts; no new table or column
- [x] 2.6 Run the group 2 tests and confirm they pass

## 3. Backend: payload and API schema (TDD)

- [x] 3.1 Write failing tests that `toSnapshot`, `GET /sessions/:id` and `POST /sessions` include `running` (always an array), matching the spec scenarios "Running and held beside each other", "Nothing running" and "A session-level phase in flight"
- [x] 3.2 Write a failing test that a live session event carries `running` and that a scene leaving `image-generating` updates it in the next event
- [x] 3.3 Add `running` to `SessionEventPayload` in `types.ts`, to `toSnapshot`, and to the Zod response schema in `routes.ts` (response only, described)
- [x] 3.4 Run the group 3 tests and confirm they pass

## 4. Frontend: types and status mapping (TDD)

- [x] 4.1 Write failing tests in `frontend/test/components.test.tsx`: `sceneStatusClass` maps a held scene to `status-queued` for every scene state; a non-held scene keeps its current mapping
- [x] 4.2 Add `running` to `SessionEventPayload` in `frontend/src/types.ts`; give `sceneStatusClass` the optional `held` argument (design Decision 6)
- [x] 4.3 Run the group 4 tests and confirm they pass

## 5. Frontend: session header (TDD)

- [x] 5.1 Write failing tests: a paused session shows its state and "Paused — waiting for you to continue" as separate text; the marker is not `role="alert"` and does not carry the complete or failed class
- [x] 5.2 Write failing tests: while paused, "Still generating: 1 image" from `running`, "Nothing is generating" when `running` is empty, and "Waiting for continue: 2 image" from `held` (absent when `held` is empty), as separate lines in the order of design Decision 5
- [x] 5.3 Write failing tests: when not paused, none of the marker, running, held or "nothing is generating" lines are shown
- [x] 5.4 Write failing tests: a paused `failed` session still shows its failed phase and failed scenes with the marker as its own line; a paused `final-video` session keeps its state styling
- [x] 5.5 Write failing tests for the controls: Continue is offered whenever paused in each of the eight states; Pause whenever not paused except `final-video`; never both
- [x] 5.6 Update `SessionHeader.tsx` and the marker style (`session-paused-marker`, queued token, design Decision 7) to make 5.1–5.5 pass; adjust the existing JOS-152 header tests whose text changes, without weakening what they assert
- [x] 5.7 Run the group 5 tests and confirm they pass

## 6. Frontend: scene rows (TDD)

- [x] 6.1 Write failing tests: with the session paused, a held scene says "waiting for continue" and uses the waiting style; a scene in `image-generating` or `video-generating` that is not held says "still generating"; neither label appears when the session is not paused
- [x] 6.2 Write a failing test that a paused session still renders every scene row with its state (spec "Progress stays visible while paused")
- [x] 6.3 Pass `paused` from `SessionPage` → `SceneList` → `SceneRow` and update `SceneRow.tsx` to make 6.1–6.2 pass
- [x] 6.4 Write a failing test then change in `frontend/test/useLiveSession.test.tsx`: a live event that clears `paused` and changes `running` re-renders without reload (spec "The marker disappears on continue without a reload", "Running reaches an open page live")
- [x] 6.5 Run the group 6 tests and confirm they pass

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review the JOS-152 header and scene-row tests (`components.test.tsx` "held indicator…", "paused marker…") and update them to the new wording, keeping each original assertion's intent
- [x] 7.2 Review backend snapshot and route tests that assert the session payload shape exactly, and add `running` where they compare whole objects
- [x] 7.3 Confirm every scenario in `specs/paused-session-display/spec.md` has at least one functional test, and list the mapping in the step 8 report
- [x] 7.4 Confirm module test coverage has not decreased (backend and frontend)

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture the pre-test state of `data/skeleton.sqlite` (run, scene and stage-attempt counts) and the list of project folders
- [x] 8.2 Run the targeted backend and frontend tests for this change and capture the pass/fail summary
- [x] 8.3 Run both full suites (`cd backend && npm test`, `cd frontend && npm test`) and record totals, failures and runtime
- [x] 8.4 Verify the post-test state matches the baseline; restore it and document the restoration if not
- [x] 8.5 Create the report `openspec/changes/distinguish-paused-session/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [x] 8.6 Mark this step complete only after the tests pass and the report file exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Start the backend on an isolated `DB_PATH` with the stub video provider and test endpoints enabled, and confirm it is reachable
- [x] 9.2 GET a session with nothing in flight and confirm `running: []`; POST a session and confirm the 201 body carries `running`
- [x] 9.3 Drive a session to have a scene in flight and others held while paused (pause, then launch via the test endpoints); GET it and confirm `running` and `held` are disjoint and match the scene states
- [x] 9.4 Continue the session; GET it and confirm `held` is empty and `running` reflects what was launched; then confirm `running` empties once the stub completes
- [x] 9.5 Error cases: GET an unknown and a malformed session id and confirm both answer 404 as before
- [x] 9.6 Delete the isolated DB and the project folders created, and confirm `data/skeleton.sqlite` and `data/projects/` match the pre-test state
- [x] 9.7 Save the transcript as `openspec/changes/distinguish-paused-session/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Start the backend (isolated `DB_PATH`, stubs, test endpoints) and the frontend
- [x] 10.2 Open a session page (`/?sessionId=<id>`), pause it from the page, and assert the state, "Paused — waiting for you to continue", the running/nothing-generating line and the held line are all shown, with no reload
- [x] 10.3 Assert a held scene row reads "waiting for continue" and a sent scene reads "still generating"; take screenshots
- [x] 10.4 Pause a session in `voice-over-complete` and assert Continue is offered; click Continue and assert the marker disappears live
- [x] 10.5 Restore the environment (stop servers, delete the isolated DB and project folders) and save the report as `openspec/changes/distinguish-paused-session/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Add the derived, response-only `running` field to the Session section of `docs/data-model.md`, next to `held`, with its derivation
- [ ] 11.2 Add `running` to the session schema in `docs/api-spec.yml` (every response that carries a session)
- [ ] 11.3 Add to `docs/backend-standards.md`: any stage's in-flight work must be visible to `sessionRunningWork` (an `in-flight` stage attempt or a `*-generating` scene status)
- [ ] 11.4 Add to `docs/frontend-standards.md`: the page renders `held` and `running` as sent and never derives either; the paused marker is a status line, never an alert

## 12. Close out

- [ ] 12.1 Post a Linear comment on JOS-153 summarising the change and linking the reports
- [ ] 12.2 Open the PR against `feature/entrega-2-JAME` with a description linking to JOS-153 and this change
- [ ] 12.3 Obtain review by at least one human, not only AI agents
- [ ] 12.4 Archive the OpenSpec change after merge
