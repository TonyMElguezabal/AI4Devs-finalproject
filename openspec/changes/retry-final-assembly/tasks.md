# Tasks — Retry a failed final assembly (JOS-159, US-27)

Every code change starts with a failing test (TDD), and every scenario in `specs/assembly-failure-recovery/spec.md` has at least one test. Tests use the stub assembly tool (`stubAssemblyTool.ts`) and stub voice, image and video providers that must receive nothing during assembly. Sessions with completed scenes, clips and a voice-over are created through the store. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-159-retry-final-assembly` from `origin/feature/jos-149-assemble-final-video` (PR #25, the assembly code this change extends), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate (no code before every item passes)

- [x] 1.1 `git fetch`. Confirmed PR #25 (JOS-149) merged into `feature/entrega-2-JAME` long ago (154 commits ahead of the propose commit); rebased this branch onto it (clean, no conflicts). Re-read the merged assembly code — design.md § Context updated for what changed:
  - no session failure is recorded for assembly — **still true**, confirmed (`setRunFailure`/`clearRunFailure` never called from `orchestrator.ts`, and `SessionFailure` has no `AssemblyFailure` variant);
  - the output is written directly to `final-video.mp4` — **still true**, confirmed (`outputPath = resolveArtefactPath(run.projectFolder, "final-video.mp4")`, no temp directory);
  - there is no `assembly` launcher — **now false**: `assemblyStageLauncher` exists and is registered (`preserve-progress-across-restarts`, JOS-160), off `NOT_YET_LAUNCHABLE`;
  - `continueSession` does not resume assembly — **now false**, for the same reason; but found a related real gap — `heldWork` doesn't check `run.failure`, so continue would silently relaunch an exhausted/failed assembly with no explicit retry (closed by the revised Decision 4).
- [x] 1.2 Confirmed `bounded-retry-policy` (JOS-184) is merged. Recorded: `startNewCycle(ref, options?)` in `backend/src/retry/stageAttemptRecorder.ts`, returns `{started:true, attempt}` (a `scheduled` row) or `{started:false, reason}`; the assembly stage-instance key needs no `sceneId` (session-level); it does **not** replace `runAssemblyAttempt`'s in-memory `attemptNumber` — assembly was never routed through the recorder/scheduler. Calling it and then separately letting `runAssemblyAttempt` record its own row would double-book the new cycle's first slot and orphan the scheduled row — closed by claiming it synchronously (revised Decision 3).
- [x] 1.3 Confirmed `view-progress-by-phase` (JOS-168) is merged (`phaseActions`, `PhaseSection`, `PhaseRetryButton` already exist). `retry-decomposition` (JOS-156) is merged — reused its route schemas (`looseSessionParamsSchema`, `emptyBodySchema`), its reason-code pattern and `retryRefusalSentence`/`PhaseRetryButton` on the frontend. `retry-voice-over` (JOS-155) is **not** merged (no branch exists) — nothing to reuse from it yet. `assemble-final-video` (JOS-149) is not archived, so the assembly-failure requirements stay referenced, not delta-specced, as the proposal already allowed.
- [x] 1.4 JOS-155's Open Question 1 is unanswered (no branch, no comment record) — treated as a decision for *this* story alone, not blocked on JOS-155: design.md Decision 7 keeps its original choice (offer retry whatever `retryable` is) with the reasoning written out, since nothing generated is at risk either way (§10.3/AC13). JOS-155 answers its own open question separately when it starts.

## 2. Backend: assembly failure on the session (TDD; design Decision 1)

- [ ] 2.1 Write failing tests in the assembly test file. Each of the following records `{ phase: "assembly", cause, retryable, occurredAt }` and makes the session derive `failed` with `failedPhase: "assembly"`:
  - an exhausted cycle;
  - a not-retryable failure;
  - no tool configured, with the tool never called;
  - no voice-over;
  - a missing clip file.

  Also: a later success clears it, and the cause contains no absolute path.
- [ ] 2.2 Write failing tests in `phase-progress.test.ts` (from JOS-168): the assembly phase is `failed` and carries the cause, and the earlier phases are `complete`.
- [ ] 2.3 Add `AssemblyFailure` to `SessionFailure`. Record the failure in `runAssemblyAttempt`'s three outcome paths and its pre-checks. Extend `deriveSessionState`. Make 2.1-2.2 pass.

## 3. Backend: output only on success (TDD; design Decision 2)

- [ ] 3.1 Write failing tests:
  - a failed attempt, including one where the stub tool writes a partial output before failing, leaves the project folder listing unchanged;
  - a successful attempt adds exactly `final-video.mp4`;
  - a pre-existing `final-video.mp4` with no recorded path is adopted, not overwritten, when it is a readable MP4;
  - an existing final video is never replaced.
- [ ] 3.2 Pass a per-attempt temporary `outputPath` to the tool, move it into the project folder on success without replacing a file (with the cross-device copy fallback), and remove the temp directory on failure; make 3.1 pass.

## 4. Backend: launcher, retry service and derived state (TDD; design Decisions 3-5)

- [ ] 4.1 Write failing tests in `launch-gate.test.ts`:
  - `assembly` has a registered launcher and is not in `NOT_YET_LAUNCHABLE`;
  - a first assembly held by a pause runs exactly once on continue;
  - a held retry is counted as one held unit and runs once on continue.
- [ ] 4.2 Write failing tests in a new `assembly-retry.test.ts` for `retryAssembly`:
  - an unknown session;
  - each 409 reason, with the tool never called;
  - concurrent calls open one cycle;
  - acceptance after a retryable failure and after a not-retryable one;
  - a new cycle allows four attempts.
- [ ] 4.3 Write failing tests: an accepted retry derives `final-video-generating`, with the assembly phase `in-progress` and no `failure`, while scheduled, held or running. A retry that fails again derives `failed` with the new cause.
- [ ] 4.4 Write a failing test for the migration step: a session with a failed last `assembly` attempt, no final video and no recorded failure gets its failure recorded at boot, once.
- [ ] 4.5 Implement the `assembly` launcher, `backend/src/assemblyRetry.ts`, the assembly row of the retry-rule table, and the boot step; make 4.1-4.4 pass.

## 5. Backend: components untouched (TDD; design Decision 6)

- [ ] 5.1 Write failing tests, for a failed first run, a failed retry and a successful retry:
  - the voice, image and video stubs receive nothing;
  - the MP3, image and clip hashes are unchanged;
  - the `voice_overs`, `scenes`, `scene_results` and `scene_video_results` rows are unchanged;
  - the tool receives the clips in scene order with their stored intervals.
- [ ] 5.2 Make 5.1 pass. Expect it to pass through JOS-149 Decision 4. Fix any gap in the assembly phase.

## 6. Backend: route (TDD; design Decision 3)

- [ ] 6.1 Write failing tests in `session-api-surface.test.ts` for `POST /sessions/:sessionId/assembly/retry`:
  - 200 `{ ok: true, held }`;
  - 404 for an unknown session and for a malformed id;
  - 409 for each reason;
  - 400 for any body field;
  - documented in `/docs/json`, together with the `assembly` failure phase.
- [ ] 6.2 Add the route and its Zod schemas; make 6.1 pass.

## 7. Frontend: retry action (TDD; design Decision 7)

- [ ] 7.1 Write failing tests in `test/components.test.tsx`:
  - `phaseActions` returns retry for a failed assembly phase and nothing otherwise;
  - the Final video section shows the cause, `Retry final video` and no download when failed;
  - a click calls `retryAssembly` and disables the button until the answer;
  - a 409 reason is shown as its sentence.
- [ ] 7.2 Implement `retryAssembly` in `api/client.ts`, the action in `phaseActions.ts`, and the button through the shared retry-button component; make 7.1 pass.

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 8.1 Review JOS-149's assembly tests (attempt recording, output path, the launch trigger), JOS-152's launch-gate tests (`NOT_YET_LAUNCHABLE` contents), and JOS-168's phase-progress tests for assumptions this change breaks; update them.
- [ ] 8.2 Confirm every scenario in `specs/assembly-failure-recovery/spec.md` has at least one test, and map ticket AC1-AC3 to tests; list both in the step 9 report.
- [ ] 8.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 9.1 Capture the pre-test baseline of the default store: row counts per table (`runs`, `stage_attempts`, `scenes`, `scene_video_results`), applied migrations, trigger list, and `data/projects/` contents.
- [ ] 9.2 Run the targeted tests: the assembly tests, `assembly-retry`, `launch-gate`, `phase-progress`, `session-api-surface`, `components`.
- [ ] 9.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`. Run the opt-in ffmpeg adapter test, if ffmpeg is installed, to cover the temp-then-move path with real files.
- [ ] 9.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 9.5 Create the report `openspec/changes/retry-final-assembly/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md`.
- [ ] 9.6 Mark this step complete only after the tests pass and the report file exists.

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Start the real server on a scratch store and scratch projects folder, with the stub assembly tool configured to fail first; confirm `GET /health`.
- [ ] 10.2 Prepare a session with all scenes `chunk-complete`, real clip files and an MP3. Record their hashes and the folder listing. Trigger assembly and wait for the cycle to fail. Then check:
  - `curl GET /sessions/:id` shows `failed`, `failedPhase: "assembly"` and the cause;
  - the folder listing and the hashes are unchanged.
- [ ] 10.3 Set the tool to succeed, then:
  - `curl -X POST /sessions/:id/assembly/retry` → 200;
  - the session reaches `final-video`;
  - the folder gained only `final-video.mp4`;
  - the hashes are unchanged;
  - `GET /sessions/:id/download/final-video` serves it.
- [ ] 10.4 Error cases, each with `curl`:
  - the retry again → 409 `final-video-already-generated`;
  - an unknown id → 404;
  - a body → 400;
  - a paused failed session → 200 `{ held: true }`, then `POST /continue` runs assembly once.

  `curl GET /docs/json` documents the route.
- [ ] 10.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/retry-final-assembly/reports/YYYY-MM-DD-step-10-manual-endpoint-testing.md`.

## 11. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 Decide applicability: a new failure display and button on the session page, so it applies.
- [ ] 11.2 Run backend (scratch store, stub tool failing first) and frontend. Open the session after assembly fails: the Final video section shows `Failed`, the cause and `Retry final video`, and no download.
- [ ] 11.3 Set the tool to succeed and click `Retry final video`. The section moves to `In progress`, then `Complete`, with the download shown, all without a reload. The scene rows are unchanged throughout.
- [ ] 11.4 Restore the environment and save `openspec/changes/retry-final-assembly/reports/YYYY-MM-DD-step-11-e2e.md`.

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the changes are the route and the `assembly` failure phase.
- [ ] 12.2 `docs/data-model.md`: add `assembly` to `runs.failure.phase`, and record that `final-video.mp4` is placed only on success and never replaced.
- [ ] 12.3 `docs/backend-standards.md`: record the assembly launcher, the temp-then-move output rule for generated artefacts written by a local tool, and the boot step for unrecorded assembly failures.
- [ ] 12.4 `docs/frontend-standards.md`: add `Retry final video` to the naming table.

## 13. Close out

- [ ] 13.1 Ask the user before commenting on JOS-168 that its open question (who derives `failedPhase: "assembly"`) is answered here, and on JOS-185 that the assembly launcher and failure recording are where the assembly time limit plugs in.
- [ ] 13.2 Ask before pushing. Open the PR against `feature/entrega-2-JAME`, or against JOS-168's branch if it is still open, with a description linking to JOS-159.
- [ ] 13.3 Obtain review by at least one human, not only AI agents.
- [ ] 13.4 Archive the OpenSpec change after merge.
