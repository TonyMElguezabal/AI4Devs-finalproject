# Tasks — Manually retry a failed decomposition (JOS-156, US-24)

Every code change starts with a failing test (TDD), and every scenario in `specs/decomposition-manual-retry/spec.md` has at least one test. A stored voice-over, timestamps and failures are created through the store, as the existing decomposition tests do. Providers are the stubs (alignment, reasoning, and a voice stub that must receive nothing). Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-156-retry-decomposition` from `feature/jos-168-view-progress-by-phase`. It was stacked because the retry button lives in JOS-168's phase sections; it has since been rebased onto `feature/entrega-2-JAME` (task 1.2). No upstream is set.
- [x] 0.2 Verify the branch was created and is the current branch.

## 1. Gate (no code before every item passes)

- [x] 1.1 `git fetch`. Confirm `bounded-retry-policy` (JOS-184) is merged. Record:
  - `startNewCycle`'s name and signature;
  - its stage-instance key for the decomposition phase (one instance shared by `timestamps` and `decomposition`, or two);
  - how a scheduled attempt is represented.

  If any differs from design Decisions 2, 4 and 5, update design.md and the spec first.

  Recorded: `startNewCycle(ref: { sessionId, sceneId?, stage }, options?)` in `retry/stageAttemptRecorder.ts` returns `{ started: true, attempt }` or `{ started: false, reason: "not-failed" | "not-retryable" }`. The stage instance key is `<session>:<stage>`, except that `timestamps` maps to the `decomposition` instance (both steps share one instance and one four-attempt bound). A scheduled attempt is a `stage_attempts` row with `outcome = "scheduled"` and `due_at`; `releaseAttempt` claims it and calls the sender registered for its stage. Differences from the first draft, folded into design Decisions 2-7: it refuses a not-retryable failure; it clears the session failure; `AttemptStage` has `timestamps` but **no `decomposition` stage**, and the division step records no attempt; the timestamps step records its own attempt instead of claiming a scheduled one; nothing configures the alignment provider or instruction generator at runtime.
- [x] 1.2 Confirm `view-progress-by-phase` (JOS-168) is implemented, then rebase onto it, or onto `feature/entrega-2-JAME` once it has merged. Then check:
  - whether `retry-voice-over` (JOS-155) or `see-provider-and-attempts` (JOS-166) have merged; if so, reuse their route schemas, reason table, retry button and retry-rule table instead of adding parallel ones;
  - whether JOS-136 or anything else already registers a `decomposition` launcher.

  Record the results.

  Recorded: JOS-168 is merged (PR #28); the branch was rebased onto `origin/feature/entrega-2-JAME` (`1d04777`). JOS-155 merged only its service (`voiceOverRetry.ts`): no route schemas, reason table, button or rule change exist to reuse yet. JOS-166 is not built. Only the voice-over, image, video and assembly launchers are registered; none for `decomposition`.
- [x] 1.3 Use the product owner's answer to JOS-155 Open Question 1 (manual retry after a not-retryable failure). Answer: no, follow JOS-184. Decision 7, the spec and `phaseActions` are updated.
- [x] 1.4 With the user's approval, update the umbrella change `decompose-script-into-chunks`. Replace its two manual-retry requirements ("A manual retry of timestamps stays on the same audio…" and "A manual retry of decomposition re-splits the same script") with a pointer to this change, so the requirement lives in one place.

## 2. Backend: attempts, senders and providers for the two steps (TDD; design Decisions 3 and 4)

- [x] 2.1 Write failing tests for the division step's attempts:
  - a division that fails retryably records one `decomposition` attempt as `transient`, and the failure names cycle 1 and one attempt;
  - a not-retryable failure records `not-retryable`, and a registered decomposition records `success`;
  - the attempt exists in flight before the instruction generator is called;
  - a failure raised through a claimed attempt of cycle 2 names cycle 2.
- [x] 2.2 Write failing tests for the claimed-attempt path of both steps: `obtainNarrationTimestamps` and `segmentStoredTimestamps` given a claimed attempt complete it and record no second one; called without, they behave as today.
- [x] 2.3 Write failing tests for `decompositionDependencies.ts` (`get`/`set`/`reset`, defaults are the real factories) and for the two attempt senders: releasing a scheduled `timestamps` or `decomposition` attempt runs that step with the configured providers on the claimed attempt, and a successful timestamps retry goes on to divide.
- [x] 2.4 Add `decomposition` to `AttemptStage`, record the division attempts, accept a claimed attempt in both steps, add `decompositionDependencies.ts`, and register the two senders. Make 2.1-2.3 pass. The existing decomposition tests must still pass.

## 3. Backend: retry service checks and step choice (TDD; design Decisions 1, 2 and 7)

- [x] 3.1 Write failing tests in a new `backend/test/decomposition-retry.test.ts` for `retryDecomposition(sessionId)`:
  - unknown session;
  - each 409 reason, with every provider stub asserting it received nothing;
  - concurrent calls open exactly one cycle;
  - acceptance after a retryable failure, and refusal with `not-retryable` after a not-retryable one.
- [x] 3.2 Write failing tests for the step choice: no stored timestamps schedules an attempt of stage `timestamps`; stored timestamps schedule one of stage `decomposition`; both are in cycle 2 of the shared instance.
- [x] 3.3 Implement `backend/src/decompositionRetry.ts`: the checks, the step choice, `startNewCycle`, then the gate. Make 3.1-3.2 pass.

## 4. Backend: the two steps and the voice-over (TDD; design Decision 4)

- [x] 4.1 Write failing tests for the timestamps step through the retry:
  - after a failed alignment (the step records no automatic retries, so one failed attempt ends the cycle), the retry obtains the timestamps from the same MP3 and registers the chunks;
  - after `native-unusable`, the retry goes straight to the alignment stub, and the native file is not read (the file is made usable between the attempts, so reading it would show as a native mechanism).
- [x] 4.2 Write failing tests for the division step through the retry:
  - after an instruction failure, the same script is divided from the same timestamps;
  - no `timestamps` attempt is added, and the new `decomposition` attempt is in cycle 2 beside the first;
  - the chunks' `PROMPT`s reconstruct the stored script;
  - the session reaches `chunks-processing`;
  - the script, title and language are unchanged.
- [x] 4.3 Write failing tests for AC3: for both steps, and for both a successful and a failed retry, the voice stub receives nothing, and the MP3 hash, the `voice_overs` row and the native timestamps file are unchanged.
- [x] 4.4 Make 4.1-4.3 pass. Expect them to pass through the senders of group 2. Fix any gap in the steps or senders, not in the retry service.

## 5. Backend: launcher, pause and derived state (TDD; design Decisions 5 and 6)

- [x] 5.1 Write failing tests in `decomposition-retry.test.ts` (`launch-gate.test.ts` resets the launcher registry, so it cannot see this registration):
  - the `decomposition` stage has a registered launcher and is no longer in `NOT_YET_LAUNCHABLE`;
  - a paused retry is counted as one held decomposition unit;
  - continue launches it exactly once.
- [x] 5.2 Write tests in `decomposition-retry.test.ts` (they need the store; `phase-progress.test.ts` is pure derivation and is unchanged and still passing). They pin the derivation, so they pass before 5.3 by design (Decision 6):
  - an accepted retry derives `chunk-decomposing` while scheduled, held or in flight, on either step;
  - a retry whose cycle fails derives `failed` with the new cause;
  - JOS-168's and JOS-155's existing rule tests still pass.
- [x] 5.3 Register the decomposition launcher (`heldWork`, `launch`), leaving a documented hook for JOS-136's "after the narration" term. No derived-state rule is added (design Decision 6). Make 5.1-5.2 pass.

- [x] 5.4 Write a failing test in `decomposition-retry.test.ts`: with a subscriber on the state events, an accepted retry on a paused session (`held: true`) and on an unpaused one each publish a snapshot with the decomposition phase `in-progress` and no failure before the command returns. Then publish the session state at the end of `retryDecomposition` (design Decision 2, step 9) and make it pass.

## 6. Backend: route (TDD; design Decision 1)

- [x] 6.1 Write failing tests in `session-api-surface.test.ts` for `POST /sessions/:sessionId/decomposition/retry`:
  - 200 `{ ok: true, held }`;
  - 404 for an unknown session and for a malformed id;
  - 409 `{ ok: false, reason }` for each reason;
  - 400 for any body field;
  - the route is in `/docs/json`.
- [x] 6.2 Add the route and its Zod schemas in `routes.ts`, reusing the retry-route schemas if JOS-155 has merged; make 6.1 pass.

## 7. Frontend: retry action (TDD; design Decision 8)

- [x] 7.1 Write failing tests in `test/components.test.tsx`:
  - `phaseActions` returns retry for a failed decomposition phase, only when `retryable` is true, and nothing otherwise;
  - the Decomposition section shows `Retry decomposition` only when failed and retryable;
  - a click calls `retryDecomposition` and disables the button until the answer;
  - a 409 reason is shown as its sentence;
  - nothing changes before a snapshot arrives.
- [x] 7.2 Implement `retryDecomposition` in `api/client.ts`, the action in `phaseActions.ts`, and the button in `PhaseSection.tsx` through the shared retry-button component, extracting it if JOS-155 has not; make 7.1 pass.

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [x] 8.1 Review the tests from JOS-139, JOS-140 and JOS-144 (decomposition phase), JOS-152 (launch gate and `NOT_YET_LAUNCHABLE` contents), JOS-168 and JOS-155 (phase actions, retry rule) for assumptions this change breaks; update them.
- [x] 8.2 Confirm every scenario in `specs/decomposition-manual-retry/spec.md` has at least one test, and map ticket AC1-AC3 to tests; list both in the step 8 report.
- [x] 8.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline of the default store: row counts per table (`runs`, `stage_attempts`, `voice_overs`, `narration_timestamps`, `scenes`), applied migrations, trigger list, and `data/projects/` contents.
- [x] 9.2 Run the targeted tests: the group 2 attempt and sender tests, the existing decomposition-phase and timestamps tests, `decomposition-retry`, `launch-gate`, `phase-progress`, `session-api-surface`, `components`.
- [x] 9.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`, so local provider credentials cannot mask a failure.
- [x] 9.4 Verify the post-test state matches the baseline; restore it if not.
- [x] 9.5 Create the report `openspec/changes/retry-decomposition/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [x] 9.6 Mark this step complete only after the tests pass and the report file exists.

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Start the real server on a scratch store and scratch projects folder, with stub alignment and reasoning providers; confirm `GET /health`.
- [x] 10.2 Prepare a session with a stored MP3 and a failed alignment, and record the MP3's hash. Then:
  - `curl -X POST /sessions/:id/decomposition/retry` → 200;
  - `curl GET /sessions/:id` reaches `chunks-processing`;
  - the MP3 hash is unchanged.
- [x] 10.3 Prepare a session with stored timestamps and a failed instruction request. Then:
  - retry → 200;
  - chunks registered;
  - no new `timestamps` attempt row.
- [x] 10.4 Error cases, each with `curl`:
  - the retry again on a session with chunks → 409;
  - an unknown id → 404;
  - a body `{"script":"x"}` → 400;
  - a paused failed session → 200 `{ held: true }`, then `POST /continue` runs it.

  `curl GET /docs/json` documents the route.
- [x] 10.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/retry-decomposition/reports/2026-10-04-step-9-manual-endpoint-testing.md`.

## 11. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 Decide applicability: a new button and flow on the session page, so it applies.
- [ ] 11.2 Run backend (scratch store, stub providers) and frontend. Open a session failed in decomposition: the section shows `Failed`, the cause and `Retry decomposition`.
- [ ] 11.3 Click `Retry decomposition`. The section moves to `In progress`, then `Complete`, and the Scenes section fills in, all without a reload.
- [ ] 11.4 On a second failed session, pause, then retry. The section shows `In progress` with `Waiting for you to continue (1 held)`. Continue, and it completes.
- [ ] 11.5 Restore the environment and save `openspec/changes/retry-decomposition/reports/YYYY-MM-DD-step-10-e2e.md`.

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only change is the new route.
- [ ] 12.2 `docs/data-model.md`: record the new `decomposition` attempt stage (one attempt per division try, cycle and position carried into the failure), and that a decomposition retry opens a cycle on the shared decomposition stage instance with an attempt of the `timestamps` or `decomposition` stage, chosen by whether timestamps are stored, and never writes voice-over records or files.
- [ ] 12.3 `docs/backend-standards.md`: record the `decomposition` stage, its attempt senders, the providers registry and the `decomposition` launcher.
- [ ] 12.4 `docs/frontend-standards.md`: add `Retry decomposition` to the naming table.

## 13. Close out

- [ ] 13.1 Ask the user before commenting on JOS-136 that the `decomposition` launcher exists and that its "launch after the narration" term goes into `heldWork` and the launch hook.
- [ ] 13.2 Ask before pushing. Open the PR with a description linking to JOS-156. Target `feature/entrega-2-JAME`.
- [ ] 13.3 Obtain review by at least one human, not only AI agents.
- [ ] 13.4 Archive the OpenSpec change after merge.
