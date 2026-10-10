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

- [x] 2.1 Wrote failing tests in a new `assembly-failure-recovery.test.ts`. Each of the following records `{ phase: "assembly", cause, retryable, manualRetryAvailable: true, cycle, attemptsInCycle, occurredAt }` and makes the session derive `failed` with `failedPhase: "assembly"`: an exhausted cycle; a not-retryable failure; no tool configured, with the tool never called; no voice-over, with the tool never called. (A missing clip file is covered by its own test, but not as a pre-check — see 2.3's note.) Also: a later success clears it, and the cause contains no absolute path. Every `readySession(...)`/fixture call had to set the assembly tool **before** bringing scenes to `chunk-complete` (the last scene completing auto-triggers assembly, racing a `setAssemblyTool` call made afterward) — the same ordering `assembly-phase.test.ts`'s own fixtures already use.
- [x] 2.2 The exact test task 2.2 asks for already existed in `phase-progress.test.ts` ("carries the failure on an assembly entry given an assembly failure") — `derivePhaseProgress` is already fully generic over `SessionFailure["phase"]` and needed no change. Added one assertion to it confirming the earlier three phases are `complete`.
- [x] 2.3 Added `AssemblyFailure` to `SessionFailure` (`types.ts`). Recorded the failure in `runAssemblyAttempt`'s three outcome paths (exhausted, not-retryable, and the restart-settle path in `settleAssemblyInFlight` for a cycle's last attempt interrupted by a restart — a gap task 1.1 found) and its two pre-checks (no tool, no voice-over). Extended `deriveSessionState`'s gate-open branch. Makes 2.1-2.2 pass.

  **Found during implementation, corrected in design.md Decision 1**: dropped the originally-planned third pre-check (`existsSync` on each scene's clip file before calling the tool) — it broke several already-passing tests elsewhere in the suite (`repeated-confirmations.test.ts` and others) that complete a scene's clip at the store level only, with no real file, by design — the exact tension `retry-or-correct-image` (JOS-157) hit with its own `.strict()` schema. A missing/unreadable clip file now surfaces through the ordinary attempt path (the real adapter throws, the generic catch classifies it transient) instead of a special zero-attempt case.

## 3. Backend: output only on success (TDD; design Decision 2)

- [x] 3.1 Wrote failing tests (a `fileWritingStub` helper that actually writes bytes to `outputPath`, since the project's `createStubAssemblyTool` doesn't, by design — a real adapter is what writes bytes): a failed attempt that wrote a partial output leaves the project folder listing unchanged; a successful attempt adds exactly `final-video.mp4`; a pre-existing readable `final-video.mp4` with no recorded path is adopted, not overwritten, and the tool is never called; an existing final video is never replaced by a further launch attempt.
- [x] 3.2 Passed a per-attempt temporary `outputPath` to the tool (`mkdtempSync(join(PROJECTS_ROOT, ".assembly-tmp-"))`, not `os.tmpdir()` — design.md Decision 2's "Found during implementation" note drops the cross-device copy fallback as unneeded for this app's single-root layout); moved it into the project folder on success without replacing a file (`moveAssemblyOutput`, `db.ts`, mirrors `writeArtefactOnce`'s `linkSync`+EEXIST idiom); removed the temp directory on every outcome. Makes 3.1 pass.

## 4. Backend: launcher, retry service and derived state (TDD; design Decisions 3-5)

- [x] 4.1 `assembly` having a registered launcher off `NOT_YET_LAUNCHABLE` and a first assembly held by a pause running exactly once on continue were already covered by pre-existing JOS-160 tests (`assembly-launch.test.ts`'s "assembly launcher resumes held assembly work" describe block) — confirmed still passing, no new test needed for those two. Added the third bullet, a held *retry* counted as one held unit and run once on continue, to the new `assembly-retry.test.ts` instead of `launch-gate.test.ts` (it needs `retryAssembly`, group 4's own new code, so it belongs with that file's other new tests).
- [x] 4.2 Wrote failing tests in a new `assembly-retry.test.ts` for `retryAssembly`: an unknown session; each 409 reason, with the tool never called; concurrent calls (one accepted, the other refused); acceptance after a retryable failure and after a not-retryable one; a new cycle allows its own full `1 + RETRY_BUDGET` attempts.
- [x] 4.3 Wrote failing tests (same file): an accepted retry derives `final-video-generating`, with the assembly phase `in-progress` and no `failure`, while held (paused) and while running. A retry that fails again derives `failed` with the new cause.
- [x] 4.4 Wrote failing tests in `restart-assembly.test.ts` ("Boot migration" describe block) for the migration step: a session with a budget-exhausted or not-retryable last `assembly` attempt, no final video and no recorded failure gets its failure recorded at boot, once (a second boot is a no-op); a session with no attempts, or whose final video is already recorded, is untouched.
- [x] 4.5 Implemented `backend/src/assemblyRetry.ts` (`retryAssembly`), `beginAssemblyRetry` (`db.ts`, the one atomic claim), the assembly row of the retry-rule table (done in group 2's commit), and `recordMissingAssemblyFailuresOnBoot` (`orchestrator.ts`, called from `recoverOnBoot` right after `settleAllInFlight`). Makes 4.1-4.4 pass.

  **Found during implementation, corrected in design.md Decision 3**: `startNewCycle` (the generic manual-retry primitive decomposition/voice-over use) cannot represent assembly's two pre-attempt failures (no tool, no voice-over — zero `stage_attempts` rows), so it was dropped in favour of a small custom claim. There is no separate `retry-already-pending` refusal reason either — the whole `retryAssembly` function has no `await`, so a losing concurrent call always lands on the same, accurate `not-failed-in-assembly`.

  **Found during implementation, corrected in design.md Decision 3**: a retried attempt needs an *explicit* `cycle` (`(latest?.cycle ?? 0) + 1`, passed only when `attemptNumber === 1`) — without it, `recordStageAttempt`'s default (`MAX(cycle)`, i.e. the same, already-exhausted cycle) overflows the table's `sequence_in_cycle BETWEEN 1 AND 4` `CHECK` constraint on the very next retried attempt. Caught by `assembly-retry.test.ts`'s "a new cycle allows four attempts" test throwing instead of failing an assertion.

  **Found during implementation**: the migration boot step must skip a `transient` latest attempt whose budget is **not** yet spent (`sequenceInCycle < 1 + RETRY_BUDGET`) — that is a cycle genuinely still in progress (interrupted by the very restart calling this step, with no failure yet because `settleAssemblyInFlight` only records one on exhaustion); recording a failure for it would incorrectly block the relaunch pass that continues it (Decision 4's `blockedByFailure` guard). Caught by a regression in `restart-assembly.test.ts`'s pre-existing "is launched once as the next attempt" test.

  As a consequence of these two cycle-number findings, `runAssemblyAttempt`'s now-unused `claimedAttempt` parameter (from Decision 3's original `startNewCycle`-based plan) was removed along with its in-flight-guard exclusion and its stale doc comment.

## 5. Backend: components untouched (TDD; design Decision 6)

- [x] 5.1 Wrote a failing test in `assembly-failure-recovery.test.ts` (Group 5 describe block), spanning a failed first run, a failed retry (via `retryAssembly`, now that group 4 exists) and a successful retry: the tracked video provider's `.calls` stays empty throughout (the voice and image stages are never even reached in this fixture, so there is nothing to call); the voice-over MP3's and every scene's image bytes are unchanged (read from disk before and after); `getScenesForRun`/`getVoiceOver` (the `scenes`/`voice_overs` rows) are unchanged; the tool (a capturing stub on the successful retry) receives the clips in scene order with their stored `narrationStartSeconds`/duration.
- [x] 5.2 Passed without any further change — satisfied entirely by Decision 6 (assembly only ever reads `getVoiceOver`/`getScenesForRun`/their files, never writes to them) and Decision 3's retry reusing the same `runAssemblyAttempt` code path as a first run. No gap found.

## 6. Backend: route (TDD; design Decision 3)

- [x] 6.1 Wrote failing tests in `session-api-surface.test.ts` (new "POST /sessions/:sessionId/assembly/retry" describe block, mirroring the decomposition one): 200 `{ ok: true, held: true }` on a paused, failed session, and also for a not-retryable failure (design Decision 7 — assembly always offers a retry, so there is no `not-retryable` 409 reason here, unlike decomposition); 404 for an unknown and a malformed session id; 409 for each of the three reasons (`not-failed-in-assembly`, `scenes-not-complete`, `final-video-already-generated` — the latter two reconstructed directly, same as the unit tests, since a real failed session can't naturally reach them); 400 for a body naming any field, with the session's failure left untouched; documented in `/docs/json`.
- [x] 6.2 Added the route (`routes.ts`, right after the decomposition retry route) reusing `looseSessionParamsSchema`/`emptyBodySchema`/`retryAcceptedSchema`/`conflictSchema` verbatim — no new schema needed, since `AssemblyRetryRefusal` is already a plain string union the existing `conflictSchema` accepts. Makes 6.1 pass.

## 7. Frontend: retry action (TDD; design Decision 7)

- [x] 7.1 Wrote failing tests in `test/components.test.tsx`: `phaseActions` returns retry for a failed assembly phase whatever `retryable` is, and nothing otherwise (new "Final video section offers a retry" describe block, plus extended the two existing `phaseActions` tests covering the blanket "nothing for any other phase" case, which assembly's new retry makes partly false); the Final video section shows the cause, `Retry final video` and no download link when failed, for both a retryable and a not-retryable failure; a click calls `onRetryPhase("assembly")` and disables the button until the promise settles; each of the three 409 reasons shows its sentence, and an unknown one shows the generic sentence.
- [x] 7.2 Implemented `retryAssembly` in `api/client.ts` (mirrors `retryDecomposition`), the `"assembly"` branch of `phaseActions` (`retry: true` whenever `status === "failed"`, independent of `retryable` — Decision 7), three new entries in `retryRefusals.ts`'s sentence table, and wired `App.tsx`'s `onRetryPhase` to call it for the `"assembly"` phase. No change needed to `PhaseSection`/`PhaseRetryButton`/`SessionPage` — Decision 7's whole point is that they are already phase-generic (`onRetry={() => onRetryPhase(progress.phase)}`), so the button and its refusal handling appeared automatically once `phaseActions` and `onRetryPhase` covered assembly. Makes 7.1 pass.

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [x] 8.1 Reviewed `assembly-persistence.test.ts` and `assembly-launch.test.ts` (JOS-149), `launch-gate.test.ts` (JOS-152, `NOT_YET_LAUNCHABLE`'s contents and `registerStageLauncher`'s own removal of a stage from it), and `phase-progress.test.ts` (JOS-168) — none carried an assumption this change breaks (the "no tool: nothing recorded" comments live in *this* change's own test files, already fixed in groups 2-4's commits, not in these pre-existing ones). No updates needed beyond what groups 2-6 already made.
- [x] 8.2 Every scenario in `specs/assembly-failure-recovery/spec.md` has at least one test (mapping below); AC1-AC3 mapped. Also found and corrected two stale spec.md statements left over from the original design (a clip-file pre-check and a separate `retry-already-pending` reason, both dropped during implementation — see design.md's "found during implementation" notes) and the matching lines in `proposal.md`. Full mapping recorded in the step 9 report (9.5).
- [x] 8.3 Compared backend coverage of `db.ts`, `orchestrator.ts`, `routes.ts` (plus the new `assemblyRetry.ts`) against the propose commit (`cba78c3`, a disposable detached worktree, `@vitest/coverage-v8` installed with `--no-save`): `orchestrator.ts` 88.55% → 89.84%, `routes.ts` 74.56% → 75.42%, `db.ts` 98.16% → 98.11% (two new lines this change added — `moveAssemblyOutput`'s `EEXIST` branch and `isReadableMp4`'s catch branch — were briefly uncovered; added two direct unit tests for them in `assembly-failure-recovery.test.ts`, closing the gap). No module decreased in any way that isn't fully accounted for.

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 9.1 Captured the pre-test baseline: every data table at 0 rows, `schema_migrations` at 14, 17 triggers, `data/projects/` empty (one leftover empty directory from earlier ad-hoc runs this session was found and removed to reach this baseline).
- [x] 9.2 Ran the targeted tests: 163/163 pass.
- [x] 9.3 `npm run typecheck` clean in both. Full `npm test`: backend and frontend pass (one pre-existing, unrelated flake under full-suite load — see report). Reran the full backend+frontend suite in a fresh, disposable detached worktree with no `.secrets.json` — identical results. No automated ffmpeg-adapter test exists in this codebase to run (a pre-existing gap from JOS-149, out of scope — flagged to the user in the report).
- [x] 9.4 Post-test state matched the baseline except two test runs' leftover rows/folders (from manually re-running one flaky test file in isolation); restored with `resetAll()` and removing the leftover project folder.
- [x] 9.5 Report created: `openspec/changes/retry-final-assembly/reports/2026-10-09-step-9-unit-test-and-db-verification.md`.
- [x] 9.6 Tests pass and the report exists.

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Started the real server on a scratch store/projects folder (`ALLOW_TEST_ENDPOINTS=1`, `USE_STUB_VIDEO_PROVIDER=success-bytes`, `USE_STUB_ASSEMBLY_TOOL=not-retryable-failure`); `GET /health` → 200.
- [x] 10.2 Drove a session to `chunk-complete` via the existing `quick-voice-over`/`quick-scene` test-only routes (JOS-146). `GET /sessions/:id` showed `failed`/`failedPhase: "assembly"` with the cause; the folder listing (`scene-0.png`, `scene-0.mp4`, `voice-over.mp3`) and hashes were unchanged, including across a server restart before retrying.
- [x] 10.3 Set the tool to succeed: retry → 200, session reached `final-video`. Found and documented a real limitation of the plain stub (never writes bytes, so no `final-video.mp4` ever appears and the download 404s correctly) — exercised the real ffmpeg adapter directly instead (no automated test exists for it — step 9) with real generated clip/audio files, confirming the temp-then-move path, `isReadableMp4` and the `EEXIST` refusal all work correctly with real bytes.
- [x] 10.4 All four error cases checked: retry-again → 409 `not-failed-in-assembly` (the accurate reason once a retry succeeds and clears the failure — not a separate `final-video-already-generated`, matching Decision 3's documented check order); unknown id → 404; a body → 400; a paused failed session → 200 `{held:true}`. `GET /docs/json` documents the route. **Found and fixed a real bug** manually testing the paused case: restarting the server between an accepted-but-held retry and `continue` caused the boot migration step to re-record the old failure, undoing the accepted retry — fixed in a separate commit (`d8f548d`) with a new regression test; re-verified via curl after the fix.
- [x] 10.5 Scratch stores and project folders removed; the default store confirmed untouched (0 rows, empty `data/projects/`) throughout. Report: `openspec/changes/retry-final-assembly/reports/2026-10-09-step-10-manual-endpoint-testing.md`.

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
