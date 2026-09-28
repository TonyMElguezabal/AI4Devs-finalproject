# Step 8 Report - Unit Tests and Database Verification

- Date: 2026-09-27
- Change: lock-script-and-narration (JOS-137)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-137-lock-script-and-narration` at `cf6dd32`

## Commands Executed

All from `backend/`, against the default test store (`data/skeleton.sqlite`, `data/projects/`):

- `sqlite3 data/skeleton.sqlite "<row counts>"`, `"select name from sqlite_master where type='trigger'"`, `"select group_concat(version) from schema_migrations"` and `find data -maxdepth 2` (pre-test and post-test state)
- `npx vitest run test/content-lock.test.ts test/voice-launch-guard.test.ts test/session-api-surface.test.ts test/server-runtime-load.test.ts --reporter=verbose` (targeted)
- `npm test` (full suite)
- `npm run typecheck`
- Coverage (once, on scratch databases, see below): `npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/**'` with `DB_PATH` and `PROJECTS_ROOT` pointed at a scratch folder

## Unit Test Results

- Targeted tests: 61 passed, 0 failed, 0 skipped (4 files: `content-lock` 34, `session-api-surface` 16, `voice-launch-guard` 10, `server-runtime-load` 1)
- Full suite: 223 passed, 0 failed, 0 skipped (13 files)
- Type check: exit 0, no errors (`erasableSyntaxOnly` enabled)
- Runtime: targeted 1.33 s, full 3.83 s
- Notes: no flaky test, no retry. The full suite ran with the test files in sequence (`fileParallelism: false`), since they share one SQLite file.

### Coverage (task 7.4)

`@vitest/coverage-v8` was installed locally with `--no-save`, so `package.json` and the lockfile are unchanged; the project has no coverage script. Base `b6e6060` (JOS-136 persistence, before any JOS-137 code) was measured in a temporary git worktree, then removed. Each run used its own scratch database.

| Metric | Base `b6e6060` | Head | Change |
|---|---|---|---|
| All files, lines | 90.32% | 91.38% | +1.06 |
| All files, branches | 81.54% | 82.35% | +0.81 |
| All files, functions | 97.61% | 97.82% | +0.21 |
| `db.ts`, lines | 97.33% | 97.63% | +0.30 |
| `db.ts`, branches | 86.02% | 87.03% | +1.01 |
| `routes.ts`, lines | 71.37% | 74.19% | +2.82 |

Nothing decreased. A first head measurement had `db.ts` lines at 96.78%: two paths this change added were untested (the `resetAll()` rollback and the non-`EEXIST` branch of `writeArtefactOnce`). Task 7.6 closed both. Uncovered lines that remain in `db.ts` (`setRunProjectFolder`, `getSubmittedScenes`, the rethrow in `commitSceneResult`, the rethrow in `insertVoiceOver`) predate this change or belong to JOS-136.

## Scenario to Test Mapping (task 7.3)

All 16 scenarios of `specs/content-lock/spec.md` have at least one test. File names are shortened: `CL` = `test/content-lock.test.ts`, `AS` = `test/session-api-surface.test.ts`, `LG` = `test/voice-launch-guard.test.ts`.

| # | Requirement / scenario | Test (file, describe > it) |
|---|---|---|
| 1 | Script/title/language: modification on a submitted session | CL, "The script cannot be modified from submitted onward (AC1)" > refuses a modification of a submitted session's script |
| 2 | ... while the session is paused | CL, same describe > refuses a modification while the session is paused |
| 3 | ... after a voice failure | CL, same describe > refuses a modification after a voice failure |
| 4 | ... the title or language is modified | CL, "The title and language cannot be modified either" > refuses a modification of the title / of the language / names the locked field (3) |
| 5 | ... other session fields still change normally | CL, "Other session fields still change normally" > pauses, continues, binds the voice provider and records a failure without touching the locked content |
| 6 | ... a session created before this rule existed | CL, "A session stored before the lock existed" > refuses a script modification once the migration has run, and the migration is idempotent |
| 7 | API: the operations are inspected | AS, "The API offers no operation that modifies the locked content (AC1)" > offers no PUT, PATCH or DELETE route at all; offers no route that names the voice-over or narration; answers PUT/PATCH/DELETE on a session with not found; has no PUT/POST/DELETE /sessions/:id/voice-over, POST .../voice-over/regenerate, POST .../narration, GET .../voice-over/download |
| 8 | API: a request body names the script | AS, "An operation that accepts a body ignores locked fields (AC1)" > leaves the script, title and language unchanged when the correction body names them; only locked fields; scene not failed |
| 9 | Narration: the voice-over record is modified | CL, "A completed voice-over record cannot be modified or deleted (AC2)" > refuses a modification of audio_path / duration_seconds / native_timestamps_available |
| 10 | Narration: the voice-over record is deleted | CL, same describe > refuses a deletion and the record still exists; refuses a deletion of every row at once |
| 11 | Narration: the MP3 file is written again | CL, "An artefact that must not be replaced is written once" > refuses a second write to the same path and leaves the first file's bytes unchanged |
| 12 | Launch: regeneration requested for a completed narration | LG, "Voice generation does not launch for a completed narration (AC2)" > refuses a session that has a voice-over, as a completed narration. **Partial:** the "no request is sent to the voice provider" clause cannot be tested until JOS-136's voice launch exists; handed over in task 12.1 |
| 13 | Launch: a later phase failed after the narration completed | LG, same describe > refuses a session whose narration completed and which later failed in another phase |
| 14 | Retry: the voice provider rejected the request | LG, "Voice generation may launch when no narration exists (AC3)" > allows a session whose voice attempt failed for a not-retryable reason; allows ... transiently |
| 15 | Retry: the provider returned undecodable audio | LG, same describe > allows a session whose provider returned undecodable audio, since no voice-over was stored (modelled as a failed attempt with nothing stored; it exercises the same rule as #14) |
| 16 | Retry: a session that has not started narration | LG, same describe > allows a submitted session that has made no voice attempt |

Additional tests not tied to one scenario: `writeArtefactOnce` behaviour (binary content, nested paths, no temporary file left, other sessions undisturbed), the test-only reset (atomic; leaves all triggers in place), and `server-runtime-load` (the server module loads under real `node` in strip-only mode).

## Database State Verification

- Pre-test baseline (default test store):
  - Row counts: `runs` 0, `scenes` 0, `provider_requests` 0, `scene_results` 0, `voice_overs` 0, `stage_attempts` 0
  - Triggers: `runs_language_locked`, `runs_script_locked`, `runs_title_locked`, `voice_overs_no_delete`, `voice_overs_no_update`
  - Applied migrations: 2, 3, 4, 5, 6
  - `data/`: `projects/` (one empty leftover test folder), `skeleton.sqlite`, `-shm`, `-wal`, `store.sqlite`
- Post-test validation:
  - Row counts: all 0 (identical)
  - Triggers: the same five (identical)
  - Applied migrations: 2, 3, 4, 5, 6 (identical)
  - `data/`: identical file set; the leftover empty test folder differed only by name (`Traversal Test 2026-09-27 21-46` before, `... 21-55` after), because the existing consultation test names its folder from the current minute and the suite leaves the last one behind
  - No `.tmp` file anywhere under `data/` (write-once helper leaves none)
- State restored: Yes
- Restoration actions:
  - Removed the empty leftover test folder with `rmdir` (it only removes empty directories), leaving `data/projects/` empty
  - Earlier in this step's preparation, a deliberate mutation check (removing the transaction from `resetAll()`) damaged the test store: `voice_overs_no_delete` stayed dropped and every test failed. The check had wrongly run against the default test store. The trigger was recreated from the exact definition in `backend/src/db.ts` (`VOICE_OVER_NO_DELETE_TRIGGER_DDL`), and the suite then passed (223/223). Mutation checks now use a scratch database.

## Other Evidence Recorded Here

- Gate task 1.2, on a scratch database before any lock existed: a raw `UPDATE runs SET script` changed the script, a raw `UPDATE voice_overs` changed `audio_path`, and a raw `DELETE FROM voice_overs` removed the row. The lock was a convention only.
- Mutation checks that showed the tests can fail: a temporary `PATCH /sessions/:sessionId` route made 2 `session-api-surface` tests fail; removing the transaction from `resetAll()` made the atomicity test fail. Both were reverted.
- The runtime-load test failed on the real `node` process before `ArtefactAlreadyExistsError` stopped using a constructor parameter property (task 4.7).

## Outcome

- Step 8 status: PASS
- Blocking issues: none
- Follow-ups: the "no request is sent to the voice provider" clause of scenario 12 waits for JOS-136's voice launch (task 12.1)
