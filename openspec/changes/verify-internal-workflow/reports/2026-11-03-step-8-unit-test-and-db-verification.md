# Step 8 Report - Unit Tests and Database Verification

- Date: 2026-11-03
- Change: verify-internal-workflow (JOS-243: JOS-247, JOS-248, JOS-249)
- Agent: Claude Code (Opus 5.5)

## Commands Executed

Every `vitest` run used a fresh scratch `DB_PATH` and `PROJECTS_ROOT` from `mktemp -d`, removed afterwards.

- Targeted: `npx vitest run test/stub-assembly-slow.test.ts test/decomposition-stub-factories.test.ts test/provider-stub-variables.test.ts test/stage-diagnostics.test.ts test/telemetry-provider-name.test.ts test/error-log.test.ts test/workflow-wait-for.test.ts test/workflow-end-to-end.test.ts test/workflow-stage-failure.test.ts`
- `npm run typecheck`, `npm run lint`, `npm test` in `backend/`
- The full suite again in a fresh detached worktree of `HEAD` with no `backend/.secrets.json` (node_modules symlinked), then the worktree removed
- `test/workflow-end-to-end.test.ts` five times in a row (task 5.6)

## Unit Test Results

- Targeted tests: 64 passed, 0 failed, 0 skipped (9 files, 13.7 s)
- Full suite, this checkout: 2661 passed, 0 failed, 11 skipped (206 files passed, 5 skipped; 126.6 s)
- Full suite, fresh worktree without `.secrets.json`: 2660 passed, 0 failed, 12 skipped. The one extra skip is `video-provider.contract.test.ts` ("RunningHub contract (real API, no spend)"), which runs only where a RunningHub key exists. It is unrelated to this change.
- Typecheck and lint: clean
- End-to-end workflow test, 5 runs: 5 passed, 5.54–5.58 s each. No `vid4you-workflow-*` folder was left in the temporary directory, including after the two failed runs during task 5.5.
- Stage-failure workflow test: passes in 5.6 s. With `setErrorLog(app.log)` taken out of `bootstrap.ts` it fails on the log assertion, so it guards group 4.

## Review of Existing Tests (task 7.1)

- `stub-assembly-slow.test.ts`: the slow-success case wrote to `/tmp/final.mp4` and now uses a scratch folder, because the stub really writes the file.
- `final-video-download.test.ts`, `assembly-failure-recovery.test.ts`: these write real MP4 bytes and then call the stub. They failed until the stub kept an existing file (spec scenario "An existing output file is kept"). The tests themselves are unchanged.
- `stage-diagnostics.test.ts`: one case added for `stub-reasoning` and `stub-alignment`. The existing stub assertions are unchanged and still pass under the prefix rule.
- `telemetry-provider-name.test.ts`: one case added (`stub-reasoning` is reported as `stub`).
- `packaging-build.test.ts`: unchanged. Its `smoke-stubs` marker is still only in `packaging/smokeStubs.ts`.
- `decomposition-stubs.test.ts` and `test/decompositionStubs.ts`: unchanged (task 2.4).
- `telemetry.test.ts`, the process-handler tests, and the unresponsive-provider contract test: unchanged and green. What is exported over OTLP is unchanged.

## Coverage (task 7.2)

Not measurable. The backend has no coverage provider (`@vitest/coverage-*` is not installed and there is no coverage script), and adding one would be a new dependency, which this change rules out. In its place:
- Every new module has its own test: `decompositionStubs.ts`, `configureProviderStubs`, `setErrorLog` and `writeErrorLog`, the stub's placeholder, `waitFor`.
- The only removed code is the three exact stub entries in `stageDiagnostics.ts`, now covered by the prefix rule and its tests, and the two consent early returns in `db.ts`, now covered by `error-log.test.ts`.

## Database State Verification

- Pre-test baseline (`backend/data/skeleton.sqlite`, read with `sqlite3 -readonly`):
  - `runs`: 1, `stage_attempts`: 8, `scenes`: 46, `provider_requests`: 92
  - `data/projects` entries: 1
  - SHA-1 of `skeleton.sqlite` (first 16 characters): `9d1f0aa625a4b1e2`
  - mtimes: `skeleton.sqlite` 1793337086, `skeleton.sqlite-wal` 1793378075, `projects/` 1793370938
- Post-test validation: identical on every line (`diff` empty)
- State restored: not needed
- Restoration actions: none

## E2E Testing with Playwright (task 10.1)

Not applicable: this change touches no frontend code and no page.

## Outcome

- Step 8 status: PASS
- Blocking issues: none
