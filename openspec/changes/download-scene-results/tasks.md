# Tasks — Download individual scene results during processing (JOS-163, US-31)

Every code change starts with a failing test (TDD). Each acceptance criterion has at least one test. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties). Backend tests run on an isolated `DB_PATH` with `PROJECTS_ROOT` in a separate folder, because `resetAll()` clears `PROJECTS_ROOT`.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-163-download-scene-results` from `origin/feature/entrega-2-JAME` (the MVP integration branch), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the base still matches design.md § Context: the download route is the stub (`chunk-complete` only, `text/plain`); the page shows links only for complete scenes. Record whether JOS-158 (clip correction) or JOS-162 (project files) has merged and whether either touches the download route or `SceneRow`; update the artifacts first if so. **Result:** both merged (`feature/entrega-2-JAME` now at `65d2212`). Verified the current download route is byte-for-byte the same stub design.md describes. JOS-158's `routes.ts` diff touched only `/retry` and `/correct`; its `SceneRow.tsx` diff touched only the correction form/instruction logic, not the `imageDownloadUrl`/`videoDownloadUrl` props or link rendering. JOS-162 added project-folder files only (`script.txt`, `generated-texts.json`, `corrected-instructions.json`), no route or `SceneRow` change, and proposal.md already notes this change doesn't need its new files. No artifact updates needed — merged the branch up to date (no conflicts) and proceeding as designed.

## 2. Backend: the download route (TDD; design Decisions 1, 2 and 4)

- [x] 2.1 Write failing route tests (`app.inject`):
  - an `image-complete` scene's image downloads with its bytes, `Content-Disposition: attachment; filename="scene-<index>-image.png"`, `image/png` and `Content-Length`, while another scene is `submitted` (AC1);
  - the image of a `video-generating` scene, and of a scene whose clip failed, downloads (AC1, AC3);
  - a `chunk-complete` scene's clip downloads with `video/mp4` and `filename="scene-<index>-clip.mp4"` (AC2);
  - a successful scene's image and clip download while other scenes are `failed` (AC3);
  - 409 for an image or clip that does not exist yet; 404 for an unknown scene, a scene of another session, a missing file, and a path outside the project folder;
  - `kind` values `voice-over`, `timestamps` and `texts` answer 400 (AC4).
  New test file: `test/scene-download.test.ts` (15 tests).
- [x] 2.2 Implement the handler per Decisions 1 and 2. Make 2.1 pass.

## 3. Backend: downloads in the session read (TDD; design Decision 3)

- [x] 3.1 Write failing tests: a scene with only an image has `downloads.imageUrl` and no `clipUrl`; a complete scene has both; a scene with neither has no `downloads`; the session read has no download entry for the voice-over, timestamps or texts (AC4). The SSE scene event carries the same field. New test file: `test/scene-downloads-read.test.ts` (5 tests).
- [x] 3.2 Add `downloads` to `toSnapshot` and to the scene response schema. Make 3.1 pass.

## 4. Frontend: links from the session read (TDD; design Decision 3)

- [ ] 4.1 Write failing component tests: links render only for the entries present in `scene.downloads`, including an image link on a `video-generating` scene and on a `failed` scene with an image; no link for a scene without downloads; no link for the MP3, timestamps or texts anywhere on the session page.
- [ ] 4.2 Add `downloads` to the scene type, render the links in `SceneRow` through `resolveResultUrl`, remove `downloadSceneUrl` and the URL props from `SceneList`. Make 4.1 pass.

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Review the tests that call the download route or assert on scene links (`session-read.test.ts`, `components.test.tsx`, API-surface tests) and update those that relied on the stub text or on `chunk-complete`-only links.
- [ ] 5.2 Confirm every scenario in `specs/scene-result-downloads/spec.md` has at least one test, and map AC1-AC4 to tests; list both in the step 6 report.
- [ ] 5.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 6.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents.
- [ ] 6.2 Run the targeted tests: the files touched in groups 2-5.
- [ ] 6.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` in the checkout.
- [ ] 6.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 6.5 Create the report `openspec/changes/download-scene-results/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`.
- [ ] 6.6 Mark this step complete only after the tests pass and the report file exists.

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the real server on a scratch store and scratch projects folder with stub providers (`USE_STUB_VIDEO_PROVIDER=pending`, `ALLOW_TEST_ENDPOINTS=1`); confirm `GET /health`.
- [ ] 7.2 Create a session with two scenes through `quick-scene`, so both are `video-generating`. `curl -D -` the image download of one: 200, attachment headers, and the bytes match the stored file (`cmp`). The clip download answers 409.
- [ ] 7.3 Restart with `USE_STUB_VIDEO_PROVIDER=success-bytes` so the clips complete; download a clip: 200, `video/mp4`, bytes match. Confirm `GET /sessions/:id` lists `downloads` per scene.
- [ ] 7.4 `curl` the route with `kind` `voice-over` and `timestamps`: 400. A scene id from another session: 404.
- [ ] 7.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/download-scene-results/reports/YYYY-MM-DD-step-7-manual-endpoint-testing.md`.

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Run backend (scratch store, `pending` clips) and frontend. Open a session whose scenes are `video-generating`: each scene's details offer an image download and no clip download; no MP3, timestamps or texts download appears.
- [ ] 8.2 Follow an image link: the browser receives the file (check the response headers or the downloaded file, without accepting any browser prompt).
- [ ] 8.3 After the clips complete, the clip links appear without a reload.
- [ ] 8.4 Restore the environment and save `openspec/changes/download-scene-results/reports/YYYY-MM-DD-step-8-e2e.md`.

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 Regenerate `docs/api-spec.yml` from the running server and add a dated header note: the download route's binary 200 response and the scene `downloads` object.
- [ ] 9.2 `docs/data-model.md`: note that download availability is derived from `scenes.result` and `scenes.video_result`, with no stored flag.
- [ ] 9.3 `docs/frontend-standards.md`: the page shows actions and downloads the session read offers, and does not derive availability from state.

## 10. Close out

- [ ] 10.1 Ask the user before commenting on JOS-158 (a corrected clip must keep the clip download consistent) if its branch touches the download route or `SceneRow`.
- [ ] 10.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-163.
- [ ] 10.3 Obtain review by at least one human, not only AI agents.
- [ ] 10.4 Archive the OpenSpec change after merge.
