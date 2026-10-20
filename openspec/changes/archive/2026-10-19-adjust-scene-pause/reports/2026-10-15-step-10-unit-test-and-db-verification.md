# Step 10: unit tests and database verification (JOS-190, adjust-scene-pause)

Date: 2026-10-15. Branch `feature/jos-190-adjust-scene-pause`, base `9c78fe0` (`origin/feature/entrega-2-JAME`, identical to `main`).

## 10.1 Baseline

This worktree is new: at the start `backend/data/` did not exist and there is no `backend/.secrets.json`, so there was no default store to snapshot and local provider credentials cannot mask a failure. The default store is therefore not a baseline; all verification runs below use a scratch `DB_PATH` and `PROJECTS_ROOT` (folders in the session scratchpad, removed afterwards).

**A correction to record:** a few early backend runs (before I had settled the habit of always passing the scratch paths) imported `db.ts` without them, which created a default store `backend/data/skeleton.sqlite` inside this worktree (gitignored). It was this worktree's own and nothing outside it; it was deleted before this report, and every run listed below used the scratch paths. After the final runs `backend/data/` does not exist.

## 10.2-10.3 Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck`, frontend | clean (exit 0) |
| `npm run build`, frontend | built |
| `npm test`, frontend | 232 passed (2 files); 213 at the base, 19 added, none removed |
| `npm run typecheck`, backend | clean (exit 0) |
| `npm test`, backend (scratch `DB_PATH`/`PROJECTS_ROOT`) | 1612 passed, 5 skipped (106 files passed, 4 skipped); 1525 at the base, 87 added |
| Targeted: `scene-pause`, `scene-pause-storage`, `narration-edits` (3 against real ffmpeg), `final-video-rebuild`, `scene-pause-api` | all green |

Tests added: `scene-pause.test.ts` (24), `scene-pause-storage.test.ts` (13), `narration-edits.test.ts` (12), `final-video-rebuild.test.ts` (11), `scene-pause-api.test.ts` (17), and 19 in `components.test.tsx`. One existing test was changed: `attempt-outcomes.test.ts` "Migration 15…" now bounds `applyMigrationsTo(fixture, 15)`, because it applied every later migration and expected exactly `[15]`. One unrelated existing test (`orchestrator.test.ts`, "delivering the same success twice…") failed once in a full run and passed on three isolated runs, on the base, and in three further full runs; it looks timing-sensitive under load.

The "Accessible naming convention" suite is unedited and green.

## 10.4 Post-test state

Nothing outside the scratch store was written; the scratch folders were removed.

## 9.3 Scenario coverage (`specs/`)

| Scenario | Tests |
| --- | --- |
| scene-pause-adjustment: A pause between two scenes / The last scene / A scene with no PROMPT | `scene-pause.test.ts` derivePauses (pause between scenes, last scene, no PROMPT or interval, mismatched timestamps, whitespace, order, never negative) |
| : A comfortable scene / The speed factor narrows the floor / A value off the grid or out of range | `scene-pause.test.ts` pauseRange, isAllowedPause; `scene-pause-api.test.ts` 422 cases |
| : Setting and resetting / Before the final video exists / Locked records stay locked | `scene-pause-storage.test.ts`; `scene-pause-api.test.ts` (set, reset to original, 409 no-final-video) |
| : A trimmed pause | `final-video-rebuild.test.ts` (shifted intervals, narration edit, version 2, both files kept); step 11 and step 12 reports (real ffmpeg: 14.4 s → 14.6 s → 14.8 s) |
| : Nothing to rebuild / A rebuild while one is running / A failed rebuild | `final-video-rebuild.test.ts`; `scene-pause-api.test.ts` |
| : Editing on the page / A limited range explains itself / Downloading during a rebuild | `components.test.tsx` (dial, Reset, sentences, rebuild button, in-progress note); step 12 report |
| media-assembly-foundation: No pause edits / An edited pause / An edit that cannot be kept in sync / The stored narration is untouched | `narration-edits.test.ts` (exact stream-copy arguments, edited encode within one frame, the guard failing a mismatch); `final-video-rebuild.test.ts` (stored voice-over not written) |
| assembly-failure-recovery: A successful rebuild keeps earlier versions / A failed rebuild | `final-video-rebuild.test.ts` |

## Outcome

Step 10: PASS. No blocking issues.
