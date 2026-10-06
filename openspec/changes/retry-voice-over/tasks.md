# Tasks — Manually retry a failed voice-over (JOS-155, US-23)

Every code change starts with a failing test (TDD), and every scenario in `specs/voice-over-manual-retry/spec.md` has at least one test. Tests use the stubbed voice provider from JOS-136; no test calls the real provider. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-155-retry-voice-over` from `feature/jos-168-view-progress-by-phase`. It is stacked because the retry button lives in JOS-168's phase sections. No upstream is set.
- [x] 0.2 Verify the branch was created and is the current branch.

## 1. Gate (hard: no code before every item passes)

- [x] 1.1 `git fetch`. Confirm `generate-voice-over` (JOS-136) groups 4-6 are merged into `feature/entrega-2-JAME`:
  - the `VoiceProvider` port, the stub and the real adapter;
  - the voice-over phase launched through the gate;
  - `voice-over-generating` derived from the records;
  - `voice-over` removed from `NOT_YET_LAUNCHABLE`;
  - `failure` on the session read.

  Record the function names for "launch the voice-over phase" and "resolve the adapter for a bound id".

  Recorded (PR #26 merged, `bc418ab`): launch is `voiceOverLauncher.launch` / `launchVoiceOverFor` / `generateVoiceOver` (first attempt) and `sendVoiceAttempt` (any attempt) in `voiceOverPhase.ts`. The adapter for a bound id is `getVoiceProviderRegistry().adapters[attempt.providerId ?? run.voiceProviderId ?? defaultIdentifier]`. `voice-over` is registered with the gate, `voice-over-generating` is derived in `deriveSessionState`, and `failure` is on the session read.
- [x] 1.2 Confirm `bounded-retry-policy` (JOS-184) is merged. Record:
  - `startNewCycle`'s actual name, signature and refusal result;
  - how a scheduled (not yet sent) attempt is represented;
  - how the voice-over launcher's `heldWork` sees it.

  If any differs from design Decisions 2 and 7, update design.md and the spec first.

  Recorded (PR #27 merged through JOS-136): `startNewCycle(ref: { sessionId, sceneId?, stage }, options?)` in `retry/stageAttemptRecorder.ts` returns `{ started: true, attempt }` or `{ started: false, reason: "not-failed" | "not-retryable" }`. A scheduled attempt is a `stage_attempts` row with `outcome = "scheduled"` and `due_at`. `voiceOverLauncher.heldWork` counts 1 when there is no failure, voice-over, chunks or in-flight attempt, which a scheduled manual attempt satisfies. Three differences from the first draft, all folded into design Decisions 2, 3, 4 and 7, the spec and these tasks: `startNewCycle` refuses a not-retryable failure; it clears the session failure, so the retry needs `voiceAttemptInFlight` to count scheduled attempts; no failure exists before a first attempt, so the `voice-provider-not-bound` reason and the failed-before-first-attempt scenario are removed.
- [x] 1.3 Confirm `view-progress-by-phase` (JOS-168) is implemented: `phases`, the retry-in-flight rule, `PhaseSection` and `phaseActions`. Rebase this branch onto the latest of JOS-168's branch, or onto `feature/entrega-2-JAME` once JOS-168 has merged.

  Recorded: JOS-168 merged (PR #28). The branch was rebased onto `origin/feature/entrega-2-JAME` (`bc418ab`). `phases`, `retryInFlight`, `PhaseSection` and `phaseActions` (`{ retry: boolean }`, currently always false) are in place.
- [x] 1.4 Ask the product owner design Open Question 1 (manual retry after a not-retryable failure). Answer: no, follow JOS-184. Decision 3, the spec's first and last requirements, the proposal and these tasks are updated.

## 2. Backend: retry service checks (TDD; design Decisions 2 and 4)

- [x] 2.1 Write failing tests in a new `backend/test/voice-over-retry.test.ts` for `retryVoiceOver(sessionId)`:
  - an unknown session is refused as not found;
  - each refusal reason (`not-failed-in-voice-over`, `narration-complete`, `not-retryable`, `retry-already-pending`), with the stub asserting that no request was received;
  - two concurrent calls open exactly one cycle.
- [x] 2.2 Write failing tests for acceptance after an exhausted cycle (a retryable failure), and that no cycle is opened for a not-retryable one.
- [x] 2.3 Implement `backend/src/voiceOverRetry.ts` with the checks in Decision 2's order, then `startNewCycle`, then the gate; make 2.1-2.2 pass.

## 3. Backend: same script, same provider, nothing deleted (TDD; design Decisions 4-6)

- [ ] 3.1 Write a failing test: the stub receives, on the retry, text byte-identical to the stored script and to the first attempt's text; the stored script, title and language are unchanged.
- [ ] 3.2 Write a failing test: a session bound to provider A, with the registry's default set to B, is retried and the request goes to A, and the binding stays A. Write a second test: a bound id with no adapter fails as not retryable, with no request sent and no credential in the cause.
- [ ] 3.3 Write failing tests that snapshot the project folder listing (with file hashes) and the session's `runs`, `stage_attempts` and `voice_overs` rows, then:
  - after a failed retry, everything earlier is unchanged except `runs.failure`;
  - after a successful retry, one MP3 is added and nothing earlier is removed.
- [ ] 3.4 Make 3.1-3.3 pass. Expect most to pass through JOS-136's phase. Fix any gap in the phase, not in the retry service.

## 4. Backend: cycles, pause and derived state (TDD; design Decision 7)

- [ ] 4.1 Write a failing test: a retried session whose next four attempts fail transiently is `failed` again after the fourth, with all eight attempts recorded across two cycles.
- [ ] 4.2 Write failing tests for a retry during a pause:
  - it is accepted with `held: true` and sends nothing;
  - the voice-over phase has `heldCount` 1;
  - continue sends exactly one request.
- [ ] 4.3 Write failing tests in `phase-progress.test.ts`: an accepted retry derives `voice-over-generating` while scheduled, held, or in flight, with the voice-over phase `in-progress` and no `failure`. JOS-168's existing in-flight tests must still pass.
- [ ] 4.4 Make `voiceAttemptInFlight` count a `scheduled` or `in-flight` `voice-over` attempt, since `startNewCycle` clears the failure (design Decision 7). Confirm the voice-over launcher's `heldWork` already counts a held manual attempt, with a test. Make 4.1-4.3 pass.

## 5. Backend: route (TDD; design Decision 1)

- [ ] 5.1 Write failing tests in `session-api-surface.test.ts` for `POST /sessions/:sessionId/voice-over/retry`:
  - 200 `{ ok: true, held }`;
  - 404 for an unknown session and for a malformed id;
  - 409 `{ ok: false, reason }` for each reason;
  - 400 for any body field;
  - the route is in `/docs/json` with its responses.
- [ ] 5.2 Add the route and Zod schemas (params, strict empty body, 200/404/409 responses) in `routes.ts`; make 5.1 pass.

## 6. Frontend: retry action (TDD; design Decision 8)

- [ ] 6.1 Write failing tests in `test/components.test.tsx`:
  - `phaseActions` returns retry for a failed voice-over phase only when `retryable` is true, and nothing for any other status or phase;
  - the Voice-over section shows `Retry voice-over` only when failed;
  - a click calls `retryVoiceOver`, and the button is disabled until the answer;
  - a 409 reason is shown as its sentence and the button is enabled again;
  - no state change happens on the page before a snapshot arrives.
- [ ] 6.2 Implement `retryVoiceOver` in `api/client.ts`, the action in `phaseActions.ts`, and the button, pending state and refusal text in `PhaseSection.tsx`, with one reason-to-sentence table; make 6.1 pass.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review the tests from JOS-136 (voice-over phase), JOS-184 (cycles), JOS-152 (held work) and JOS-168 (phase actions return nothing for voice-over) for assumptions this change breaks; update them. In particular, JOS-168's "`phaseActions` returns no action for every phase" now has a voice-over exception.
- [ ] 7.2 Confirm every scenario in `specs/voice-over-manual-retry/spec.md` has at least one test, and map ticket AC1-AC3 to tests; list both in the step 8 report.
- [ ] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the default store: row counts per table (`runs`, `stage_attempts`, `voice_overs`), applied migrations, trigger list, and `data/projects/` contents.
- [ ] 8.2 Run the targeted tests: `voice-over-retry`, `phase-progress`, `session-api-surface`, `components`.
- [ ] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`, so local credentials cannot mask a provider-dependent failure.
- [ ] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 8.5 Create the report `openspec/changes/retry-voice-over/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch store and scratch projects folder, with the stub voice provider configured to fail not-retryably first; confirm `GET /health`.
- [ ] 9.2 `POST /sessions` and wait for `failed` in voice-over. List the project folder. Then:
  - set the stub to succeed;
  - `curl -X POST /sessions/:id/voice-over/retry` → 200 `{ ok: true, held: false }`;
  - `curl GET /sessions/:id` reaches `voice-over-complete`;
  - the folder has gained one MP3 and lost nothing.
- [ ] 9.3 Error cases, each with `curl`:
  - the retry again on the completed session → 409;
  - an unknown id → 404;
  - a body `{"script":"x"}` → 400;
  - a paused failed session → 200 `{ held: true }`, and then `POST /continue` sends it.
- [ ] 9.4 `curl GET /docs/json` documents the route.
- [ ] 9.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/retry-voice-over/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: a new button and flow on the session page, so it applies.
- [ ] 10.2 Run backend (scratch store, stub voice failing first) and frontend. Open the failed session: the Voice-over phase section shows `Failed`, the cause and `Retry voice-over`.
- [ ] 10.3 Set the stub to succeed and click `Retry voice-over`. The section moves to `In progress`, then `Complete`, without a reload, and the button disappears.
- [ ] 10.4 On a second failed session, pause, then retry. The section shows `In progress` with `Waiting for you to continue (1 held)`. Continue, and it completes.
- [ ] 10.5 Restore the environment and save `openspec/changes/retry-voice-over/reports/YYYY-MM-DD-step-10-e2e.md`.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only change is the new route.
- [ ] 11.2 `docs/data-model.md`: record that a manual voice retry adds a cycle and attempts and deletes nothing, and that the pending retry is JOS-184's scheduled attempt (no new table).
- [ ] 11.3 `docs/backend-standards.md`: record the per-phase retry route pattern (`POST /sessions/:sessionId/<phase>/retry`, strict empty body, 200/404/409 with a reason code), all checks before any send, for US-24 to US-27 to follow.
- [ ] 11.4 `docs/frontend-standards.md`: add `Retry voice-over` to the naming table, and record the reason-to-sentence table for retry refusals.

## 12. Close out

- [ ] 12.1 Ask the user before commenting on the US-24 to US-27 tickets that the route pattern and the `phaseActions` extension point are ready to follow.
- [ ] 12.2 Ask before pushing. Open the PR with a description linking to JOS-155. Target `feature/jos-168-view-progress-by-phase` while JOS-168's PR is open, then retarget to `feature/entrega-2-JAME`, or open the follow-up PR there, so the work reaches the integration branch.
- [ ] 12.3 Obtain review by at least one human, not only AI agents.
- [ ] 12.4 Archive the OpenSpec change after merge.
