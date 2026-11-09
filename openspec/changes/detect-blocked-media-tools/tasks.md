## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-271-ffmpeg-blocked` from `origin/main` (no upstream) in the worktree `../AI4Devs-jos-271-ffmpeg-blocked`
- [x] 0.2 Verify the current branch

## 1. Tests first (TDD)

- [x] 1.1 Test `classifyToolStartFailure`: `ENOENT` is `missing`; `SIGKILL`, `EPERM` and `EACCES` are `blocked`; a non-zero exit is not a start failure
- [x] 1.2 Test `ffmpegHasSubtitleFilter`: a failed check runs again on the next call (the block is removed, no restart); a passed check is not run again
- [x] 1.3 Test `checkMediaTools`: ready, blocked `ffprobe`, missing `ffmpeg`, `ffmpeg` without the `subtitles` filter; messages name the tool and carry no path; `USE_STUB_ASSEMBLY_TOOL` skips it
- [x] 1.4 Test `POST /sessions`: a failed check answers `503` with the reason, creates no session, calls neither the content check nor any provider; a ready check creates the session as before
- [x] 1.5 Test `probeAudio` through `confirmVoiceOver` / `sendVoiceAttempt`: a killed `ffprobe` is recorded as `probe-unavailable` (not-retryable, no automatic retry, no `invalid-audio`); a tool that runs and rejects the file is still `invalid-audio`

## 2. Implementation

- [x] 2.1 Add `classifyToolStartFailure` to `backend/src/config/ffmpeg.ts` and stop caching a negative `ffmpegHasSubtitleFilter` answer (Decisions 3, 5)
- [x] 2.2 Add `backend/src/mediaToolsCheck.ts` with `checkMediaTools`, its get/set/reset injection and the user-facing messages (Decisions 2, 3)
- [x] 2.3 Call the check in `POST /sessions` before the content check and add the `503` answer to the route's response schema (Decision 1)
- [x] 2.4 Use the shared classification in `probeAudio`, with a detail that names `ffprobe` and the fix (Decision 4)
- [x] 2.5 Install a "ready" check in `backend/test/setup.ts`

## 3. Review and Update Existing Unit Tests (MANDATORY)

- [x] 3.1 Review existing tests that create sessions, probe audio or call `ffmpegHasSubtitleFilter` (`assembly-failure-recovery`, voice-over and ffmpeg assembly tests) and update any that relied on a cached negative answer

## 4. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 4.1 Capture the pre-test database baseline with an isolated `DB_PATH` and `PROJECTS_ROOT` (never the shared `data/` folder)
- [x] 4.2 Run the targeted tests for the new and changed modules
- [x] 4.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend`
- [x] 4.4 Verify the post-test database state and restore it if needed
- [x] 4.5 Create `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md`
- [x] 4.6 Mark the step complete only after the tests pass and the report exists

## 5. Manual Endpoint Testing with curl (MANDATORY - agent executes)

- [ ] 5.1 Start the backend with isolated `DB_PATH` and `PROJECTS_ROOT`, written as literal environment values
- [ ] 5.2 With a working `ffmpeg`/`ffprobe`: `POST /sessions` answers `201`
- [ ] 5.3 With `FFPROBE_PATH` pointing at a copy that has the quarantine flag (or a killed stand-in): `POST /sessions` answers `503`, names `ffprobe`, creates no session and sends no provider request
- [ ] 5.4 Remove the block and repeat without restarting the backend: `POST /sessions` answers `201` (AC3)
- [ ] 5.5 Save the commands and outputs in `reports/YYYY-MM-DD-step-5-manual-endpoint-testing.md`

## 6. E2E Testing with Playwright MCP

- [ ] 6.1 Submit a script in the interface while a tool is blocked and confirm the `503` reason is shown to the User; if the reason is not shown, add the smallest frontend fix and its test

## 7. Update Technical Documentation (MANDATORY)

- [ ] 7.1 Update `docs/backend-standards.md` (media assembly and create-session behaviour, the `USE_STUB_ASSEMBLY_TOOL` and `FFMPEG_PATH` notes)
- [ ] 7.2 Update `docs/api-spec.yml` with the `503` answer of `POST /sessions`
- [ ] 7.3 Run `graphify update .`
- [ ] 7.4 Commit on the feature branch; open the pull request linking JOS-271 only when asked; archive the change after merge
