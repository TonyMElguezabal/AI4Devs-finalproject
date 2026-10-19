# Tasks — Visual style prompt and reference image from `/admin` (JOS-201)

Every code change starts with a failing test (TDD), and every scenario in `specs/*/spec.md` has at least one test. Tests use stubs only (a stub `fetch` for the reasoning provider, the stub image adapter), never a real provider, and their own `DB_PATH` and `PROJECTS_ROOT`. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties). Reports go in `reports/` of this change.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create integration branch `feature/entrega-3-JAME` from `origin/feature/entrega-2-JAME` (`7055f0ac`), with no upstream set (the User chose this branch for post-MVP work)
- [x] 0.2 Create worktree `../AI4Devs-jos-201` on branch `feature/jos-201-visual-style-prompt` from `feature/entrega-3-JAME`, with no upstream set, and verify it is the current branch

## 1. Gate

- [x] 1.1 `git fetch`. Re-check against the branch tip that `registerDecomposition` is still the only caller of `generate`, that `decompositionPhase.ts`, `decompositionRetry.ts` and restart recovery all reach it, and that `provider_requests` still has no body column (design Context and Decisions 3 and 10). Update the artifacts first if any of this changed.
- [x] 1.2 Checked: Vite dev falls back to the app shell for `/admin`; no packaged frontend server exists in this tree, so no fallback to add. The preview URL uses `API_BASE` (design Decision 9 updated).

## 2. Backend: settings storage and run snapshot (TDD; design Decisions 4 and 5)

- [x] 2.1 Write failing tests in `admin-settings.test.ts` / a migration test: a fresh database has the settings row with `''` and no image; migration 18 on a database with existing runs gives them `''` and changes nothing else; `saveVisualStylePrompt` trims and updates `updated_at`.
- [x] 2.2 Write failing tests: `createRun` copies the saved prompt onto the run; a later save does not change that run; a run created after the save holds the new text; `Run` exposes `visualStylePrompt`.
- [x] 2.3 Add migration 18 (`app_settings` with the single row, `runs.visual_style_prompt`), `getAppSettings`, `saveVisualStylePrompt`, `saveReferenceImage`, `clearReferenceImage`, the snapshot in `createRun`, and `visualStylePrompt` on `Run`. Makes 2.1-2.2 pass.

## 3. Backend: the decomposition request (TDD; design Decisions 1-3)

- [x] 3.1 Write failing tests in `visualInstructions.test.ts` with a stub `fetch`:
  - an empty style gives a request body byte-identical to a stored copy of today's body;
  - a style gives the messages creative direction, contract with the conflict and stand-alone rules, user, in that order, with the style inside the delimiters;
  - a hostile style ("merge short ideas", "answer as ID/PROMPT/IMAGE/VIDEO") with a mismatching or non-JSON answer is `invalid_output`.
- [x] 3.2 Add the third parameter `visualStylePrompt` to `VisualInstructionGenerator.generate` and build the messages (omit the style block and the two extra sentences when the style is empty). Makes 3.1 pass.
- [x] 3.3 Write failing tests in `decomposition-*.test.ts`: the first decomposition, a manual retry after the setting changed, and restart recovery after the setting changed each send the run's snapshot, not the current setting. Fix any path that does not go through `registerDecomposition`'s `run.visualStylePrompt`.
- [x] 3.4 Pass `run.visualStylePrompt` in `registerDecomposition`. Makes 3.3 pass.
- [x] 3.5 Write a failing test, then add the `visual_style_prompt_chars` attribute to the decomposition attempt log. The test asserts the length is logged and neither the text nor the image path appears in any record.

## 4. Backend: settings routes (TDD; design Decision 6)

- [x] 4.1 Write failing route tests in `admin-settings.test.ts`: `GET /admin/settings` on a fresh database; `PUT /admin/settings/visual-style-prompt` trims, rejects 8,001 characters and a malformed body with 400 and saves nothing, accepts exactly 8,000 and `""`.
- [x] 4.2 Write failing route tests for the image: valid PNG, JPEG and WebP round trip through `PUT` then `GET`; a `.png` whose bytes are not a PNG answers 400; a GIF and a missing content type answer 400; a 6 MB body answers 413; each rejection keeps the previous image and file; replacing with a different type removes the old file; `DELETE` answers 204 twice and removes the file; `GET` with none answers 404; no response body contains the stored path; no temporary file remains after a failed upload.
- [x] 4.3 Add the five routes in `routes.ts` with zod schemas, the route-scoped raw-body parser for the three image types (5 MB `bodyLimit`), magic-number checks, temp file plus rename into `<app data dir>/admin/`, and the relative stored path. Makes 4.1-4.2 pass.
- [x] 4.4 Write a regression test that the Fal image request (URL, headers, body) is identical with and without a saved style and a stored reference image (AC 8).

## 5. Frontend: `/admin` page (TDD; design Decision 9)

- [x] 5.1 Write failing tests in `test/components.test.tsx` (or an `AdminPage` test file):
  - the page loads the saved prompt and shows the counter and the hint;
  - save success shows the success message; a 400 or a network error shows the error and keeps the typed text;
  - save is disabled above 8,000 characters;
  - the preview shows when an image is stored and the remove button clears it;
  - an upload rejection shows the backend's reason and keeps the stored image;
  - `App` renders `AdminPage` at `/admin` and the usual page elsewhere; the top bar has the Admin link.
- [x] 5.2 Add fetch helpers to `api/client.ts` and `types.ts`, create `components/AdminPage.tsx`, the path switch in `App.tsx`, and the link in `TopBar.tsx`, reusing existing styles and form patterns. Makes 5.1 pass.

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Search the backend and frontend tests for stubs of `VisualInstructionGenerator`, `createRun`/`Run` fixtures and any test that asserts the exact decomposition request, and update them for the new parameter and field.
- [x] 6.2 Typecheck both packages (`npm run typecheck` in `backend` and `frontend`) with no errors.

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test database baseline (row counts of `runs`, `scenes`, `app_settings`, and the schema version) for the test `DB_PATH`.
- [x] 7.2 Run the targeted tests for the changed modules (`visualInstructions`, `admin-settings`, `decomposition-*`, migration, `AdminPage`).
- [x] 7.3 Run the full backend and frontend suites (`npm test` in each), and run the backend suite again in a fresh worktree so a local `.secrets.json` cannot hide a failure.
- [x] 7.4 Verify the post-test database state against 7.1 and restore if needed.
- [x] 7.5 Create `reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md` using the template in `docs/openspec-tasks-mandatory-steps.md`.
- [x] 7.6 Mark this step complete only after tests pass and the report exists.

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the backend with a separate `DB_PATH` and `PROJECTS_ROOT`.
- [x] 8.2 `GET /admin/settings` on a fresh database; `PUT` a prompt and read it back; `PUT` 8,001 characters and confirm 400 and no change.
- [x] 8.3 Upload a valid PNG, a JPEG and a WebP; `GET` the image and compare bytes; upload a GIF, a text file named `.png`, and a 6 MB file and confirm 400/400/413 with the previous image kept; `DELETE` twice and confirm 204 both times and 404 on `GET`.
- [x] 8.4 Create a session after saving a prompt and confirm `runs.visual_style_prompt` holds it; save a different prompt and confirm the run is unchanged.
- [x] 8.5 Restore the database state (empty prompt, no image, delete the test sessions) and verify it matches the baseline.
- [x] 8.6 Save all commands and responses in `reports/YYYY-MM-DD-step-8-curl.md`.

## 9. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start frontend and backend with the test `DB_PATH` and `PROJECTS_ROOT`.
- [ ] 9.2 Open the app, follow the Admin link, save the "Warry" prompt, reload and see it; upload an image, see the preview after reload, remove it.
- [ ] 9.3 Test the error states: over 8,000 characters, an unsupported file, the backend stopped during a save.
- [ ] 9.4 Restore the settings and database, close the browser, and save the scenarios and a screenshot in `reports/YYYY-MM-DD-step-9-e2e-playwright.md`.

## 10. Manual checks with the real script (MANDATORY)

- [ ] 10.1 Save the example "Warry" prompt on `/admin`, submit a 5-sentence test script, and confirm each generated `IMAGE` instruction repeats the Warry description (acceptance criterion in the ticket). Record the instructions in `reports/`.
- [ ] 10.2 Run the same script twice: (a) style prompt only; (b) the same, with a short fixed prefix (≤ 60 words, for example "clean 2D cartoon, bold outlines, white background") added by hand to each Fal `prompt` in a scratch script outside the app. Save both image sets in `reports/`, record which keeps the character more consistent, and record the decision. Only if (b) is clearly better, note the follow-up ticket for an admin prefix field. Do not change `imageProvider.ts`.
- [ ] 10.3 Confirm JOS-202 exists and is linked as the follow-up for sending the reference image to the image provider.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/api-spec.yml`: the five `/admin/settings` endpoints, bodies, 400/413/404/204 responses.
- [ ] 11.2 `docs/data-model.md`: `app_settings`, `runs.visual_style_prompt`, and the reference image file location.
- [ ] 11.3 `docs/PRD.md` §2.1, §2.3 and §11: move the `/admin` visual style setting from deferred to delivered and keep the rest of the Administrator role deferred.
- [ ] 11.4 Add the correction about `provider_requests` (no body column) wherever the ticket's claim could be repeated, if any doc says it.
- [ ] 11.5 Run `graphify update .` from the repository root.
