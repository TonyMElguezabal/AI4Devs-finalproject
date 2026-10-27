# Step 6 Report - Unit Tests and Database Verification

- Date: 2026-10-26
- Change: use-reference-image-in-generation (JOS-202)
- Agent: Claude Sonnet 5.5

## Commands Executed
All backend runs used a wrapper that sets a throwaway `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH` under the session scratchpad and moves `backend/.secrets.json` aside for the run (restored by a trap):
- `vt.sh test/reference-image-generation.test.ts test/image-provider.test.ts test/settings.test.ts`
- `vt.sh` (full backend suite)
- `npx tsc --noEmit` in `backend` and in `frontend`
- `npx eslint src test/reference-image-generation.test.ts test/image-provider.test.ts test/settings.test.ts test/phase-instants.test.ts` in `backend`
- `npx vitest run` in `frontend`

## Unit Test Results
- Targeted tests (new snapshot, stage, video, migration, adapter and settings tests): all pass (13 in the new file; 13 added or changed in `image-provider.test.ts` and `settings.test.ts`).
- Full backend suite: 161 files passed, 4 skipped; 2213 tests passed, 5 skipped, 0 failed; 81 s.
- Frontend: 9 files, 334 tests passed. Type checks pass in both packages.
- Lint: clean on every file this change touches. `npx eslint .` still reports problems that exist on `main` without this change: 1 error in `backend/test/provider-usage-billed-units.test.ts` and 2 errors (plus warnings) in the frontend (`ReportsSection.tsx`, `reports-section.test.tsx`).
- Existing test changed: `phase-instants.test.ts` "migration 22" compared the `runs` table after applying every migration, which now includes migration 23's columns; it now applies up to 22 only, which is what it tests.

## Incidents found while testing (not caused by the change, recorded for the owner)
1. A first bare `npx vitest run` in `backend/` used the default `DB_PATH`/`PROJECTS_ROOT`. `resetAll()` deletes `PROJECTS_ROOT`, so it removed `backend/data/projects` (three local project folders) and left test rows in a freshly created dev database. The leftovers were removed; the folders are not recoverable here (the DB rows of the old database remain in `skeleton.sqlite.pre-scene-id-backup`).
2. With `backend/.secrets.json` present the suite makes real provider calls (decomposition tests reach the real Fal adapter) and `decomposition-phase.test.ts` flakes: `FOREIGN KEY constraint failed` in 4 of 40 runs with the file, 0 of 40 without it, and 0 of 54 in a checkout that has no secrets file. Real Fal requests may therefore have been billed by this session's repeated runs; check the Fal usage page.
3. `main` failed type checking since PR #105 (`process.argv[1]` may be `undefined`); fixed on branch `fix/server-entrypoint-typecheck`.

## Database State Verification
- Pre-test baseline of the real data folder `backend/data`: `projects/` empty (after incident 1), no `skeleton.sqlite`, backups present.
- Post-test: identical (no `skeleton.sqlite`, `projects/` empty, same backups). All test state lived in the scratch directory.
- State restored: Yes. Restoration actions: none needed after the isolated runs.

## Outcome
- Step 6 status: PASS
- Blocking issues: none for this change.
