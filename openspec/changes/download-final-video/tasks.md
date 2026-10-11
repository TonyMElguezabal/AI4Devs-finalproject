# Tasks — Download the final video (JOS-164, US-32)

Every code change starts with a failing test (TDD). Each acceptance criterion has at least one test. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties). Backend tests run on an isolated `DB_PATH` with `PROJECTS_ROOT` in a separate folder, because `resetAll()` clears `PROJECTS_ROOT`.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-164-download-final-video` from `origin/feature/entrega-2-JAME` (the MVP integration branch), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the base still matches design.md § Context: the route streams the file with its attachment headers, its 200 schema is `z.any()`, the generated contract shows `application/json`, and the page gates on `state` with a client-built URL. Record whether `download-scene-results` (JOS-163) has merged; if it has, build on its `FinalVideoDownload` and `api/client.ts` state instead of the base's. **Result:** JOS-163 merged (`feature/entrega-2-JAME` now at `2fa63dc`). Verified it only touched the scene download route/`SceneRow`/`SceneList` — `FinalVideoDownload.tsx`, `downloadFinalVideoUrl` in `api/client.ts`, `SessionPage.tsx`'s final-video line, and the route's `z.any()` schema are all still exactly as design.md's Context describes. Merged the branch up to date, no conflicts. Proceeding as designed, no artifact updates needed.

## 2. Backend: the published contract (design Decision 1)

- [x] 2.1 Determine how the installed `fastify-type-provider-zod` expresses a non-JSON response: declare the final-video route's 200 as `video/mp4` with a binary schema, start the server, fetch `/docs/json`, and confirm the 200 carries `content: video/mp4`. If no form works in the installed version, record that here and in the step 6 report, and fall back to a dated note in the contract header. **Result:** a plain zod response schema can never produce `content: video/mp4` (it always resolves to `application/json`, confirmed by reading `fastify-type-provider-zod`/`@fastify/swagger`'s source). `@fastify/swagger` supports a route-level `config.swaggerTransform` override, used in place of the global `transform` for one route only; `binaryFileSwaggerTransform` (`routes.ts`) runs the normal zod transform for 409/404 and replaces only the 200 entry. Verified via `GET /docs/json` against a real running server: `responses.200` now has `content: { "video/mp4": { schema: { type: "string", format: "binary" } } }`; 409/404 unaffected; the route still streams real bytes. No fallback needed.
- [x] 2.2 Write a test asserting the served document: `GET /docs/json` describes the final-video route's 200 as `video/mp4`, not `application/json`. New test file: `test/final-video-download.test.ts`.

## 3. Backend: prove the download (TDD; design Decision 4)

- [x] 3.1 Write a failing-or-pinning test for AC1: a session driven to `final-video` with the stub assembly tool downloads with status 200, `content-type: video/mp4`, `content-disposition: attachment; filename="final-video.mp4"`, a `content-length` equal to the file's size, and a payload equal to the stored `final-video.mp4` bytes. Record whether it passed as written. **Result:** passed as written — the handler already streamed the real file correctly; only the contract/tests were missing (per proposal.md, "the behaviour is already there").
- [x] 3.2 Write tests for AC2 and the missing-file case: 409 at `chunks-processing` and at `final-video-generating`; 404 for an unknown session; 404 when the recorded file is deleted from the project folder. Reuse the existing 409 and 404 tests where they already cover a case. New: 409 at `chunks-processing`, 404 on a deleted file (`test/final-video-download.test.ts`). Reused: 409 at `final-video-generating` and 404 for an unknown session (`scene-completion-api.test.ts`, already existed).

## 4. Frontend: render the offered URL (TDD; design Decision 2)

- [x] 4.1 Write failing component tests: `FinalVideoDownload` renders the link from the URL it is given and renders nothing when the URL is undefined; the session page offers the link for a snapshot carrying `finalVideoUrl` and offers none for snapshots without it at `chunks-processing`, `final-video-generating` and `failed`.
- [x] 4.2 Change `FinalVideoDownload` to take `url: string | undefined` and drop the `state` prop; pass `snapshot.session.finalVideoUrl` through `resolveResultUrl` in `SessionPage`; delete `downloadFinalVideoUrl` from `api/client.ts`. Add `finalVideoUrl` to the frontend session type if it is not there. Make 4.1 pass. `finalVideoUrl` was indeed missing from `types.ts`'s `SessionEventPayload` — added.

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review the tests that render `FinalVideoDownload` or assert on the final-video link (`components.test.tsx`, including the phase-section cases) and the backend tests touching the route (`assembly-api`, `scene-completion-api`), and update those that passed a `state` prop or relied on the client-built URL. Fixed during group 4: two `SessionPage` fixtures (lines ~837, ~1023) now set `finalVideoUrl`; the `FinalVideoDownload` unit test rewritten to drop `state`. `assembly-api.test.ts`/`scene-completion-api.test.ts` needed no change (backend-only, unaffected by the frontend prop change or the swaggerTransform override).
- [x] 5.2 Confirm every scenario in `specs/final-video-download/spec.md` has at least one test, and map AC1-AC2 to tests; list both in the step 6 report.
- [x] 5.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents. Baseline: `backend/data/` does not exist in this worktree.
- [x] 6.2 Run the targeted tests: the files touched in groups 2-5.
- [x] 6.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` in the checkout.
- [x] 6.4 Verify the post-test state matches the baseline; restore it if not. `backend/data/` still does not exist.
- [x] 6.5 Create the report `openspec/changes/download-final-video/reports/2026-10-10-step-6-unit-test-and-db-verification.md`.
- [x] 6.6 Mark this step complete only after the tests pass and the report file exists.

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the real server on a scratch store and scratch projects folder with stub providers (`USE_STUB_VIDEO_PROVIDER=success-bytes`, `USE_STUB_ASSEMBLY_TOOL=success`, `ALLOW_TEST_ENDPOINTS=1`); confirm `GET /health`.
- [x] 7.2 Create a session, register scenes through `quick-scene`, and `curl -D -` the final-video download before assembly finishes: 409 with its reason.
- [x] 7.3 Once the session reads `final-video`, `curl -o` the download: 200, the three headers, and `cmp` the saved file against the project folder's `final-video.mp4`. (The bare stub assembly tool doesn't write real bytes — see the report's note; the route itself was verified with a file placed at the recorded path, as a real `ffmpeg` run would have left it.)
- [x] 7.4 `curl` the download for an unknown session id: 404. Delete the stored file and `curl` again: 404.
- [x] 7.5 `curl /docs/json` and confirm the final-video 200 is `video/mp4`.
- [x] 7.6 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/download-final-video/reports/2026-10-10-step-7-manual-endpoint-testing.md`.

## 8. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Run backend (scratch store, stub assembly) and frontend. Open a session while its scenes are still processing: no final-video link anywhere on the page.
- [x] 8.2 Let the session reach `final-video` without reloading: the link appears.
- [x] 8.3 Follow the link and confirm the browser receives the MP4 (response headers or the saved file), without accepting any browser prompt.
- [x] 8.4 Restore the environment and save `openspec/changes/download-final-video/reports/2026-10-10-step-8-e2e.md`.

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 Regenerate `docs/api-spec.yml` from the running server and add a dated header note: the final-video download's 200 is now described as `video/mp4` binary, correcting a document that said `application/json` while the server always sent MP4 bytes.
- [x] 9.2 `docs/frontend-standards.md`: the page offers a download only when the session read publishes its route, and never derives availability from the session state.

## 10. Close out

- [x] 10.1 Report the download-filename finding (design Decision 3) to the user: every project's final video downloads as `final-video.mp4`, so several are indistinguishable in a Downloads folder. Ask whether to raise it as a product ticket. User confirmed: the file should be named after the project title. Filed as JOS-193: https://linear.app/josetony/issue/JOS-193/name-the-downloaded-final-video-after-the-project-title
- [ ] 10.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-164.
- [x] 10.3 Obtain review by at least one human, not only AI agents.
- [ ] 10.4 Archive the OpenSpec change after merge.
