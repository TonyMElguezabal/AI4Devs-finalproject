# Step 8: unit tests and database verification (JOS-168, view-progress-by-phase)

Date: 2026-10-04. Branch `feature/jos-168-view-progress-by-phase`, HEAD `866e982`.

## 8.1 Baseline of the default store (`backend/data/skeleton.sqlite`)

Read-only snapshot before any test run: 0 rows in every domain table (`runs`, `scenes`, `voice_overs`, `narration_timestamps`, `scene_results`, `scene_video_results`, `stage_attempts`, `provider_requests`), 13 rows in `schema_migrations` (highest version 14), 17 triggers, and `data/projects/` holding one folder (`Traversal Test 2026-10-04 21-24`).

All test runs below used a scratch `DB_PATH` and `PROJECTS_ROOT` (`mktemp -d`).

## 8.2 Targeted tests

- Backend: `phase-progress`, `narration-timestamps-session`, `session-api-surface`, `phase-retry-in-flight`: 4 files, 67 tests passed.
- Frontend: `components.test.tsx`: 71 tests passed.

## 8.3 Typecheck and full suites

| Check | Result |
| --- | --- |
| `npm run typecheck`, backend | clean |
| `npm run typecheck`, frontend | clean |
| `npm test`, backend | 921 passed, 2 skipped (49 files passed, 2 skipped) |
| `npm test`, frontend | 78 passed |
| Backend, fresh worktree of HEAD with no `backend/.secrets.json` | 921 passed, 2 skipped |
| Frontend, fresh worktree of HEAD | 78 passed |

The fresh worktree confirms local provider credentials do not mask a failure.

## 8.4 Post-test state

A second snapshot of the default store is identical to the baseline (row counts, migrations, triggers, `data/projects/` contents). Nothing needed restoring. The two temporary worktrees were removed.

## 7.2 Scenario coverage

| Scenario (`specs/session-phase-progress/spec.md`) | Tests |
| --- | --- |
| A newly registered session | `session-api-surface`: lists the four phases in pipeline order on a newly registered session |
| Each in-progress state marks its own phase | `phase-progress`: ordered phase list, one case per state |
| A completed narration awaiting decomposition | `phase-progress`: ordered phase list (`voice-over-complete`) |
| A finished session | `phase-progress`: ordered phase list (`final-video`) |
| The live snapshot carries the same phases | `session-api-surface`: carries the same phases in a live snapshot as in the read |
| Voice-over / Decomposition / Scenes failed | `phase-progress`: one failed phase per failed phase |
| A failed scene beside one still generating | `phase-progress`: failed phase mapping, plus the scene tests from JOS-150 |
| Decomposition failure cause; not-retryable failure | `phase-progress`: failure of a phase (cause and retryable, including not-retryable) |
| Scenes failure has no phase-level cause | `phase-progress`: no failure on a failed scenes entry |
| Decomposition retry in flight; The retry fails again; An attempt older than the failure does not count | `narration-timestamps-session`: decomposition retry in flight (3 tests) |
| Voice-over retry in flight | `phase-retry-in-flight`: voice-over retry |
| A scene retry | `phase-retry-in-flight`: scene retry (pins existing behaviour) |
| Held work: decomposition, image and video, not paused | `phase-progress`: held work (3 tests) |
| Opening a session; A held phase | `components`: four sections in order with labels; held text in the right section |
| Decomposition failure on the page; Assembly failure fixture; Scenes failure on the page | `components`: three failure tests |
| Advancing to the next phase; A retry goes in progress | `components`: the two live re-render tests |

Every scenario has at least one test.

## 7.2 Ticket acceptance criteria

| AC | Covered by |
| --- | --- |
| AC1 sections per phase with status | `components` section tests; `phase-progress` ordered list |
| AC2 live update without reload | `components` re-render tests; `session-api-surface` live snapshot equals read |
| AC3 failed phase identified | `phase-progress` failed phases; `components` failure tests; header test |
| AC4 cause visible | `phase-progress` failure rules; `components` alert tests |
| AC5 retry returns to in progress | `narration-timestamps-session` and `phase-retry-in-flight`; `components` alert-removal test |

## 7.3 Coverage

`npx vitest run --coverage.enabled --coverage.provider=v8 --coverage.include='src/**'`, backend, once for the propose commit `f2a5ede` (worktree) and once for HEAD:

| | Tests | All files lines | `orchestrator.ts` lines / branches | `routes.ts` lines / branches |
| --- | --- | --- | --- | --- |
| `f2a5ede` | 886 | 89.01% | 83.85% / 83.76% | 68.27% / 84.78% |
| HEAD | 921 | 89.33% | 84.92% / 85.43% | 70.28% / 83.33% |

Line coverage rose everywhere. `routes.ts` branch coverage reads 1.5 points lower only because the new optional `failure` field adds branches V8 counts once the schema runs; no branch covered before lost its coverage.

The frontend has no coverage provider installed, so no frontend coverage figure was taken. Its changes (`PhaseSection`, `phaseActions`, `phaseLabels`, `phaseStatusClass`) each have direct tests.
