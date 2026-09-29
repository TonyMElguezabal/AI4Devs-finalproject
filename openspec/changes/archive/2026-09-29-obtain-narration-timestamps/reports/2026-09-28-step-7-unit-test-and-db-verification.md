# Step 7 Report - Unit Tests and Database Verification

- Date: 2026-09-28
- Change: obtain-narration-timestamps (JOS-139)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-139-obtain-narration-timestamps` at `7017312`

## Commands Executed

All from `backend/`, against the default test store (`data/skeleton.sqlite`, `data/projects/`):

- `sqlite3 data/skeleton.sqlite` for row counts, triggers and applied migrations, and `find data -maxdepth 2` (before and after)
- `npx vitest run test/narration-timestamps-persistence.test.ts test/narration-timestamps-check.test.ts test/alignment-provider.test.ts test/alignment-provider.contract.test.ts test/obtain-narration-timestamps.test.ts test/narration-timestamps-session.test.ts test/session-state-machine.test.ts --reporter=verbose` (targeted)
- `npm test` (full suite), `npm run typecheck`
- Coverage (task 6.3): base `cd9f2ef` (the JOS-144 tip this branch started from) in a temporary git worktree vs head, each on a scratch database, with `@vitest/coverage-v8` installed locally without saving it
- Mutation checks (task 4.9), on a scratch database, each reverted

## Unit Test Results

- Targeted: 179 passed, 0 failed, 1 skipped (the opt-in contract test against the real alignment endpoint; it runs in step 8), 1.66 s
- Full suite: 418 passed, 0 failed, 2 skipped (both opt-in contract tests), 25 files, 6.43 s. Run five more times during this change: 4 of 5 had no failure; the known intermittent `orchestrator.test.ts` failure (`waitFor timed out`, skeleton, not caused by this change, see the JOS-144 step 8 report) appeared once in the first three runs of group 2
- Type check: exit 0; `server-runtime-load.test.ts` passes
- Mutation checks: ignoring the earlier `native-unusable` finding (2 tests failed), not recording it (6), skipping the native usability check (7) and recording a voice failure instead of a decomposition failure (9) each made tests fail, and the file was restored byte for byte

### Coverage (task 6.3)

| Metric | Base `cd9f2ef` | Head | Change |
|---|---|---|---|
| All files, lines | 93.18% | 94.17% | +0.99 |
| All files, branches | 85.14% | 87.47% | +2.33 |
| All files, functions | 98.09% | 98.42% | +0.33 |
| `db.ts`, lines | 97.85% | 98.02% | +0.17 |
| `db.ts`, branches | 87.82% | 89.60% | +1.78 |
| `orchestrator.ts`, branches | 77.14% | 78.20% | +1.06 |
| `orchestrator.ts`, lines | 93.80% | 93.15% | -0.65, see note |
| `narrationTimestamps.ts`, `alignmentProvider.ts` (new) | n/a | 100% lines | |
| `narrationTimestampsPhase.ts` (new) | n/a | 100% lines | |

Note on `orchestrator.ts` lines: the two lines are the skeleton's "provider result not ready" return in `handleProviderResult`. The base run hit that path once and this run hit it zero times, so its coverage depends on timing. None of this change's code is on that path (the change only added an optional `progress` argument to `deriveSessionState` and the records `toSnapshot` reads). Two gaps this change had left were closed with tests: the rethrow in `insertNarrationTimestamps` for an error that is not a duplicate, and a leftover timestamps file that parses but does not fit the script.

## Scenario to Test Mapping (task 6.2)

All 12 scenarios of `specs/narration-timestamps/spec.md` have a test. `OT` = `test/obtain-narration-timestamps.test.ts`, `NS` = `narration-timestamps-session`, `NC` = `narration-timestamps-check`, `NP` = `narration-timestamps-persistence`, `AP` = `alignment-provider`.

| # | Requirement / scenario | Tests |
|---|---|---|
| 1 | Phase start: from a completed voice-over | OT "has an in-flight timestamps attempt when the alignment provider is called"; NS "shows chunk-decomposing while the timestamps are being obtained", "shows chunk-decomposing after the timestamps are stored ..." |
| 2 | Phase start: the session has no voice-over | OT "refuses a session without a voice-over and records nothing" |
| 3 | Phase start: the timestamps are already stored | OT "refuses a session whose timestamps are stored, leaving them and the attempts unchanged" |
| 4 | Native: usable | OT "stores them with mechanism native, once, in the common format, without calling the alignment provider" |
| 5 | Native: characters do not match the script | NC "requires native timestamps to reproduce the script exactly"; OT "... native timestamps have characters that do not reproduce the script" |
| 6 | Native: invalid times | NC the five "rejects ..." tests (negative, non-finite, end before start, starts backwards, end beyond the duration); OT the negative-time and end-beyond cases |
| 7 | Alignment: the voice provider delivered none | OT "sends the stored MP3 and the locked script and stores mechanism alignment"; AP "sends one multipart request with the MP3 as file, the script as text, and the credential" |
| 8 | Alignment: native timestamps are unusable | OT the five "calls the alignment provider when the native timestamps have ..." tests and "does not change the voice-over or its MP3" |
| 9 | Storage: timestamps are stored | OT the native and alignment success tests (file in the common format, one record); NP "stores the first record and refuses a second" |
| 10 | Storage: the record is changed directly | NP "refuses a change of mechanism / path / character_count", "refuses a deletion and the record still exists" |
| 11 | Failure: alignment cannot produce usable timestamps | OT the five "records ... nothing stored, a failed attempt, a decomposition failure" tests, "never records a voice-over failure ...", "fails without a provider call when the stored MP3 is missing"; NS "shows failed with failed phase decomposition ..." |
| 12 | Retry: after unusable native timestamps | OT "calls the alignment provider directly, without checking the native timestamps again", "keeps going straight to alignment on every later attempt" |

Also covered: the parsers (NC), the HTTP-status classification and the credential rules (AP), the state machine's six allowed transitions and every other refused pair, live updates (NS), recovery from a crash between the file and its record (OT), and clearing a failure after a later success.

## Database State Verification

- Pre-test state (default test store) **was not clean**: 1 session, 1 voice-over, 0 timestamps records, and a `Guard test` project folder. This was residue of my own earlier full-suite runs: the tests reset the store at the start of each test, not at the end, so whichever file runs last leaves its rows. The suite's own resets cleared it during this run.
- Post-test state: all row counts 0 (`runs`, `scenes`, `voice_overs`, `stage_attempts`, `narration_timestamps`), 11 triggers, migrations 2 to 8, and one empty leftover test folder (`Traversal Test 2026-09-28 09-49`) from the existing consultation test.
- State restored: Yes. The empty folder was removed with `rmdir` (it only removes empty directories); the store then held 0 rows, 11 triggers (`narration_timestamps_no_delete`, `narration_timestamps_no_update`, the three `runs_*_locked`, the four `scenes_*`, `voice_overs_no_delete`, `voice_overs_no_update`), migrations 2 to 8, and `data/projects/` was empty.

## Findings

- **Test hygiene:** the suite leaves the last test's rows and project folder behind, so the default store is not empty after a run. It is harmless to the tests (each resets first) but it makes "the store matches the baseline" depend on which file runs last. A global reset after all tests would fix it; not done here, since it changes every test file's setup.

## Outcome

- Step 7 status: PASS
- Blocking issues: none
