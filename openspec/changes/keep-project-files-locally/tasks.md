# Tasks — Keep project files locally without overwriting or expiry (JOS-162, US-30)

Every code change starts with a failing test (TDD). Each acceptance criterion has at least one test. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties). Tests run on an isolated `DB_PATH` with `PROJECTS_ROOT` in a separate folder, because `resetAll()` clears `PROJECTS_ROOT`.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-162-keep-project-files-locally` from `origin/feature/entrega-2-JAME` (the MVP integration branch), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the base still matches design.md § Context: no `script.txt` or `generated-texts.json` is written; the only `rmSync` calls are the temporary-path ones; folder naming is unchanged. Record whether JOS-157 or JOS-158 has merged; if one has, add its corrected-instruction file to this change's scope and update the spec first. **Result:** both merged (`feature/entrega-2-JAME` now at `7144625`); everything else in the table still holds. Scope expanded — see design.md Decision 5, proposal.md, spec.md.

## 2. Backend: script and generated texts (TDD; design Decisions 1-3)

- [x] 2.1 Write failing tests: creating a session writes `script.txt` with the script byte for byte, including leading and trailing spaces and non-ASCII text.
- [x] 2.2 Write failing tests: registering chunks writes `generated-texts.json` with every chunk's `id`, `prompt`, `imageInstruction`, `videoInstruction` and `narrationInterval`, in identifier order; a refused second registration leaves the file unchanged.
- [x] 2.3 Write `script.txt` in `createRun` and `generated-texts.json` in `registerDecomposition`, both with `writeArtefactOnce`. Make 2.1 and 2.2 pass.
- [x] 2.4 Write failing tests: correcting a failed scene's `IMAGE`, `VIDEO` or legacy instruction writes/updates `corrected-instructions.json` with the corrected text and a `correctedAt` timestamp for that scene and field; a correction that the store refuses (not in `failed`, wrong field already filled) leaves the file unchanged; a second correction of the same scene updates in place rather than duplicating.
- [x] 2.5 In `correctImageInstruction`, `correctLegacyInstruction` and `correctVideoInstruction` (`db.ts`), after the `UPDATE` changes a row, write `corrected-instructions.json` with `writeArtefact` (design Decision 5). Make 2.4 pass.

## 3. Backend: pin the acceptance criteria that already hold (design Decision 4)

- [x] 3.1 AC1 media: a session taken through the stub providers to `final-video` has `voice-over.mp3`, the timestamps file(s), each scene's image and clip, and `final-video.mp4` inside its own folder. New test: `test/project-files-ac-pinning.test.ts`.
- [x] 3.2 AC2: a session with results, read again after boot recovery with an injected clock years later, has the same read and the same files. Add the source check that `rmSync` appears only at the listed temporary-path call sites. New tests: `test/project-files-ac-pinning.test.ts` (aging/boot-recovery) and `test/persistence.test.ts` (rmSync source-check allow-list).
- [x] 3.3 AC3: two same-title sessions in the same minute get `<name>` and `<name> (2)`; in different minutes, no counter; each writes results only into its own folder. Already existed: `test/persistence.test.ts` ("project folder naming"), `test/session-consultation.test.ts` (2.1/2.2).
- [x] 3.4 AC4: `GET /sessions/:id` for a session whose `created_at` is years old returns 200 with its results. New test: `test/project-files-ac-pinning.test.ts`.
- [x] 3.5 AC5: reference the existing download tests; add one asserting that a link-delivered image's and clip's stored reference is the local relative path. Existing: `test/image-stage.test.ts`, `test/video-stage.test.ts` (temporary-link download tests); added the local-path assertion to both.

Tests that already existed: AC1 per-stage persistence (`voice-over-persistence.test.ts`, `video-persistence.test.ts`, `assembly-persistence.test.ts`, `narration-timestamps-persistence.test.ts`), AC3 folder naming and cross-session scoping, AC5 download-not-link behaviour. New: the one AC1 full-pipeline-to-disk test, the AC2 aging/rmSync-allow-list tests, the AC4 old-session API test, and the AC5 local-path assertions.

## 4. Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Review tests that assert a fresh project folder's contents or count files in it (for example `session-consultation`, `persistence`, `scene-registration-*`), and update any that now see the two new files. Found and fixed: `test/content-lock.test.ts` (3 assertions counting project-folder contents now also see `script.txt`). `session-consultation`/`scene-registration-*` don't count folder contents, so nothing to update there.
- [x] 4.2 Confirm every scenario in `specs/project-files/spec.md` has at least one test, and map AC1-AC5 to tests; list both in the step 5 report.
- [x] 4.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents. Baseline: `backend/data/` does not exist in this worktree.
- [x] 5.2 Run the targeted tests: the files touched in groups 2-4.
- [x] 5.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` in the checkout.
- [x] 5.4 Verify the post-test state matches the baseline; restore it if not. `backend/data/` still does not exist — untouched.
- [x] 5.5 Create the report `openspec/changes/keep-project-files-locally/reports/2026-10-10-step-5-unit-test-and-db-verification.md`.
- [x] 5.6 Mark this step complete only after the tests pass and the report file exists.

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 6.1 Start the real server on a scratch store and scratch projects folder with stub providers; confirm `GET /health`.
- [ ] 6.2 `POST /sessions` twice with the same title within one minute; list the scratch projects folder: two folders, the second with ` (2)`, each with its own `script.txt`.
- [ ] 6.3 Take one session to `final-video` with `quick-voice-over` and `quick-scene`; list its folder and confirm the MP3, images, clips and final MP4 are there and none is in the other folder.
- [ ] 6.4 Restart the server; `GET /sessions/:id` for both still returns their results and the files are unchanged.
- [ ] 6.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/keep-project-files-locally/reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`.

## 7. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 7.1 Decide applicability: no UI change, and the files are not visible or downloadable in the app (§12.3), so the UI part of this story is limited to two same-title sessions showing their own results. Record the decision.
- [ ] 7.2 If applicable: start two same-title sessions from the page, confirm each session page shows only its own scenes and results, and save `openspec/changes/keep-project-files-locally/reports/YYYY-MM-DD-step-7-e2e.md`. Otherwise record why it does not apply in that report.

## 8. Update Technical Documentation (MANDATORY)

- [ ] 8.1 `docs/api-spec.yml`: confirm no change is needed (no route or schema change); record that in the step 5 report.
- [ ] 8.2 `docs/data-model.md`: list the files a project folder holds, with when each is written, including `script.txt`, `generated-texts.json` and `corrected-instructions.json`, and their JSON shape.
- [ ] 8.3 `docs/backend-standards.md`: state that every result goes into the project folder through `writeArtefactOnce` (write-once artefacts) or `writeArtefact` (artefacts that can change, such as corrections), that temporary links are downloaded before the result is accepted, and that nothing deletes project files.

## 9. Close out

- [ ] 9.1 No coordination comment needed: JOS-157 and JOS-158 are both merged and this change now implements the corrected-instructions file itself (task 1.1, design Decision 5).
- [ ] 9.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-162.
- [ ] 9.3 Obtain review by at least one human, not only AI agents.
- [ ] 9.4 Archive the OpenSpec change after merge.
