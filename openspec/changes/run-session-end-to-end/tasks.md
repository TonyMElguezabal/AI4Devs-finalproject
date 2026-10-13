# Tasks — Run a session end to end (JOS-195)

Every code change starts with a failing test (TDD), and every scenario in `specs/pipeline-handoffs/spec.md` has at least one test. Providers are stubs (voice, alignment, visual instructions, image, video, assembly); no test reaches a real provider or needs `.secrets.json`. Sessions, voice-overs and attempts are created through the store, as the existing decomposition and restart tests do. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties). Reports go under `openspec/changes/run-session-end-to-end/reports/`.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-195-run-session-end-to-end` from `origin/feature/entrega-2-JAME` (worktree `../AI4Devs-jos-195`); no upstream set, so a push cannot land on the integration branch by accident — done 2026-10-13
- [x] 0.2 Verify the branch is current and based on the integration head — done: current branch, at `2fa63dc` (integration head)

## 1. Gate (no code before every item passes)

- [ ] 1.1 `git fetch`; confirm no branch or open PR already adds the narration hand-off or the default assembly tool (JOS-194 searched all remote branches on 2026-10-13; repeat). Record the integration head used
- [ ] 1.2 Confirm design Decision 2's assumption: a stored narration-timestamps record always has a `timestamps` attempt (read `narrationTimestampsPhase.ts`). If not, change the held-work term to "no scenes and no decomposition attempt" in design.md and the spec first
- [ ] 1.3 Read `preserve-progress-across-restarts` (design Decision 4, task 1.3) and the restart tests; record what boot does today for a `submitted` session without a voice-over, so Decision 4's widened candidate query can be pinned by a test before it changes
- [ ] 1.4 With the user's approval, point `decompose-script-into-chunks` tasks 2.3, 9.1 and 14.1 and `preserve-progress-across-restarts`' deferred decomposition pending rule at this change, so each rule lives in one place

## 2. Test support (design Decision 6)

- [ ] 2.1 Add a shared test helper that installs stub decomposition dependencies (alignment and visual instructions) and resets them; use the stubs the decomposition tests already build
- [ ] 2.2 Write a failing test that shows the risk: with the hand-off in place, a session created in a test without the helper would call the default providers. Use it to list every existing test file that waits for `voice-over-complete` (`voice-over-phase`, `voice-over-retry`, `voice-over-session-*`, `narration-timestamps-session`, `phase-progress`, and any found) — the list is the input to group 8

## 3. Decomposition launcher: start after the narration (TDD; design Decisions 1-2)

- [ ] 3.1 Write failing tests for `decompositionLauncher.heldWork`: one unit for a session with a stored voice-over, no scenes, no failure, no `timestamps`/`decomposition` attempt; zero when any of those is false; a scheduled retry still counts as today
- [ ] 3.2 Write failing tests for `launchDecompositionFor(sessionId)`: starts `runDecompositionPhase` with the configured dependencies for a waiting session; starts nothing for a paused session (held), for a failed one, for one with scenes, for one with any decomposition attempt; a second call after the first started adds no attempt; a scheduled retry is still released as today
- [ ] 3.3 Extend `decompositionLauncher` and export `launchDecompositionFor`; the background run logs `decomposition.launch` (session id, trigger) and `decomposition.launch.error` without payloads. Make 3.1-3.2 pass; existing decomposition and retry tests stay green

## 4. Voice-over hand-off (TDD; design Decision 3)

- [ ] 4.1 Write failing tests: the first voice-over attempt's success, a retried attempt's success, and an accepted late result each start decomposition exactly once; a voice-over failure starts nothing; a session paused while the voice-over was in flight stays at `voice-over-complete` with one held decomposition unit, and continue starts it
- [ ] 4.2 Add `handOffAfterNarration(runId)` to `voiceOverPhase.ts` and call it after each successful store and its broadcast. Make 4.1 pass

## 5. Boot (TDD; design Decision 4)

- [ ] 5.1 Write a test pinning today's boot behaviour found in 1.3 for a `submitted` session without a voice-over (it must hold after the query change, or the change must be deliberate and recorded)
- [ ] 5.2 Write failing tests: a stored, not paused session at `voice-over-complete` with no decomposition attempt starts decomposition on `recoverOnBoot`; a paused one does not; a failed one does not; a session with scenes keeps today's behaviour
- [ ] 5.3 Widen `recoverOnBoot`'s candidate query to sessions without scenes. Make 5.1-5.2 pass; the restart and concurrency tests stay green

## 6. Default assembly tool (TDD; design Decision 5)

- [ ] 6.1 Write failing tests for `configureAssemblyTool(env)`: without `USE_STUB_ASSEMBLY_TOOL` the ffmpeg tool is registered; with `success`, `not-retryable-failure`, `slow-success`, the matching stub (unknown values keep today's `transient-failure` fallback)
- [ ] 6.2 Implement `configureAssemblyTool` (exported, next to `assemblyStubModeFor`) and call it from the bootstrap in place of the stub-only branch. Make 6.1 pass

## 7. End to end through the API (TDD)

- [ ] 7.1 Write a failing test: with all providers and the assembly tool stubbed, `POST /sessions` (via `inject`) reaches `final-video` with no `/internal/test/*` request, through voice-over, `chunk-decomposing`, `chunks-processing` and assembly
- [ ] 7.2 Make 7.1 pass with groups 3-6 in place (no extra production code expected; if any is needed, update design.md first)

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 8.1 Install the helper from 2.1 in every test file listed in 2.2; where a test asserts the state right after the narration, assert `voice-over-complete` before the hand-off settles or assert the next state, without weakening what it checks
- [ ] 8.2 Review the tests that assert nothing launches after `voice-over-complete` or that a session stays there, and update them for the hand-off (`decompose-script-into-chunks` task 9.1); record each change and why

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 9.1 Capture the pre-test state of the test store and project folders
- [ ] 9.2 Run the targeted tests (groups 2-7), then the full backend suite with temporary `DB_PATH`/`PROJECTS_ROOT`, no `.secrets.json`, ffprobe on `PATH`; run `npm run typecheck`; run the frontend suite and typecheck
- [ ] 9.3 Verify the post-test state matches the baseline; restore it if not
- [ ] 9.4 Save `reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` (commands, results, flaky tests seen, pre/post comparison, cleanup)

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Start the backend from this branch with a temporary store, `USE_STUB_VOICE_PROVIDER=success`, `USE_STUB_VIDEO_PROVIDER=success`, `USE_STUB_ASSEMBLY_TOOL=success`, and **no** `ALLOW_TEST_ENDPOINTS`; resolve design Open Question 1 first (real OpenAI and fal keys with the product owner's approval, or the limited run)
- [ ] 10.2 `POST /sessions` and follow `GET /sessions/:id` and `GET /events`: the state moves past `voice-over-complete` to `chunk-decomposing` with no other request; record each state and frame
- [ ] 10.3 With the keys approved: the session reaches `final-video` with no `/internal/test/*` call. Without them: the decomposition fails with a "missing credential" cause, proving the hand-off ran
- [ ] 10.4 Pause a session while its voice-over is in flight: it stays at `voice-over-complete` with one held decomposition unit; `POST /sessions/:id/continue` starts the decomposition
- [ ] 10.5 Stop the server right after a session reaches `voice-over-complete` (the stub voice is fast: stop the process from the voice-over's completion log line, or create the state in the store), start it again, and confirm the decomposition starts at boot
- [ ] 10.6 Error case: a session with a failed decomposition is not restarted by a continue or a restart
- [ ] 10.7 Record every command and response, restore the store, save `reports/YYYY-MM-DD-step-10-curl-endpoint-testing.md`

## 11. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Start backend (as 10.1) and frontend; type a script in the UI and start the project
- [ ] 11.2 Confirm the page moves past `voice-over-complete` on its own and shows the decomposition and scenes phases progressing, without reload
- [ ] 11.3 Pause before the narration completes, confirm the held decomposition is shown, continue, confirm it starts
- [ ] 11.4 Restore the environment and save `reports/YYYY-MM-DD-step-11-e2e-playwright.md`

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 `docs/backend-standards.md`: remove "the real assembly tool is not wired at bootstrap (S1)" and "decomposition is not started after the voice-over (S6)" from the deployment section's known gaps; describe the hand-off and the boot rule where the launch gate is documented
- [ ] 12.2 `docs/api-spec.yml` and `docs/data-model.md`: confirm no state or field description changes; update only if one says decomposition must be started manually
- [ ] 12.3 `docs/development_guide.md`: the stub flags section no longer needs `quick-scene` to reach the final video
- [ ] 12.4 Check the documents agree with each other and with ADRs 0001-0007

## 13. Close

- [ ] 13.1 Comment on JOS-195 with what shipped, the reports and the PR link; link JOS-194's stories S1 and S6 to JOS-195 (in JOS-194's `follow-up-stories.md` on its own branch, coordinated with that change)
- [ ] 13.2 Open the PR into `feature/entrega-2-JAME` (after the user's go-ahead to push)
- [ ] 13.3 After merge, archive this change with `/opsx:archive`
