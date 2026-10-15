# Step 10: unit tests and database verification (JOS-198, redesign-visual-design)

Date: 2026-10-14. Branch `feature/jos-198-redesign-visual-design`, base `256b08f` (`origin/feature/entrega-2-JAME`).

## 10.1 Baseline

This change touches no backend code. The worktree is fresh: `backend/data/` did not exist and there is no `backend/.secrets.json`, so the default store is absent and local provider credentials cannot mask a failure. Every backend run below used a scratch `DB_PATH` and `PROJECTS_ROOT` (a folder in the session scratchpad, removed afterwards).

## 10.2-10.3 Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck`, frontend | clean (exit 0) |
| `npm run build`, frontend (`tsc --noEmit && vite build`) | built; CSS 17 kB, JS 165 kB |
| `npm test`, frontend | 213 passed (2 files) |
| `node reports/contrast.mjs` | 50 pairs, 0 failing (`contrast-output.md`) |
| `npm run typecheck`, backend | clean (exit 0) |
| `npm test`, backend (scratch `DB_PATH`/`PROJECTS_ROOT`) | 1525 passed, 5 skipped (100 files passed, 4 skipped) |

Frontend test count: 169 at the base commit, 213 now (44 added; none removed). The "Accessible naming convention (Decision 5)" suite is unedited and passes. The existing assertions that matched raw state text were rewritten to the plain-language labels (listed in tasks.md 1.3), and one more was found while running the suite (the Scenes section now holds two "Failed" labels: the phase's and the failed scene's).

## 10.4 Post-test state

`backend/data/` still does not exist in the worktree; the backend suite wrote only to the scratch store, which was deleted. Nothing needed restoring. The user's default store in the main checkout was not touched (no command ran there).

## 9.3 Scenario coverage (`specs/visual-design/spec.md`)

| Scenario | Verified by |
| --- | --- |
| A new component is added | `grep` for colour literals in `app.css`: none (only `white-space`); standards updated in step 13 |
| The standards document is inspected | step 13 (`docs/frontend-standards.md` § Visual Design) |
| The operating system switches theme | `contrast.mjs` reads the light palette and the dark overrides (both complete); E2E 12.5 (light and dark renders) |
| A scene's state is rendered | unit: "Scene status class mapping" (6 states, label shown, raw state absent), "Scene cards" label test, "Plain-language status labels" |
| A session is paused | unit: "keeps the paused marker identifiable by text", header tests; E2E 12.4 (paused session) |
| A phase status is rendered | unit: "shows one section per phase" (labels), "shows a pipeline progress group …" (stepper) |
| The mandatory E2E step re-runs | E2E 12.2-12.4: every target located by role and accessible name |
| A decorative icon is rendered beside a label | unit: `Icon` hidden-from-tree tests for all 10 names, `StatusPill`, stepper icon count, Pause/Continue icon |
| A component needs a status colour | unit: status-class mapping suites; no literals in `app.css` |
| A failed-state card is rendered | `contrast.mjs`: failed on surface, pill tint and callout tint, both themes (5.05-6.54) |
| Contrast is verified | `contrast-output.md` (50 pairs, 0 failing) |
| The session page is shown at phone width | E2E 12.5 at 375px: panel above pipeline, `scrollWidth` = `innerWidth` |
| The session page is shown on a desktop | E2E 12.5 at 1024 and 1440px: panel and pipeline share a top edge |
| Scenes reflow | unit: ascending-order tests; E2E 12.5 (grid reflows at each width) |
| Reduced motion is requested | E2E 12.6: `animation-name` is `none` under `reduce`, `open-details` and `pop-in` otherwise |
| A live update arrives | unit: "keeps the same DOM node across a live state change"; E2E 12.3 |
| Reduced transparency is requested | CSS rule present in the served stylesheet (E2E 12.6); the preference itself cannot be emulated with the available tooling, so the opaque fallback was not observed |

## 9.3 Ticket acceptance criteria (JOS-198)

| Criterion | Covered by |
| --- | --- |
| Accessible names unchanged; naming suite passes | naming suite unedited and green; E2E located everything by name |
| Plain-language label with icon, never the raw string | label, `StatusPill` and card tests; E2E snapshots show labels only |
| Light/dark palettes, 4.5:1 contrast | `contrast.mjs` 50/50; E2E dark and light renders |
| Reduced motion: no movement animation | E2E 12.6 |
| 375 / 1024 / 1440 px, no horizontal scroll, layout rule | E2E 12.5 |

## Outcome

Step 10: PASS. No blocking issues.
