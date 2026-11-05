# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-10-27
- Change: record-provider-changes (JOS-229)
- Agent: Claude Sonnet 5.5

## Commands Executed
- `DB_PATH=<scratch>/d.sqlite PROJECTS_ROOT=<scratch>/p npx vitest run <targeted files>` (backend; a fresh scratch directory per run)
- `DB_PATH=<scratch>/d.sqlite PROJECTS_ROOT=<scratch>/p npx vitest run` (backend, full)
- `npx vitest run` (frontend, full), `npx tsc --noEmit` and `npm run lint` in both packages

There is no `backend/.secrets.json` in this worktree and no vendor key in the environment, so provider-dependent tests were not masked.

## Review of existing tests (task 6.1)
Run: the migration, active-provider storage, active-provider binding, admin-providers-route, admin-provider-profiles-route, move-failed-stage, admin-failed-stages-route, admin-reports-route and reports-section tests. No assertion listed migrations or tables, so none needed to change. Changes to existing tests:
- `admin-provider-profiles-route.test.ts`: the "profile that is not usable" case also asserts that the log stays empty (spec: a refused request logs nothing).
- `reports-section.test.tsx`: the four fetch stubs answer `/provider-changes`, and the password test expects five requests instead of four.

## Unit Test Results
- New backend tests: `provider-change-log-storage.test.ts` (5), `provider-change-log.test.ts` (9), `provider-changes-report.test.ts` (9). They were written before the code and failed first (migration not applied, `recordProviderChange` and the report module missing, no entries logged).
- New frontend tests: 5 in `reports-section.test.tsx` ("ReportsSection provider changes").
- Targeted backend set (9 files): 104 passed, 0 failed.
- Full backend: 178 files passed, 4 skipped; 2397 tests passed, 5 skipped, 0 failed.
- Full frontend: 382 passed, 0 failed.
- Typecheck: clean in both packages. Lint: backend clean; frontend 0 errors and 7 warnings (the same `exhaustive-deps` warnings that were there before this change).

## Database verification
The unit tests run against scratch databases only; the local databases were never opened by a test run.
- Pre-test baseline of the real data (the Windows-run copy at `Winrun_results/vid4you.sqlite`): latest migration 23, no `provider_changes` table (migration 25 is not applied there), file modified `Oct 27 11:08`, SHA-256 `ad5830c5…`. Its checksum differs from the `27cd12db…` quoted by the JOS-224 and JOS-225 reports: those reports opened it read-only with `sqlite3`, whose close can checkpoint the WAL (the `-wal` file is 0 bytes, dated 11:08, before this change started). Nothing in this change opened it for writing.
- Post-test: same checksum `ad5830c5…`, same migration 23, same absence of `provider_changes`, same modified time.
- Manual endpoint testing (group 8) uses a copy of that file, never the original; the original is not opened again by this change.
- The test code's `resetAll` now also empties `provider_changes`, in scratch databases only.
