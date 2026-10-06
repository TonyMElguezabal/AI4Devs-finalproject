# Step 8: unit tests and database verification (JOS-166, see-provider-and-attempts)

Date: 2026-10-05. Branch `feature/jos-166-see-provider-and-attempts`, after commit `3b341b7`.

## 8.1 Baseline of the default store (`backend/data/skeleton.sqlite`)

This worktree is new and its default store was filled by a few targeted runs I did not point at a scratch path, so the baseline is the state those runs left. It is a throwaway store; the main checkout's `backend/data/` was never touched.

Read-only snapshot before the verification runs: 1 `runs`, 1 `scenes`, 2 `provider_requests`; 0 in `scene_results`, `scene_video_results`, `voice_overs`, `narration_timestamps`; `stage_attempts` by outcome: 4 `transient`; 14 rows in `schema_migrations` (highest version 15); 17 triggers; one folder in `data/projects/`.

All verification runs below used a scratch `DB_PATH` and `PROJECTS_ROOT` (`mktemp -d`).

## 8.2 Targeted tests

- Backend: `stage-diagnostics`, `stage-diagnostics-surface`, `phase-progress`, `session-api-surface`, `scene-api-surface`: 5 files, 123 tests passed.
- Frontend: `components`: 94 tests passed.

## 8.3 Typecheck and full suites

| Check | Result |
| --- | --- |
| `npm run typecheck`, backend and frontend | clean |
| `npm test`, backend, run 1 | 1295 passed, 4 skipped (76 files passed, 3 skipped), 37.5 s |
| `npm test`, backend, run 2 | 1295 passed, 4 skipped, 37.8 s |
| `npm test`, frontend | 101 passed (2 files) |
| Backend, fresh worktree of HEAD with no `backend/.secrets.json` | 1294 passed, 1 failed, 4 skipped (see below) |

The fresh-worktree run confirms local provider credentials do not mask a failure (this worktree never had a secrets file either).

### Flaky behaviour (not caused by this change)

The one failure in the fresh worktree was `orchestrator.test.ts` "a not-retryable failure fails immediately, with no retries". That file fails now and then under load, in changing cases, because its stub uses a 5 ms latency (`waitFor` timeouts). On this branch it failed 2 runs in 25 when run alone (cases "resumes a still-pending request across a simulated restart" and "a manual retry after failure starts a fresh 1 + RETRY_BUDGET cycle"); the base branch showed 4 in 25 earlier today (JOS-186 and JOS-185 reports). None of the new tests failed in any run.

## 8.4 Post-test state

A second snapshot of the default store is identical to the baseline (row counts, attempts by outcome, migrations, triggers, project folders). Nothing needed restoring. The temporary worktrees were removed.

## A cost found and fixed while verifying

The first version counted each scene's requests with two queries per scene on every snapshot. The 300-scene write-capacity test (JOS-186) exposed it: 600 deliveries went from about 0.7 s to 7.6 s, because every delivery builds a full snapshot. The counts are now one grouped query per session (design Decision 1). The same test now reads 984 and 1035 ms on a scratch store (about 0.7 s before this change); the difference is the extra query and the phase stage reads in each snapshot.

## 7.3 Coverage (`@vitest/coverage-v8` installed with `--no-save` for this measurement only)

| | Lines | Branches | Functions | Tests |
| --- | --- | --- | --- | --- |
| Base (`origin/feature/entrega-2-JAME`) | 91.88% | 92.36% | 98.60% | 1259 |
| This branch | 92.04% | 92.47% | 98.64% | 1295 |

Every figure rose. `stageDiagnostics.ts` is at 100% lines and branches; `orchestrator.ts` lines 87.77% to 88.13%, `db.ts` 98.09% to 98.12%, `routes.ts` 73.20% to 73.82%. The frontend has no coverage provider installed, so no frontend figure was taken; the new `stageDiagnostics.ts` formatter, the `SceneRow` and `PhaseSection` branches each have direct tests.

## 7.2 Scenario coverage (`specs/stage-diagnostics/spec.md`)

| Scenario | Test |
| --- | --- |
| Image stage ran twice | `stage-diagnostics-surface`: shows the image provider and its attempts once the image stage ran twice |
| Image attempts survive the clip stage | `stage-diagnostics-surface`: keeps the image attempts once the clip stage has started |
| A scene that has not started | `stage-diagnostics-surface`: lists no stage for a scene that has not started |
| Attempts count across a manual retry | `stage-diagnostics-surface`: counts every attempt across a manual retry |
| The scene carries no top-level provider or attempts | `stage-diagnostics-surface`: no longer carries a top-level provider or attempts |
| Native timestamps unusable, alignment used; Instructions stage | `stage-diagnostics-surface`: shows timestamps (the latest mechanism, all attempts) and then the instructions stage |
| Voice-over stage | `stage-diagnostics-surface`: shows the voice-over stage with its provider and two attempts |
| Assembly stage | `stage-diagnostics-surface`: shows assembly as local assembly |
| A stage that has not run | `stage-diagnostics-surface`: lists no stage when none has run; never lists a stage under the scenes phase |
| The live snapshot equals the read | `stage-diagnostics-surface`: carries the same stages in a live snapshot as in the read |
| Diagnostics expose no credentials or confidential data (sentinels in every free-text column, credentials in the environment, the clip endpoint) | `stage-diagnostics-surface`: the three leak tests (read, live snapshot, only name, model and count); a mutation that added the error text to a diagnostic made 8 tests fail |
| Provider display values and the unknown-identifier rule | `stage-diagnostics`: 22 tests, including one entry per identifier the code can bind or record |
| Scene details | `components`: lists the image and the clip under their accessible names; writes '1 attempt' in the singular; lists only a stage that is present; shows an unknown provider without a model; offers no action |
| Phase section | `components`: lists Timestamps then Scene instructions; lists the voice-over and assembly stages; renders nothing for a phase with no stage |
| Live attempt count | `components`: updates a count from a new snapshot without a reload |

## Ticket acceptance criteria

| AC | Covered by |
| --- | --- |
| AC1 provider per scene stage | `stage-diagnostics-surface` (scene tests), `components` (scene details) |
| AC2 attempts per scene stage | same |
| AC3 session-level stages' provider and attempts | `stage-diagnostics-surface` (phase tests), `components` (phase sections) |
| AC4 no credentials or confidential data | `stage-diagnostics-surface` (leak tests, strict response schemas), `stage-diagnostics` (never echoes an unknown identifier) |
