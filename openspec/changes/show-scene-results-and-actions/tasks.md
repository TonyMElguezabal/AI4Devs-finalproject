# Tasks — View per-scene status and results (JOS-151, US-19)

Every code change starts with a failing test (TDD), and every scenario in `specs/scene-detail-view/spec.md` has at least one test. Scene states and stored results that no running stage produces in a test are set directly, as earlier stories' tests do.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-151-show-scene-results-and-actions` from `feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 Confirm the base branch still has: `SceneList`'s ascending sort with its test, `useLiveSession`'s tests, `result.imageUrl` copied from `scene.result`, `affectedStage` unrendered, and actions on every failed scene. If another story changed any of these, update design.md before coding
- [x] 1.2 Check whether JOS-146, JOS-158, JOS-163 or JOS-150 branches have touched `SceneRow.tsx`, `sceneToPayload` or the per-scene routes since this proposal; record any overlap, especially JOS-150's (`gate-assembly-on-complete-scenes`) edits to the session payload
  - Result: no overlap. `feature/jos-146-generate-chunk-video` has no source changes (only OpenSpec files); no JOS-158 or JOS-163 branch exists. JOS-150 adds `failedSceneIndexes` to the session payload and `SessionHeader.tsx`, and does not touch `sceneToPayload`, `SceneRow.tsx` or the per-scene routes, so the two changes merge without conflict.
- [x] 1.3 Confirm `resolveArtefactPath` is exported from `db.ts` and wraps the write-side guard

## 2. Image route (TDD; design Decisions 1 and 2)

- [x] 2.1 Failing tests in a new `scene-image-route.test.ts`: a stored `.png` answers 200, `image/png`, with exact bytes; a stored `.jpg` answers `image/jpeg`; a scene of another session answers 404 without reading; a scene with no result, a missing file, and an unrecognised extension each answer 404; a stored `../other-session/scene-1.png` is refused (404) and the outside file is never read; the route is documented in the generated OpenAPI with no request body
- [x] 2.2 Implement the route in `routes.ts` (scoped lookup, `resolveArtefactPath`, extension-to-type map, streamed body); make 2.1 pass

## 3. Payload (TDD; design Decision 3)

- [x] 3.1 Failing tests (API surface): a scene with a stored image carries `result.imageUrl` equal to `/sessions/{sessionId}/scenes/{sceneId}/image` on the read and in the live snapshot; a scene failed after storing its image still carries it; a scene with nothing stored has no `result`; no scene carries `videoUrl`
- [x] 3.2 Change `sceneToPayload` to build the URL from the scene's identifiers; make 3.1 pass

## 4. Frontend scene details (TDD; design Decisions 4 and 5)

- [x] 4.1 Failing tests in `test/components.test.tsx`: `sceneActions` gives retry and image correction only for `failed` + `image`, nothing for `failed` + `video`, nothing for any other state
- [x] 4.2 Failing tests: an expanded scene with `result.imageUrl` shows an image named "Scene N image" whose `src` is the API base plus that path; with `result.videoUrl` it shows a video player named "Scene N clip"; with no result it shows neither
- [x] 4.3 Failing tests: a failed `image` scene shows its error, "image" as the affected stage, the retry button and the correction form; a failed `video` scene shows its error and "video" and no retry button or correction form
- [x] 4.4 Update the two existing fixtures that set `imageUrl` to a raw file path to the new URL shape
- [x] 4.5 Implement `sceneActions`, the URL resolution in `api/client.ts`, and the `SceneRow.tsx` rendering; make 4.1-4.3 pass
- [x] 4.6 Style the scene's image and clip so they fit the details panel (`max-width: 100%`, bounded height, aspect ratio kept) instead of stretching to its full width; found in step 9 (9.3)

## 5. AC1 and AC2 evidence

- [x] 5.1 Map AC1 (order) and AC2 (live state without reload) to existing tests in `components.test.tsx` and `useLiveSession.test.tsx`; add a test only for a spec scenario that has none (expected: "a state change arrives" at the row level)
  - AC1 (order): `components.test.tsx` "SceneList ordering (Decision 6)" and "SessionPage > renders scenes in the order received".
  - AC2 (live state): `useLiveSession.test.tsx` "collapsed events per scene" and "applying the same event twice" at the hook level; the new "A live state change reaches the row (JOS-151)" at the row level. The new test passed on first run because the behaviour already existed; it pins it down.

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Review backend tests reading `result` from the session payload, and frontend tests rendering failed scenes, for assumptions this change breaks beyond task 4.4
- [x] 6.2 Confirm every scenario in `specs/scene-detail-view/spec.md` has at least one test; list the mapping in the step 7 report
- [x] 6.3 Confirm module test coverage has not decreased (compare against this change's propose commit)

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents
- [x] 7.2 Run the targeted tests (image route, API surface, components)
- [x] 7.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`
- [x] 7.4 Verify the post-test state matches the baseline; restore it if not
- [x] 7.5 Create the report `openspec/changes/show-scene-results-and-actions/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [x] 7.6 Mark this step complete only after the tests pass and the report file exists

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the real server on a scratch store and scratch projects folder; confirm `GET /health`
- [x] 8.2 Create a session, register chunks, and store a real PNG as one scene's result (as the image stage would); `curl GET /sessions/:id` shows `result.imageUrl`; `curl` that URL returns 200, `image/png`, and bytes identical to the file (`cmp`)
- [x] 8.3 Error cases: the same scene under another session's id, a scene with no image, and a stored result pointing outside the folder all answer 404, and the outside file is not read
- [x] 8.4 `curl GET /docs/json`: the image route is documented with no request body
- [x] 8.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/show-scene-results-and-actions/reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`

## 9. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 9.1 Decide applicability: the scene-details panel changes, so it applies
- [x] 9.2 Run backend (scratch store) and frontend; prepare a session with one scene holding a real stored image, one `failed` with `affectedStage: "image"`, and one `failed` with `affectedStage: "video"` (set directly)
- [x] 9.3 Expand each scene: the image renders; the image failure shows the stage, retry and the correction form; the clip failure shows the stage and no actions
- [x] 9.4 Change a scene's state on the backend and confirm its row updates without a reload
- [x] 9.5 Restore the environment and save `openspec/changes/show-scene-results-and-actions/reports/YYYY-MM-DD-step-9-e2e.md`

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only changes are the image route and the `imageUrl` description
  - Note: the generated diff is the new image route only; the session read's `result` is not described in the response schema, so there was no `imageUrl` description to change.
- [x] 10.2 `docs/data-model.md`: update the `result` bullet (stored path stays internal; exposed only as the image route's URL)
- [x] 10.3 `docs/backend-standards.md`: record that stored artefacts are read through the same project-folder guard as writes, scoped by `(session, scene)`
- [x] 10.4 `docs/frontend-standards.md`: record `sceneActions` as the one place scene actions are derived, and that JOS-158 extends it

## 11. Close out

- [ ] 11.1 Ask the user before commenting on JOS-163 (US-31) that its image download can build on this route, and on JOS-146 that it should fill `result.videoUrl` with its clip route
- [ ] 11.2 Ask before pushing; open the PR with a description linking to JOS-151
- [ ] 11.3 Obtain review by at least one human, not only AI agents
- [ ] 11.4 Archive the OpenSpec change after merge
