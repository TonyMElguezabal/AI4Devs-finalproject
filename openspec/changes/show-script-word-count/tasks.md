## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-236-script-word-count` exists from `origin/feature/entrega-3-JAME` (at `c7db2a53`, PR #137 merged) with no upstream, in the worktree `../AI4Devs-jos-236` (checked by `/opsx:propose`)
- [x] 0.2 `git fetch`. Confirm three things: this is the worktree's current branch, it still has no upstream, and `origin/feature/entrega-3-JAME` has not moved past its base (merge it in if it has). Then run `npm ci` in `frontend/`.

## 1. Gate

- [x] 1.1 Confirm that design.md § Context still holds:
  - `StartProjectForm` keeps `script` in `useState`, and the textarea is `#project-script`;
  - no `.field-hint` class exists yet;
  - `--font-size-sm` and `--color-muted` are defined in `styles/tokens.css`.

## 2. Frontend: `scriptEstimate.ts` (TDD; design Decision 2)

- [x] 2.1 Write failing tests in `frontend/test/script-estimate.test.ts`:
  - `estimateScript`:
    - `""`, `"   \n\t"` → `null`;
    - `"Hello"` → 1 word, 0 s;
    - the ticket's example script → 38 words, 15 s;
    - 150 words → 60 s;
    - text with leading, trailing and repeated spaces or newlines counts only the words.
  - `formatEstimate`:
    - `1 word · Estimated video duration ~0:00`;
    - `38 words · Estimated video duration ~0:15`;
    - 1500 words → `~10:00`;
    - 1875 words → `~12:30`.
- [x] 2.2 Create `frontend/src/scriptEstimate.ts` with `NARRATION_WORDS_PER_MINUTE`, the `ScriptEstimate` type, `estimateScript` and `formatEstimate`, all fully typed. Make 2.1 pass.

## 3. Frontend: the line under the Script field (TDD; design Decisions 1, 3, 4)

- [x] 3.1 Write failing tests in the `describe("StartProjectForm")` block of `frontend/test/components.test.tsx`:
  - after typing the example script, the line shows `38 words · Estimated video duration ~0:15`, and the textarea's accessible description equals it;
  - typing more words updates the line without blurring;
  - no line and no `aria-describedby` while the script is empty or whitespace;
  - the accessible name stays `Script`;
  - `Start project` is enabled and disabled as before, and `onStart` receives the same values.
- [x] 3.2 In `StartProjectForm.tsx`, derive the estimate while rendering. Render `<p id="project-script-estimate" className="field-hint">` and the conditional `aria-describedby`. Add `.field-hint` to `styles/app.css`. Make 3.1 pass.

## 4. Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Review the existing `StartProjectForm` and "Accessible naming convention" tests. They must pass unchanged. Record any edit and its reason in the report.

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline. This change touches no database, and the frontend suite uses none; record that.
- [x] 5.2 Run the targeted tests from groups 2 and 3.
- [x] 5.3 Run the full frontend suite, `npm run lint` and `npm run typecheck` in `frontend/`.
- [x] 5.4 Confirm the post-test state matches the baseline.
- [x] 5.5 Create the report `openspec/changes/show-script-word-count/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`.
- [x] 5.6 Mark this group complete only after the tests pass and the report exists.

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 This change adds and changes no endpoint. Start the backend on scratch `DB_PATH` and `PROJECTS_ROOT`, then run `curl -s localhost:<port>/languages` (the form's only backend call) and check that it still returns 200 with the supported list.
- [x] 6.2 Record the command, the response and the N/A justification in `reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`. Stop the server and remove the scratch data.

## 7. E2E Testing in the Browser (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the backend (scratch paths) and the frontend. Open the start form and paste the example script. Check the line reads `38 words · Estimated video duration ~0:15`. Type more words and check it updates live. Leave the field and check it is unchanged.
- [x] 7.2 Clear the field and check the line disappears. Check that `Start project` is still disabled until the title, script and language are filled. Do not submit the form, so no provider is called.
- [x] 7.3 Take screenshots in light and dark at 375 px and 1440 px. Restore the environment and record everything in `reports/YYYY-MM-DD-step-7-e2e-testing.md`.

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 Copy `docs/PRD.md` to `docs/PRD-v1.25.md`. In `docs/PRD.md` (Spanish), make the v1.26 changes:
  - in §4.1, one sentence saying the form shows the word count and an estimated duration (150 palabras por minuto) for information only, with no limit;
  - the status line;
  - the §16 changelog row (product owner, JOS-236, 2026-10-28).
- [x] 8.2 `docs/frontend-standards.md`: on the Screen Inventory row "Start a project", add the word count and estimated duration.
- [x] 8.3 Run `graphify update .`.
- [ ] 8.4 Commit. Then push with an explicit `origin feature/jos-236-script-word-count` and open the PR into `feature/entrega-3-JAME` linking JOS-236 (on the user's go-ahead).
