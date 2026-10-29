## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-209-time-full-size-session` from `main` (no upstream)
- [x] 0.2 Verify the current branch

## 1. Find the data

- [x] 1.1 Find where each scene's requested clip duration is stored and what `stage_attempts` holds for image and video attempts; record the answer in `design.md` (Open Questions)
- [x] 1.2 Find where the per-stage limits are read from at runtime (settings), so the script reads the same values the run used

## 2. Tests first (TDD)

- [x] 2.1 Test the stage table: attempts, timed-out count, elapsed time from first send to last finish; a stage that never ran shows no time
- [x] 2.2 Test the clip table: requested duration, generation time of the successful attempt, attempts, outcome; a failed clip shows no generation time
- [x] 2.3 Test the margin: limit over slowest successful time; not computable without a success; a `late-success` is excluded
- [x] 2.4 Test that an unknown run id fails naming the id, and that the database file is byte-identical after a run
- [x] 2.5 Test that image and video attempts are read from the request log (finish = send + latency; `transient_failure` at or above the limit is timed out, below it is not) and that `stage_attempts` image/video rows are ignored

## 3. Implementation

- [x] 3.1 Add `backend/scripts/sessionTimingReport.ts`: pure function over rows and limits, plus the read-only entry point that prints Markdown
- [x] 3.2 Add an `npm run report:session-timing -- <db-file> <run-id>` script to `backend/package.json`
- [x] 3.3 Read the scene-stage attempts from `provider_requests` (design Decision 7) and print the timed-out inference under the tables

## 4. Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Confirm no existing test depends on the new files; update affected tests if any

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [x] 5.2 Run targeted tests for the report
- [x] 5.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend`
- [x] 5.4 Verify post-test database state and restore if needed
- [x] 5.5 Create report `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [x] 5.6 Mark the step complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl

- [x] 6.1 Not applicable: no endpoint is added or changed. Record the reason in `reports/`

## 7. E2E Testing with Playwright MCP

- [x] 7.1 Not applicable: no interface change. Record the reason in `reports/`

## 8. The full-size run (owner at the Windows machine)

- [ ] 8.1 Owner approves the spend: the script, the expected number of clips and the RunningHub balance; record the approval in `reports/`
- [ ] 8.2 Build the executable for Windows x64 from `main` (or take the release artifact) and complete the stubbed JOS-205 checks first; a defect there stops this task and is fixed under JOS-205
- [x] 8.3 Put the real provider keys in the data folder of that build, run the 1,500-1,800 word session end to end, and record any billing or balance interruption with its time
- [x] 8.4 Close the application, copy `vid4you.sqlite` (and the project folder) off the Windows machine, and probe the final video with `ffprobe` (duration within one frame of the narration, 1920x1080, 30 fps)
- [x] 8.5 Produce the report with `npm run report:session-timing` and save it with the interruption log and probe output under `reports/`

## 9. Decide and Update Documentation (MANDATORY)

- [ ] 9.1 Write the recommendation per limit and for the video concurrency (keep or change, with the margin); if a limit should change, open a separate OpenSpec change for it
- [ ] 9.2 Update `readme.md` sections 2.4 and 4.1 (Spanish): confirm or remove the "provisional" wording
- [ ] 9.3 Post the result as a comment on JOS-197
- [ ] 9.4 Run `graphify update .`
- [ ] 9.5 Open the pull request linking JOS-209; archive the change after merge
