## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-234-scene-progress-summary` exists from `origin/feature/entrega-3-JAME` (at `6a3e9572`, PR #132 merged) with no upstream, in the worktree `../AI4Devs-jos-234` (checked by `/opsx:propose`)
- [x] 0.2 `git fetch`; confirm it is the current branch of that worktree, still has no upstream, and `origin/feature/entrega-3-JAME` has not moved past its base (merge it in if it has); run `npm ci` in `frontend/` and `backend/`

## 1. Gate

- [x] 1.1 Confirm design.md § Context still holds: `SessionPage` computes `scenesDone` inline and renders the `Scenes done` `<progress>`; `SCENE_STATE_LABEL` holds the six card labels; `markVideoGenerating` still runs only inside the video stage's `concurrency.acquire` callback (so `image-complete` = waiting for a clip slot)

## 2. Frontend: derivation module (TDD; design Decisions 1, 3, 5)

- [x] 2.1 Write failing tests in `frontend/test/scene-progress.test.ts` for `formatSceneNumbers`: empty list, a single number ("7"), a run ("3–5"), mixed ("3–5, 8, 12"), unsorted input ("9, 2, 3" → "2–3, 9"), two consecutive numbers ("4–5")
- [x] 2.2 Write failing tests for `summariseSceneProgress`: the spec's 10-scene example (every count, Images left 4, Clips left 7, no Failed at clip line); a failed scene split by `affectedStage`; ascending scene numbers per line; zero-count lines omitted except Done; every scene done → only Done; no scenes → no lines
- [x] 2.3 Add `frontend/src/sceneProgress.ts` with both functions (pure, typed, labels from `SCENE_STATE_LABEL` plus the summary qualifiers). Make 2.1–2.2 pass.

## 3. Frontend: panel component (TDD; design Decision 4)

- [x] 3.1 Write failing component tests in `frontend/test/components.test.tsx` for `SessionPage`: a mixed snapshot renders a `dl` in the panel with each non-zero line's label, count and scene numbers; no summary when there are no scenes; a re-render with one scene moved from `image-complete` to `video-generating` moves its number between the two lines (spec "A clip starts"); the summary contains no button, link or input and has no `aria-live` or `role="alert"`
- [x] 3.2 Add `frontend/src/components/SceneProgressSummary.tsx`; mount it in `SessionPage.tsx` under the `Scenes done` `<progress>` inside the existing `scenes.length > 0` block, and take `scenesDone` from the helper. Make 3.1 pass.
- [x] 3.3 Style the `dl` in `frontend/src/styles/app.css` (two columns, numbers wrap inside the panel, light and dark tokens, no horizontal scroll at 375px)

## 4. Frontend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Run the existing `Scenes done` test and the "Accessible naming convention" suite unchanged; change an existing test only where a new `dl` text makes a `getByText` ambiguous, and record each such change in the report

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline (frontend-only change; the worktree has no local database, and the backend run uses scratch `DB_PATH` and `PROJECTS_ROOT`)
- [x] 5.2 Run the targeted tests from groups 2 and 3
- [x] 5.3 Run the full frontend suite, `npm run lint` and the type check in `frontend/`; run the backend suite with scratch paths to confirm nothing else moved
- [x] 5.4 Verify the post-test state matches the baseline and restore if needed
- [x] 5.5 Create report `openspec/changes/summarise-scene-progress/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [x] 5.6 Mark this group complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Start the backend on a scratch copy of a database with a session whose scenes are in mixed states
- [x] 6.2 `GET /sessions/<id>` and confirm each scene carries the `state`, `index` and `affectedStage` the summary derives from (no endpoint changes in this change; this confirms the inputs)
- [x] 6.3 Document commands and responses in `reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`; remove the database copy

## 7. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Open the mixed-state session page and confirm the summary's counts and scene numbers match the cards (AC1, AC2, AC4)
- [x] 7.2 Change one scene's state in the scratch database the way the pipeline does and trigger a broadcast (or run a stub-provider session), then confirm the summary updates without a reload (AC3); confirm a finished session shows only "Done N of N" (AC5) and a paused session the same counts (AC7)
- [x] 7.3 Screenshots at 375, 1024 and 1440px in light and dark; no horizontal scroll at 375px
- [x] 7.4 Restore the environment and record in `reports/YYYY-MM-DD-step-7-e2e-testing.md`

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 `docs/frontend-standards.md`: add the summary to the naming table and the Layout line, and state that its counts are derived in `sceneProgress.ts` from scene state only
- [x] 8.2 Confirm `docs/api-spec.yml` and `docs/data-model.md` need no change; update `readme.md` (Spanish) only if it lists the panel's contents
- [x] 8.3 Run `graphify update .`
- [x] 8.4 Commit, then push and open the PR into `feature/entrega-3-JAME` linking JOS-234 (on the user's go-ahead)
