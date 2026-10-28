# Step 8 Report - Unit Tests and Database Verification

- Date: 2026-10-28
- Change: rebuild-scene (JOS-235)
- Agent: Claude (Sonnet 5.5)

## Commands Executed
- `cd backend && DB_PATH=<scratch>/test.sqlite PROJECTS_ROOT=<scratch>/projects npx vitest run <file>` for each new file, each seen failing before the code existed:
  - `test/scene-rebuild-transition.test.ts` (20 failed: `markSceneForRebuild is not a function`);
  - `test/scene-rebuild-files.test.ts` (5 of 8 failed: no `sceneFileStem`, unversioned names and URLs);
  - `test/scene-rebuild-command.test.ts` (failed to load: no `sceneRebuild.ts`);
  - `test/scene-rebuild-final-video.test.ts` (reassembly cases failed until `triggerAssemblyIfReady` changed).
- `cd frontend && npx vitest run test/scene-rebuild.test.tsx` (21 of 25 failed first, then passed).
- `cd backend && DB_PATH=<scratch>/test.sqlite PROJECTS_ROOT=<scratch>/projects npx vitest run` (full backend suite, scratch directories emptied before the run)
- `cd frontend && npx vitest run`, `npm run lint` and `npx tsc --noEmit` in both packages

## Unit Test Results
- New backend tests: 21 (transition and migration 26) + 8 (file names, URLs, routes) + 13 (command and route) + 7 (final video) = 49 passed.
- New frontend tests: 25 passed (`sceneActions.rebuild`, the form, refusal sentences, Rebuild final video when stale, the API client).
- Full backend suite: 2481 passed, 5 skipped, 0 failed (185 files, 4 skipped), 94 s.
- Full frontend suite: 443 passed, 0 failed (15 files).
- `tsc --noEmit`: clean in both packages. `eslint`: backend clean; frontend 0 errors and 7 warnings, all in files this change does not touch (the same 7 on the base commit).

## Defect found while writing the tests
- The first version of `triggerAssemblyIfReady` skipped the launch when the final-video rebuild had already been requested by `rebuildFinalVideo`, so the manual "Rebuild final video" never ran after a failed automatic rebuild. The test "keeps the previous final video and the stale mark when the automatic rebuild fails" caught it; the trigger now launches when a request is already recorded (design Decision 6).

## Existing tests changed (task 7.1)
- `backend/test/provider-change-log-storage.test.ts`: the migration 25 test applied every migration and expected `[25]`; it now stops at 25 (`applyMigrationsTo(target, 25)`), and migration 26 has its own test.
- `backend/test/scene-pause-api.test.ts`: the four whole-object expectations of `session.finalVideo` gain `staleScenes: false` (the new field).
- `frontend/test/components.test.tsx`: the `FinalVideoStatus` fixtures gain `staleScenes: false`. The `sceneActions` tests of JOS-151/158 assert retry and correction only, so they now go through a local `recoveryActions` helper that picks those three keys; `rebuild` is covered by `scene-rebuild.test.tsx`. No assertion about retry or correction was loosened.
- No test that counts broadcasts, assembly launches or file names needed a change: none failed.

## Database State Verification
- Pre-test baseline: this worktree has no `backend/data/` directory and every run used a scratch `DB_PATH` and `PROJECTS_ROOT`, so no shared or local database was opened.
- Post-test validation: `backend/data/` still absent; only the scratch directories were written. Migration 26 was applied to throwaway in-memory databases and to the scratch database only.
- State restored: Yes (nothing to restore).

## Outcome
- Step 8 status: PASS
- Blocking issues: none
