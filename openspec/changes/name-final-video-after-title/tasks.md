# Tasks — Name the downloaded final video after the project title (JOS-193)

Every code change starts with a failing test (TDD). Each scenario in `specs/final-video-download/spec.md` has at least one test. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties). Backend tests run on an isolated `DB_PATH` with `PROJECTS_ROOT` in a separate folder, because `resetAll()` clears `PROJECTS_ROOT`.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 `git fetch`, then create branch `feature/jos-193-name-final-video-after-title` from `origin/feature/entrega-2-JAME` (the MVP integration branch) in a worktree, with `--no-track`
- [x] 0.2 Verify the branch was created, is the current branch and has no upstream

## 1. Gate

- [x] 1.1 Confirm the base still matches design.md § Context: the final-video route sets the literal `filename="final-video.mp4"`, the per-scene route builds `scene-<index>-…` names, and `db.ts` keeps its own private `sanitizeForFilesystem`. If the base differs, update the change artifacts before coding

## 2. Backend: the filename rule (TDD; design Decisions 1-3)

- [x] 2.1 Write failing unit tests for `downloadFilename` in `backend/test/download-filename.test.ts`, one per spec scenario case: plain title, NFC normalisation, separators and forbidden characters, control characters, whitespace runs, leading/trailing dots and spaces, all-dots and empty titles falling back to `final-video`, Windows reserved names (with and without extension, any case), 100-code-point cap that does not split a surrogate pair
- [x] 2.2 Write failing unit tests for `contentDisposition`: ASCII-only fallback, `%` and `\` absent from the fallback, `filename*` round-trips through `decodeURIComponent` to the full name, `' ( ) *` escaped, no quote or CR/LF in either parameter
- [x] 2.3 Implement both functions in `backend/src/util/downloadFilename.ts` (pure, fully typed) and make 2.1 and 2.2 pass

## 3. Backend: the route end to end (TDD)

- [x] 3.1 Extend `backend/test/final-video-download.test.ts` with failing tests through the HTTP surface: plain title, non-ASCII title (200 and decoded `filename*`), separators, the quote-and-newline title (one `Content-Disposition`, no injected header), dots-only title, reserved name, 150-character title, and two titles that sanitise alike each returning their own bytes
- [x] 3.2 Update the existing AC1 assertion that expects `filename="final-video.mp4"` to expect the title-derived header
- [x] 3.3 Use `contentDisposition(downloadFilename(run.title))` in the final-video route and make 3.1 and 3.2 pass
- [x] 3.4 Add a test pinning the per-scene download names (`scene-<index>-image.<ext>`, `scene-<index>-clip.mp4`) for a session with an unusual title, in `backend/test/scene-download.test.ts`

## 4. Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Search backend and frontend tests for `final-video.mp4` and `content-disposition` assertions and update those that depended on the fixed name
- [x] 4.2 Confirm every scenario in `specs/final-video-download/spec.md` has at least one test and list the mapping in the step 5 report
- [x] 4.3 Confirm module test coverage has not decreased (compare against this change's propose commit)

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents
- [x] 5.2 Run the targeted tests: the files touched in groups 2-4
- [x] 5.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` in the checkout (and once in a fresh worktree)
- [x] 5.4 Verify the post-test state matches the baseline; restore it if not
- [x] 5.5 Create the report `openspec/changes/name-final-video-after-title/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [x] 5.6 Mark this step complete only after the tests pass and the report file exists

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Start the real server on a scratch store and scratch projects folder with stub providers (`USE_STUB_VIDEO_PROVIDER=success-bytes`, `USE_STUB_ASSEMBLY_TOOL=success`, `ALLOW_TEST_ENDPOINTS=1`); confirm `GET /health`
- [x] 6.2 Create sessions titled `Summer Trip`, `Café de la plage 海`, `a/b\c:d`, and `con`; drive each to `final-video` (placing the file at the recorded path where the stub tool writes no real bytes, as `download-final-video` did)
- [x] 6.3 `curl -D -` each download and confirm the `Content-Disposition` value matches the spec; `curl -OJ` the non-ASCII one and confirm the saved file name on disk; `cmp` the bytes against the project folder's file
- [x] 6.4 Confirm the 409 before assembly and the 404 for an unknown session are unchanged
- [x] 6.5 `curl /docs/json` and confirm the documented header
- [x] 6.6 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/name-final-video-after-title/reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`

## 7. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Run backend (scratch store, stub assembly) and frontend; open a session titled with a non-ASCII title at `final-video`
- [x] 7.2 Follow the page's download link and confirm, from the response headers or the saved file, that the browser receives `<title>.mp4`, without accepting any browser prompt
- [x] 7.3 Restore the environment and save `openspec/changes/name-final-video-after-title/reports/YYYY-MM-DD-step-7-e2e.md`

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 Regenerate `docs/api-spec.yml` from the running server (never by hand) and document the final-video download's `Content-Disposition` naming rule in the route's description
- [x] 8.2 `docs/backend-standards.md`: any User-supplied text placed in a response header goes through `contentDisposition`/an equivalent sanitiser, never interpolated raw
- [x] 8.3 Update `README` or user-facing docs only if they mention the `final-video.mp4` download name

## 9. Close out

- [x] 9.1 Run `graphify update .`
- [ ] 9.2 Commit the finished work on the feature branch; ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-193
- [ ] 9.3 Obtain review by at least one human, not only AI agents
- [ ] 9.4 Archive the OpenSpec change after merge
