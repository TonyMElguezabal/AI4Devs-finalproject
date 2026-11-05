# Step 4 — unit tests and database verification (JOS-205)

Date: 2026-10-26 · Branch: `feature/jos-205-packaged-build-script` (worktree `AI4Devs-jos-205`)

## Isolation

Every run used a scratch `DB_PATH` and `PROJECTS_ROOT` under `mktemp -d`. `backend/data/` does not exist in this worktree before or after the runs, so there is no store to compare or restore (baseline = absent, post-state = absent).

## Results

- New tests (20): `packaging-verify`, `packaging-runtime-env`, `packaging-instance`, `packaging-build` (bundles the release and smoke flavors with esbuild, no network), `packaging-locations`.
- `npm run typecheck`: clean.
- `npm run lint`: clean for every file of this change. One existing error remains in `test/provider-usage-billed-units.test.ts:39` (`no-unnecessary-type-assertion`); the file is untouched here and fails the same way on the branch base.
- `npm test`: 165 files passed, 4 skipped (contract tests that need provider keys); 2204 tests passed, 5 skipped.

## Existing tests reviewed (task 3.1)

`server-boot-log`, `credentials`, `ffmpeg-path`, `origin-policy` and the providers/settings tests import `bootLogFields`, `loadCredential` and the settings loader, whose exports are unchanged. The bootstrap now lives in `src/bootstrap.ts` and loads from `server.ts` only when it is the entry file, so importing `server.ts` in a test still starts nothing. No existing test needed an update.
