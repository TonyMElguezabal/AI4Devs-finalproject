# Tasks — Ignore repeated success confirmations (JOS-161, US-29)

Every code change starts with a failing test (TDD). Each acceptance criterion has at least one test per stage where it applies. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties). Tests run on an isolated `DB_PATH` with `PROJECTS_ROOT` in a separate folder, because `resetAll()` clears `PROJECTS_ROOT`.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-161-handle-repeated-success-confirmations` from `origin/feature/entrega-2-JAME` (the MVP integration branch), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [ ] 1.1 `git fetch`. Confirm the base still matches design.md § Context: `completeImageStage` calls `markImageComplete` before checking the commit; `setFinalVideoPath` is unconditional; `runAssemblyAttempt` has no final-video or in-flight check. Record whether JOS-159 has merged, and if it has, check its assembly start against Decision 3 and update the artifacts first.

## 2. Backend: pin the stages that already hold (design Decision 4)

- [ ] 2.1 Voice-over: a second confirmation of the same session's voice-over stores no second `voice_overs` row and launches nothing. Reuse an existing test if one already proves it; otherwise add one.
- [ ] 2.2 Timestamps: a second stored set is refused as `already-obtained`, and division runs at most once.
- [ ] 2.3 Decomposition: registering chunks twice adds no scene and launches each scene's image once.
- [ ] 2.4 Clip: a clip confirmed twice stores one `scene_video_results` row, leaves the scene `chunk-complete`, and triggers assembly at most once.

Record which tests already existed.

## 3. Backend: image confirmations (TDD; design Decision 1)

- [ ] 3.1 Write failing tests through the test-only export of `completeImageStage`:
  - a second image confirmation for a scene in `video-generating` leaves its state, `result` and `current_request_id` unchanged, and sends no clip request;
  - the same for a scene in `chunk-complete`;
  - the first confirmation still stores the result, sets `image-complete` and launches the clip once.
- [ ] 3.2 Make `completeImageStage` return before any state write when `commitSceneResult` refuses the result. Make 3.1 pass.

## 4. Backend: final assembly (TDD; design Decisions 2 and 3)

- [ ] 4.1 Write failing tests:
  - `setFinalVideoPath` records the path once and reports a refused second write; the stored path is unchanged;
  - an assembly success whose write is refused ends its attempt as `superseded`;
  - an assembly launch for a session with a final video records no attempt and does not run the tool;
  - an assembly launch while an `assembly` attempt is in flight records no attempt and does not run the tool, whether it comes from a scene completion or from continue;
  - the assembly launcher's `heldWork` reports nothing while an attempt is in flight.
- [ ] 4.2 Write a failing-or-pinning test for AC3: a scene whose clip was confirmed twice contributes exactly one clip to the assembly tool's captured input.
- [ ] 4.3 Implement Decisions 2 and 3: the set-once `setFinalVideoPath`, the `superseded` outcome on a refused write, and the start check in `runAssemblyAttempt` and in `heldWork`. Make 4.1 and 4.2 pass.

## 5. Backend: manual-testing aid

- [ ] 5.1 Add a `slow-success` mode to `USE_STUB_ASSEMBLY_TOOL` (manual endpoint testing only), with a delay long enough to pause and continue during an assembly. Document it next to the other modes in `server.ts`.

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 6.1 Review the tests that call `setFinalVideoPath`, `completeImageStage` (indirectly), and the assembly launch (`assembly-launch`, `assembly-phase`, `assembly-api`, `restart-assembly`, `launch-gate`) and update any that relied on an overwrite or a second launch.
- [ ] 6.2 Confirm every scenario of the modified requirement in `specs/persistence-foundation/spec.md` has at least one test, and map AC1-AC3 to tests; list both in the step 7 report.
- [ ] 6.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 7.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents.
- [ ] 7.2 Run the targeted tests: the files touched in groups 2-4 plus `orchestrator`, `image-stage`, `video-stage`, `assembly-*`, `restart-assembly`, `launch-gate`.
- [ ] 7.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` in the checkout.
- [ ] 7.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 7.5 Create the report `openspec/changes/ignore-repeated-success-confirmations/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`.
- [ ] 7.6 Mark this step complete only after the tests pass and the report file exists.

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Start the real server on a scratch store and scratch projects folder with stub providers (`USE_STUB_VIDEO_PROVIDER=success-bytes`, `USE_STUB_ASSEMBLY_TOOL=slow-success`, `ALLOW_TEST_ENDPOINTS=1`); confirm `GET /health`.
- [ ] 8.2 Create a session with scenes through `quick-scene` so assembly starts. While it runs, `POST /pause` then `POST /continue`. `GET /sessions/:id` shows one assembly attempt and, once done, one final video.
- [ ] 8.3 `POST /continue` again after the final video exists: no new assembly attempt, final video unchanged.
- [ ] 8.4 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/ignore-repeated-success-confirmations/reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`.

## 9. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Decide applicability: no UI change, but AC2 is visible on the session page as the final video's attempt count, so it applies.
- [ ] 9.2 Run backend (scratch store, `slow-success` assembly) and frontend. Open a session whose assembly is running; pause and continue from the page.
- [ ] 9.3 The page shows one assembly attempt and one final video download once complete.
- [ ] 9.4 Restore the environment and save `openspec/changes/ignore-repeated-success-confirmations/reports/YYYY-MM-DD-step-9-e2e.md`.

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/api-spec.yml`: confirm no change is needed (no route or schema changes); record that in the step 7 report.
- [ ] 10.2 `docs/data-model.md`: record that `runs.final_video_path` is written once, by a conditional update, and that a refused assembly result ends `superseded`.
- [ ] 10.3 `docs/backend-standards.md`: state the rule that a stage writes state and launches the next stage only after the store accepts its result, with the per-stage guard table from design § Context.

## 11. Close out

- [ ] 11.1 Ask the user before commenting on JOS-159 (its manual assembly retry must respect "no final video, nothing in flight").
- [ ] 11.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-161.
- [ ] 11.3 Obtain review by at least one human, not only AI agents.
- [ ] 11.4 Archive the OpenSpec change after merge.
