# Step 4: unit tests and database state (JOS-206)

- **Baseline:** tests ran with scratch `DB_PATH=$TMPDIR/jos206.db` and `PROJECTS_ROOT=$TMPDIR/jos206-projects` (a fresh worktree, no developer data involved).
- **Targeted:** `test/release-script.test.ts` (9), `test/packaging-build.test.ts` (6, two new for the build identity), `test/build-config.test.ts`, `test/update-check.test.ts`: all pass.
- **Full backend:** `npm run typecheck` clean; `npm run lint` clean after fixing `test/provider-usage-billed-units.test.ts:39` (pre-existing, unrelated to this change); `npm test`: 167 files passed, 2244 tests passed, 5 skipped.
- **Post-test state:** only the scratch database was touched; `backend/data` and the developer database were not used.
