# Tasks — Redesign the frontend visual design (JOS-198)

Every behaviour or markup change starts with a failing test (TDD), and every scenario in `specs/visual-design/spec.md` is covered by a unit test, the contrast script, or the E2E step (jsdom cannot see CSS; design Risks). The approved mockup is the visual reference: `https://claude.ai/artifact/3HdP5s6BDdPAJ6eAs8mebS` (version 2). No accessible name or role in `docs/frontend-standards.md` § Accessible Naming Convention may change.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-198-redesign-visual-design` from `origin/feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), in the worktree `../AI4Devs-jos-198`
- [x] 0.2 Verify the branch was created and is the current branch in that worktree

## 1. Gate

- [ ] 1.1 `git fetch`, then check which of the open frontend branches (JOS-157, JOS-159, JOS-163, JOS-164) have merged into `feature/entrega-2-JAME` since base `256b08f`. Rebase onto any that have. Record the result here.
- [ ] 1.2 Confirm the base still matches design.md § Context: styling lives only in `tokens.css`/`app.css`; `status.ts` is the one state→class mapping; scene and session states render as raw strings; `SessionPage` renders meta line, header, title, script, then phase sections. If anything moved, update design.md before coding.
- [ ] 1.3 List every test that asserts visible text this change replaces (raw state strings, "connected"/"connecting…", "Vid4You (prototype)", `exceeds-maximum`/`exceeds-limit`, the raw affected stage). Record the list here; group 9 rewrites them.

## 2. Tokens and contrast (design Decisions 2, 7, 8)

- [ ] 2.1 Write `reports/contrast.mjs`: parse `frontend/src/styles/tokens.css`, resolve each text/background pair for the light and dark themes (including status text on its 13% tinted pill background, computed like `color-mix`), print WCAG ratios, and exit non-zero for any normal-text pair under 4.5:1. Run it against the current tokens to prove it works.
- [ ] 2.2 Rewrite `frontend/src/styles/tokens.css`: light palette on `:root`, dark palette inside `@media (prefers-color-scheme: dark)` with `color-scheme: dark`; font, type-scale, spacing, radius, extrusion (`--extrude-sm`, `--extrude`, `--extrude-lift`, `--hi`, `--edge`, `--edge-accent`) and `--spring` tokens, taken from the approved mockup.
- [ ] 2.3 Run `reports/contrast.mjs`; fix any failing pair in the tokens until it passes. Keep the output for the step 10 report.
- [ ] 2.4 Remove the Google Fonts `<link>` from `frontend/index.html` and set the document title to "Vid4You".

## 3. Labels and icons (TDD; design Decisions 3 and 6)

- [ ] 3.1 Write failing tests: `SCENE_STATE_LABEL` and `SESSION_STATE_LABEL` in a new `src/statusLabels.ts` give design Decision 3's labels for every state (exhaustive over the unions); `statusIcon` in `styles/status.ts` maps each of the four status classes to one icon name.
- [ ] 3.2 Implement `src/statusLabels.ts` and `statusIcon`; make 3.1 pass.
- [ ] 3.3 Write a failing test that `Icon` renders an SVG with `aria-hidden="true"` and `focusable="false"` for every name; implement `src/components/Icon.tsx` (closed name union, `currentColor`).
- [ ] 3.4 Write a failing test for a `StatusPill` component: it renders the label text and a hidden icon, and its class comes from the status class it is given. Implement it in `src/components/StatusPill.tsx`.

## 4. App shell (TDD; design Decision 4)

- [ ] 4.1 Write failing tests for `App`: a top bar shows "Vid4You"; on a session page it shows "Live" when connected and "Connecting…" otherwise, plus a "New project" button that returns to the start form; on the start form neither the indicator nor the button is shown.
- [ ] 4.2 Move the connection text out of `SessionPage` into the top bar in `App.tsx`; add the "New project" button wired to `handleStartNew`; make 4.1 pass.
- [ ] 4.3 Restyle the start form as one card (heading, one-line description, fields, primary "Start project" button) without changing its labels or form name. The start error renders inside the card.

## 5. Session layout and phase stepper (TDD; design Decision 4)

- [ ] 5.1 Write failing tests for `SessionPage`: a project panel (`<aside>`) contains the title as a level-1 heading, the language, a "Show script" disclosure with the script, and the "Session status" section; the pipeline column contains a list named `Pipeline progress` whose four items read, in order, each phase name and its status label; the four phase sections still follow.
- [ ] 5.2 Implement `src/components/PhaseStepper.tsx` (reads `session.phases` only) and the panel/pipeline structure in `SessionPage`; make 5.1 pass.
- [ ] 5.3 Write failing tests for `SessionHeader`: the session state shows as its plain label (not the raw string) in a status pill; the paused marker, still-generating, held, failed-phase and failed-scenes lines are unchanged; Pause/Continue keep their names. Implement; make them pass.
- [ ] 5.4 Write failing tests for `PhaseSection`: the status renders as a `StatusPill`; a failure renders as a callout containing the cause (still `role="alert"`) and, when offered, the `Retry decomposition` button; held work renders as "Waiting for you to continue (N held)". Implement; make them pass.

## 6. Scene cards (TDD; design Decision 5)

- [ ] 6.1 Write failing tests for `SceneRow`: the card shows the plain scene label (not the raw state); a thumbnail `img` with `alt=""` appears only when `result.imageUrl` exists; the index badge is hidden from the accessibility tree; held and still-generating text are unchanged; the `Scene {n}` name and the View/Hide button names are unchanged.
- [ ] 6.2 Write failing tests for the expanded details: `Affected stage` reads "Image"/"Clip"; duration and speed warnings read as the sentences in design Decision 3 (still `role="alert"`); diagnostics groups, image, clip, retry, correction form, refusal and download links keep their names and roles.
- [ ] 6.3 Implement the card and details markup in `SceneRow.tsx` and the grid in `SceneList.tsx`; make 6.1-6.2 pass.

## 7. Final video card (TDD)

- [ ] 7.1 Write failing tests for `FinalVideoDownload`: with a URL it renders the `Download final video` link styled as the primary action; without one it renders "Available once every scene is done". Implement; make them pass.

## 8. Styling, depth and motion (design Decision 1)

- [ ] 8.1 Rewrite `frontend/src/styles/app.css` from the approved mockup: shell, panel, stepper, phase cards, callouts, scene grid and cards, details, forms, buttons, pills, final-video card; extrusion on surfaces and buttons; press-to-sink buttons; `open-card`/`unfold` on opened details; staggered `pop-in` (via inline `--i`) on panels, steps, phase cards and scene cards. No color or font literal outside `tokens.css`.
- [ ] 8.2 Add the `prefers-reduced-motion: reduce` block (no animations, no transforms on press) and the `prefers-reduced-transparency: reduce` block (opaque top bar, no blur).
- [ ] 8.3 Run `npm run build` in `frontend/` and fix any type or build error.

## 9. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 9.1 Rewrite the assertions listed in task 1.3 to the new labels and text; change nothing else in those tests.
- [ ] 9.2 Confirm the "Accessible naming convention" suite in `test/components.test.tsx` passes with no edit to it.
- [ ] 9.3 Confirm every scenario in `specs/visual-design/spec.md` is covered, naming for each whether it is a unit test, the contrast script or an E2E check; list the mapping in the step 10 report. Map JOS-198's five acceptance criteria the same way.

## 10. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 10.1 Capture the pre-test baseline of the default store (row counts per table, applied migrations) and `data/projects/` contents. This change touches no backend code; the baseline proves the frontend suite leaves them untouched.
- [ ] 10.2 Run the targeted tests (`frontend/test/components.test.tsx`) and the contrast script.
- [ ] 10.3 Run `npm run typecheck` and the full `npm test` in `frontend/` and `backend/`.
- [ ] 10.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 10.5 Create the report `openspec/changes/redesign-visual-design/reports/YYYY-MM-DD-step-10-unit-test-and-db-verification.md`, including the contrast table for both themes.
- [ ] 10.6 Mark this step complete only after the tests pass and the report file exists.

## 11. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 No endpoint changes. Start the real server on a scratch store and scratch projects folder; `curl GET /health`, `POST /sessions`, `GET /sessions/:id` and `GET /languages` answer as before, proving the frontend still reads the same contract.
- [ ] 11.2 Clean up the scratch store and folder; confirm the default store is untouched; save `reports/YYYY-MM-DD-step-11-manual-endpoint-testing.md`.

## 12. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 12.1 Applies: every screen changes. Run backend (scratch store) and frontend.
- [ ] 12.2 Start a project through the form, located by its labels; confirm the session page, the `Pipeline progress` list and the four phase sections by accessible name.
- [ ] 12.3 Advance the session on the backend and confirm labels update live without a reload and without the other cards replaying their entrance.
- [ ] 12.4 Expand a scene, pause and continue, and trigger a refusal or retry, all located by accessible name only.
- [ ] 12.5 Screenshot the session page at 375, 1024 and 1440px in light and dark color schemes; confirm no horizontal scroll and the stacked/side-by-side layout.
- [ ] 12.6 Emulate `prefers-reduced-motion: reduce` and `prefers-reduced-transparency: reduce`; confirm details open with no animation and the top bar is opaque.
- [ ] 12.7 Restore the environment and save `reports/YYYY-MM-DD-step-12-e2e.md` with the screenshots.

## 13. Update Technical Documentation (MANDATORY)

- [ ] 13.1 `docs/frontend-standards.md` § Visual Design: replace Render Console with the Studio direction (both palettes, typography, depth and motion tokens, status labels + icon convention, reduced-motion/transparency behaviour); update § Project Structure with `statusLabels.ts`, `Icon.tsx`, `StatusPill.tsx`, `PhaseStepper.tsx`; add `Pipeline progress` to the accessible-naming table.
- [ ] 13.2 `docs/adr/0004-frontend-stack.md`: one line pointing to this change as superseding the Render Console visual direction.
- [ ] 13.3 Run `graphify update .`.

## 14. Close out

- [ ] 14.1 Commit the work on `feature/jos-198-redesign-visual-design`, path-scoped to this change.
- [ ] 14.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-198 and the mockup.
- [ ] 14.3 Obtain review by at least one human, not only AI agents.
- [ ] 14.4 Archive the OpenSpec change after merge.
