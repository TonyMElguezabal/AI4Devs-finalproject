# Tasks — Lock the script at project start and the narration once complete (JOS-137)

Tests come first throughout: each behaviour gets a failing test before the code that makes it pass, and every scenario in `specs/content-lock/spec.md` has at least one functional test. No provider is called by this story.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-137-lock-script-and-narration` from `feature/jos-136-generate-voice-over` (stacked: it needs JOS-136's migration 4; both merge into `feature/entrega-2-JAME`, never `main`)
- [x] 0.2 Verify the branch was created and is the current branch — `feature/jos-137-lock-script-and-narration` at `b6e6060` (JOS-136 group 3 committed first, so migration 4 is on the branch)

## 1. Gate: Confirm what this story builds on

- [x] 1.1 Confirm JOS-136's migration 4 is on the branch: the `voice_overs` table keyed on `run_id`, and `insertVoiceOver` refusing a second row — confirmed in commit `b6e6060`
- [x] 1.2 Confirm the current script lock is a convention only: no statement in `backend/src/db.ts` updates `runs.title`, `runs.script` or `runs.language`, and a raw `UPDATE` of them succeeds today. Record the evidence in the step 8 report — confirmed on a scratch database: a raw `UPDATE runs SET script` changed the script, a raw `UPDATE voice_overs` changed `audio_path`, and a raw `DELETE FROM voice_overs` removed the row. The only `UPDATE runs` statements in `db.ts` set `project_folder`, `paused`, `voice_provider_id` and `failure`
- [x] 1.3 Record whether JOS-136's voice launch (its group 5) exists yet — it does not (no voice launch in `backend/src`; JOS-136 is at group 3 of 12). If it doesn't, group 5 below adds the guard and group 12 hands it to JOS-136's task 5.12 rather than wiring a launch that isn't built
- [x] 1.4 If 1.1 is not met, stop and record the blocker — 1.1 is met; nothing blocks

## 2. Script, title and language lock (TDD) — design Decision 1

- [x] 2.1 Write failing tests that a raw `UPDATE` of `runs.script` is refused for a session that is `submitted`, paused, and failed in the voice-over phase, and the stored script is unchanged each time — `backend/test/content-lock.test.ts`; also an identical-value write, another session's row, and a mixed `paused` + `script` update that must change neither
- [x] 2.2 Write failing tests that updating `runs.title` or `runs.language` is refused and both are unchanged
- [x] 2.3 Write a failing test that `setRunPaused`, `bindVoiceProvider` and `setRunFailure` still succeed and leave the script, title and language unchanged — passed before the trigger existed (a regression guard), and still passes
- [x] 2.4 Write a failing test that the refusal message names the locked field
- [x] 2.5 Add migration 5 with one `BEFORE UPDATE OF <column> ON runs` trigger per column (`title`, `script`, `language`), each refusal message naming its column, with the DDL kept in named constants — `SESSION_CONTENT_LOCK_TRIGGERS_DDL` and migration 5 in `backend/src/db.ts`
- [x] 2.6 Write a failing test that a session stored before migration 5 (fixture database) refuses a script update after the migration runs, and that re-running the migrations is a no-op
- [x] 2.7 Run the group 2 tests and confirm they pass — 13/13 new tests pass (12 failed before migration 5), full suite 175/175, `npm run typecheck` clean

## 3. Voice-over record lock (TDD) — design Decision 2

- [x] 3.1 Write failing tests that a raw `UPDATE` and a raw `DELETE` of a `voice_overs` row are refused and the row is unchanged — `backend/test/content-lock.test.ts`; three columns updated, one row and all rows deleted, and a second voice-over still refused
- [x] 3.2 Add the `BEFORE UPDATE` and `BEFORE DELETE` triggers on `voice_overs` as migration 6 (migration 5 is already applied to existing databases and is not edited), each DDL in a named constant — `VOICE_OVER_NO_UPDATE_TRIGGER_DDL` and `VOICE_OVER_NO_DELETE_TRIGGER_DDL` in `backend/src/db.ts`; a fixture test proves a database stopped at version 5 gets protected by migration 6
- [x] 3.3 Write a failing test that `resetAll()` empties `voice_overs` and that the delete trigger exists again afterwards (queried from `sqlite_master`) — also that a voice-over stored after a reset is locked again, and that the session triggers survive
- [x] 3.4 Update `resetAll()` to drop the delete trigger, delete the rows and recreate the trigger from the same constant, inside one transaction — rolls the whole reset back if any step fails
- [x] 3.5 Run the group 3 tests and confirm they pass — 23/23 in `content-lock.test.ts` (8 failed before migration 6), full suite 185/185, `npm run typecheck` clean

## 4. Write-once MP3 file (TDD) — design Decision 3

- [x] 4.1 Write a failing test that `writeArtefactOnce` writes a new file under the session's project folder and returns its relative path — `backend/test/content-lock.test.ts`; also binary content byte for byte and nested paths
- [x] 4.2 Write a failing test that a second `writeArtefactOnce` to the same path is refused and the first file's bytes are unchanged — refusal is a typed `ArtefactAlreadyExistsError` naming the path; two back-to-back writes leave exactly one winner
- [x] 4.3 Write a failing test that `writeArtefactOnce` refuses a path outside the session's project folder, as `writeArtefact` does — also that another session's folder is undisturbed
- [x] 4.4 Write a failing test that no temporary file is left behind after a success or a refusal
- [x] 4.5 Implement `writeArtefactOnce` in `backend/src/db.ts` (temporary file, `fs.linkSync` to the final name, remove the temporary file), accepting binary content
- [x] 4.6 Run the group 4 tests and confirm they pass — 33/33 in `content-lock.test.ts` (10 failed before the helper), full suite 195/195, `npm run typecheck` clean

## 5. Voice launch guard (TDD) — design Decision 4

- [x] 5.1 Write a failing test that `canLaunchVoiceOver` allows a `submitted` session with no attempt — `backend/test/voice-launch-guard.test.ts`; also a session whose attempt is still in flight with no narration yet
- [x] 5.2 Write a failing test that it allows a session whose voice attempt failed (not retryable, and transient) and which has no voice-over
- [x] 5.3 Write a failing test that it allows a session whose attempt returned undecodable audio, so no voice-over was stored — modelled as a failed attempt with nothing stored (JOS-136 Decision 7); it exercises the same rule as 5.2, since the guard only sees the record
- [x] 5.4 Write a failing test that it refuses a session with a voice-over, with reason `narration-complete` — also per-session isolation and that deciding changes nothing
- [x] 5.5 Write a failing test that it refuses a session with a voice-over that also carries a later failure — the later failure is a failed scene (the image phase), since `runs.failure` only models the voice-over phase; also a narration that completed after an earlier failed attempt
- [x] 5.6 Implement `canLaunchVoiceOver` as a typed result (`{ allowed: true } | { allowed: false; reason: "narration-complete" }`), reading the voice-over record — `backend/src/voiceLaunchGuard.ts`
- [x] 5.7 If JOS-136's voice launch exists (task 1.3), write a failing test that a refused launch sends no provider request, then route the launch through the guard. Otherwise record this as the hand-over in task 12.1 — not applicable yet: the voice launch does not exist (task 1.3), so the wiring and its "no provider request" test are handed to JOS-136 task 5.12 through task 12.1
- [x] 5.8 Run the group 5 tests and confirm they pass — 10/10 new tests pass, full suite 205/205, `npm run typecheck` clean

## 6. API surface (TDD) — design Decision 5

- [ ] 6.1 Write a failing test that the built app has no `PUT`, `PATCH` or `DELETE` route on `/sessions/:sessionId` or on anything that exposes the voice-over
- [ ] 6.2 Write a failing test that a `POST /sessions/:sessionId/scenes/:sceneId/correct` body carrying a `script` field leaves the session's script unchanged
- [ ] 6.3 Make any change the tests require (none is expected), then run the group 6 tests and confirm they pass

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review `persistence.test.ts` and `voice-over-persistence.test.ts` for any test that updates or deletes a locked column or row, and update it to use the supported path
- [ ] 7.2 Confirm the migration fixture tests still pass with migration 5 applied
- [ ] 7.3 Confirm every scenario in `specs/content-lock/spec.md` has at least one functional test, and list the mapping in the step 8 report
- [ ] 7.4 Confirm module test coverage has not decreased
- [ ] 7.5 Run `npm run typecheck` with no errors

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test state: row counts from `snapshotCounts()`, the trigger list from `sqlite_master`, and the file list of `backend/data/`
- [ ] 8.2 Run the targeted tests for this story and capture the pass/fail summary
- [ ] 8.3 Run the full suite (`npm test` in `backend/`) and record totals, failures and runtime
- [ ] 8.4 Verify the post-test state matches the baseline, including that all four triggers are present. Restore it if it does not
- [ ] 8.5 Write the report `openspec/changes/lock-script-and-narration/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [ ] 8.6 Mark this step complete only after the tests pass and the report exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the backend and confirm it responds
- [ ] 9.2 POST a session, then try `PUT` and `PATCH` on `/sessions/:id` with a new script. Verify both return 404 and a GET returns the original script
- [ ] 9.3 POST to `/sessions/:id/scenes/:sceneId/correct` with a `script` field in the body. Verify the session's script is unchanged
- [ ] 9.4 With `sqlite3` against the running database, try `UPDATE runs SET script = …` and `DELETE FROM voice_overs` on a test row, and record the trigger refusals
- [ ] 9.5 Remove the sessions created above through the test-only reset path and confirm the store and disk match the pre-test state
- [ ] 9.6 Save the transcript as `openspec/changes/lock-script-and-narration/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: this story adds no screen. Check that the session page shows the script read-only with no edit control; if so, record a short check, otherwise record why E2E is not applicable
- [ ] 10.2 If applicable, start backend and frontend, open a session page and assert there is no control that edits the script or regenerates the narration
- [ ] 10.3 Save the report as `openspec/changes/lock-script-and-narration/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/data-model.md`: record the four triggers under the store's guarantees, next to the existing primary-key guarantees, and note that `resetAll()` is the only code that lifts one, test-only
- [ ] 11.2 `docs/api-spec.yml`: confirm no operation modifies the script, title or language or touches the voice-over, and state in the session description that they are immutable
- [ ] 11.3 `docs/backend-standards.md`: record the rule that immutable fields are locked by store triggers, and that artefacts that must not be replaced are written with `writeArtefactOnce`

## 12. Close out

- [ ] 12.1 Update `generate-voice-over`'s task 5.12 (and its Decision 6 file write) to use `canLaunchVoiceOver` and `writeArtefactOnce`, if the voice launch was not built yet (task 1.3)
- [ ] 12.2 Comment on JOS-154 (US-22) and JOS-155 (US-23) that every voice relaunch must call `canLaunchVoiceOver`
- [ ] 12.3 Open the PR against `feature/entrega-2-JAME` (after JOS-136) with a description linking to JOS-137 and this change
- [ ] 12.4 Get a review from at least one human, not only AI agents
- [ ] 12.5 Archive the OpenSpec change after merge
