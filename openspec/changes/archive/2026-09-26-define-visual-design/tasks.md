## 0. Setup: Create Feature Branch (MANDATORY — FIRST STEP)

- [x] 0.1 Create feature branch `feature/define-visual-design` — from `feature/entrega-2-JAME`, not `main`: the prototype this change depends on (`openspec/changes/define-frontend-stack/prototype/`) is only committed on that branch, not yet merged to `main`
- [x] 0.2 Verify branch creation and current branch status — confirmed via `git branch --show-current`: `feature/define-visual-design`

## 1. Design tokens (TDD: write the failing assertion first)

- [x] 1.1 Confirm the current prototype baseline at `openspec/changes/define-frontend-stack/prototype/` ships zero CSS (re-verify the premise in `design.md` § Context before writing code) — confirmed: `find . -iname "*.css"` returns nothing
- [x] 1.2 Write a failing unit test in `test/components.test.tsx` asserting each of the 6 chunk states and the 8 session states (plus the paused marker) resolves to an expected CSS class name via the shared status mapping (Decision 2, `design.md`) — confirmed failing: `Failed to resolve import "../src/styles/status"` (module doesn't exist yet)
- [x] 1.3 Write a test asserting every status row keeps its existing text label unchanged (Decision 3) — written alongside 1.2 in the same `it` blocks (same red failure above, since the import itself fails); this guard is expected to already hold once the import resolves (the text was never touched), so it stays green after task 2 rather than needing to be forced red on its own
- [x] 1.4 Write a regression-guard test asserting the accessible names from `docs/frontend-standards.md` § Accessible Naming Convention are unchanged (`specs/visual-design/spec.md` "Styling does not regress the accessibility contract") — same rationale as 1.3: a true regression guard for behavior that must stay exactly as-is, not a behavior being introduced

## 2. Implement the token set and status mapping

- [x] 2.1 Create `src/styles/tokens.css`: color custom properties (`--color-bg: #14161A`, `--color-text: #E7E5DE`, `--color-muted: #8A8F98`, `--color-border: #2A2E35`, `--color-status-complete: #4E9E8E`, `--color-status-progress: #E8A33D`, `--color-status-failed: #D6635A`, `--color-status-queued: #848994` — raised from the mockup's `#5B6068` during task 9.1's contrast audit, see that task) and type (`--font-mono` stack with `IBM Plex Mono` + system-monospace fallback, per Risk 3 in `design.md`)
- [x] 2.2 Add the Google Fonts `<link>` (`IBM Plex Mono`, weights 400/500/700) to `index.html`, per Decision 5
- [x] 2.3 Create `src/styles/status.ts` exporting `sceneStatusClass`/`sessionStatusClass`, backed by a `Record<SceneState | SessionState, StatusClass>` mapping (types named `SceneState`/`SessionState` in this codebase, not `ChunkState` — matched to `src/types.ts`) covering all 6 chunk states and 8 session states — single source of truth, per Decision 2
- [x] 2.4 Create `src/styles/app.css`: layout, spacing, and per-status classes (left-edge color bar + matching text color) consuming the tokens from 2.1, never a hardcoded hex outside this file and `tokens.css`
- [x] 2.5 Import `tokens.css` and `app.css` from `src/main.tsx`
- [x] 2.6 Confirm tasks 1.2–1.4's tests now pass — `npx vitest run test/components.test.tsx`: 25/25 passed

## 3. Apply the styling across the screen inventory

- [x] 3.1 `StartProjectForm.tsx` — apply tokens (dark background, monospace labels), keep the `<label htmlFor>` pattern unchanged — added `.start-form`/`.field` classes only, no markup restructuring
- [x] 3.2 `SessionHeader.tsx` / `App.tsx` shell — session-state line, pause/continue control styled via the shared button style, paused marker keeps its own text (`— paused`) plus a `.paused` class, per spec's "Status is never color-only" requirement. (Note: PRD §8.3's per-stage provider/attempts line for session-level stages, e.g. voice-over/decomposition, is not modelled in this prototype at all — same scope simplification `define-frontend-stack` already recorded in its own E2E report task 9.6; nothing to style that doesn't exist.)
- [x] 3.3 `SceneList.tsx` / `SceneRow.tsx` — `.scene-list`/`.scene-row` classes, left-edge status bar via `sceneStatusClass`, ascending-order rendering (`SceneList`'s own sort) untouched
- [x] 3.4 Scene details (expand/collapse) — `.scene-details` class added, no structural change
- [x] 3.5 Correction form — `.correction-form` class (failed-state red accents), confirmed still renders only when `scene.state === "failed"` (condition itself untouched, verified by the existing "Conditional editing" test suite still passing)
- [x] 3.6 `FinalVideoDownload.tsx` and per-scene download links — `.final-video`/`.download-links` classes; confirmed via the existing "Download gating" tests that the gating gate itself (`isComplete`, `state !== "final-video"`) is untouched

## 4. Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Confirm which test suites exist before this change: `test/useLiveSession.test.tsx` (4 tests) and `test/components.test.tsx` (11 tests, pre-change) — 15 total before this change
- [x] 4.2 Extend `test/components.test.tsx` with the status-class and text-label-preserved assertions from tasks 1.2–1.3 — added 4 new `describe` blocks, 14 new tests, kept in the suite (not deleted after turning green): 25 tests now in that file
- [x] 4.3 Confirm the "Accessible naming convention" describe block from `define-frontend-stack` still passes unmodified — confirmed, same assertions, same result
- [x] 4.4 Document the test command (`npx vitest run` from the prototype directory) — unchanged from `docs/frontend-standards.md` § Testing Standards; no new command introduced

## 5. Run Unit Tests and Verify State (MANDATORY)

- [x] 5.1 Capture pre-change test counts and pass/fail baseline (no store/database involved in this frontend-only styling change — recorded explicitly, not assumed) — 15 tests before this change (4 + 11)
- [x] 5.2 Run the targeted tests from task 4 and capture pass/fail — 25/25 passed
- [x] 5.3 Run the full prototype suite (`npx vitest run`) and record totals, failures, and runtime — 29/29 passed, ~0.7–1.0s
- [x] 5.4 Run `npx tsc --noEmit` and confirm it passes (full typing requirement, `docs/base-standards.md`) — passed, no errors
- [x] 5.5 Create the report `openspec/changes/define-visual-design/reports/2026-09-25-step-5-unit-test-verification.md` with commands executed and results — done
- [x] 5.6 Mark this step complete only after tests pass and the report exists — done

## 6. Manual Endpoint Testing with curl (MANDATORY where applicable)

This change adds no backend endpoints — it is a CSS/styling-only change consuming the same wire contract `define-frontend-stack` already verified against the backend harness. Scoped accordingly, per the precedent set in `define-frontend-stack` task 8:

- [x] 6.1 Start the backend harness (`openspec/changes/define-backend-stack/skeleton`) and confirm it is reachable — `npm start`, confirmed via `GET /sessions/nonexistent` → 400 (server responding)
- [x] 6.2 With curl, confirm the endpoints the prototype consumes return the same response shapes already documented — `POST /sessions` and `GET /sessions/:id` verified field-by-field against `src/types.ts`; unchanged
- [x] 6.3 Record the commands and responses in `openspec/changes/define-visual-design/reports/2026-09-25-step-6-curl-endpoint-check.md`, and restore any store state touched — done; `data/` deleted and verified absent

## 7. E2E Testing with Playwright MCP (MANDATORY — AGENT MUST EXECUTE)

- [x] 7.1 Start both the harness backend and the restyled frontend from their documented commands — done (`npm start`, `npm run dev`)
- [x] 7.2 Navigate to the application and snapshot the initial (start-form) state — confirmed via `read_page`: `Title`, `Script`, `Select a language`, `Start project`, identical to the documented convention. **Substitution note**: no Playwright MCP tool was available this session; used Claude in Chrome instead, per `docs/frontend-standards.md`'s documented substitution allowance — stated explicitly here and in the report
- [x] 7.3 Start a project, open the session, and assert the scene list renders in ascending order with the new styling applied — done: 3 scenes rendered `#1`/`#2`/`#3` in order, teal status bars, session reached `final-video`
- [x] 7.4 Assert the paused marker is distinguishable from a running session by text, not only by color — confirmed live: "— paused" text + muted color + "Continue session" button vs. "Pause session" button + amber bar, round-tripped both directions
- [x] 7.5 Assert the correction form still appears only on a failed stage and is absent on a successful one — confirmed live on a 2-scene session (one forced to fail): form present with red styling on the failed scene, absent on the successful one
- [x] 7.6 Assert per-scene and final-video download gating is unchanged — confirmed across scenarios: per-scene downloads only at `chunk-complete`, final video only at `final-video`
- [x] 7.7 Confirm no interaction needed a test-only selector; every target still resolves through role/accessible name — confirmed via `read_page`/`find` throughout
- [x] 7.8 Restore the environment and save the report as `openspec/changes/define-visual-design/reports/2026-09-25-step-7-e2e-browser.md` — done; tab closed, both servers stopped, `data/` removed

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 Add a "Visual Design" section to `docs/frontend-standards.md` recording the token set, the status-encoding convention, and where each lives in code — done, also updated the Project Structure tree and the Technology Stack's "No UI component library" line to stop pointing at a still-future deferral
- [x] 8.2 Update § Not Yet Decided: replace the "Visual design — explicitly deferred" line with the new section; leave the project-list and OpenAPI-client lines untouched — done, verified those two lines are byte-identical to before
- [x] 8.3 Verify no contradiction with `docs/adr/0004-frontend-stack.md` — updated its "Risks left unproven" bullet to record the resolution (not rewritten) with a pointer to the new doc section

## 9. Close out

- [x] 9.1 Confirm every requirement in `specs/visual-design/spec.md` has a corresponding passing test or verified E2E scenario:
  - "One documented visual design token set" → `docs/frontend-standards.md` § Visual Design (task 8.1)
  - "Status is never color-only" → `test/components.test.tsx` (tasks 1.3/4.2, text-label-preserved assertions) + E2E scenarios 3–4 (report 2026-09-25-step-7)
  - "Styling does not regress the accessibility contract" → `test/components.test.tsx` (task 1.4) + E2E accessible-name checks (report 2026-09-25-step-7)
  - "Sufficient text contrast" → **computed, not assumed** (WCAG relative-luminance formula): `--color-text` 14.37:1, `--color-muted` 5.57:1, `--color-status-complete` 5.70:1, `--color-status-progress` 8.40:1, `--color-status-failed` 5.00:1, `--color-status-queued` 5.16:1 (all ≥ 4.5:1) against `--color-bg` (`#14161A`). **Finding**: the queued color as originally specified in this very design (`#5B6068`, matching the approved mockup) measured only 2.86:1 — a real gap in the reviewed mockup that only surfaced once actually computed. Fixed in task 2.1 by raising it to `#848994` before this task could be marked done, per this repo's TDD/correctness standards rather than shipping a known-failing requirement.
- [x] 9.2 Record time spent: this change, within the same session as JOS-179/181/183/180's own spike work, took roughly 1–1.5 hours of agent time (proposal/design/specs/tasks artifacts, TDD test-first implementation, styling, unit/curl/E2E verification, docs, and the contrast-audit fix)
- [x] 9.3 Obtain review by at least one human before archiving, consistent with the standard this project already holds `define-frontend-stack` to — confirmed by the user
