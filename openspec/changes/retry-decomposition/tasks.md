# Tasks — Manually retry a failed decomposition (JOS-156, US-24)

Every code change starts with a failing test (TDD), and every scenario in `specs/decomposition-manual-retry/spec.md` has at least one test. A stored voice-over, timestamps and failures are created through the store, as the existing decomposition tests do. Providers are the stubs (alignment, reasoning, and a voice stub that must receive nothing). Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-156-retry-decomposition` from `feature/jos-168-view-progress-by-phase`. It is stacked because the retry button lives in JOS-168's phase sections. No upstream is set.
- [x] 0.2 Verify the branch was created and is the current branch.

## 1. Gate (no code before every item passes)

- [ ] 1.1 `git fetch`. Confirm `bounded-retry-policy` (JOS-184) is merged. Record:
  - `startNewCycle`'s name and signature;
  - its stage-instance keys for the decomposition phase (`timestamps` and `decomposition`, or otherwise);
  - how a scheduled attempt is represented.

  If any differs from design Decisions 2, 4 and 5, update design.md and the spec first.
- [ ] 1.2 Confirm `view-progress-by-phase` (JOS-168) is implemented, then rebase onto it, or onto `feature/entrega-2-JAME` once it has merged. Then check:
  - whether `retry-voice-over` (JOS-155) or `see-provider-and-attempts` (JOS-166) have merged; if so, reuse their route schemas, reason table, retry button and retry-rule table instead of adding parallel ones;
  - whether JOS-136 or anything else already registers a `decomposition` launcher.

  Record the results.
- [ ] 1.3 Use the product owner's answer to JOS-155 Open Question 1 (manual retry after a not-retryable failure). If it is "no", update Decision 6, the spec and `phaseActions` before coding.
- [ ] 1.4 With the user's approval, update the umbrella change `decompose-script-into-chunks`. Replace its two manual-retry requirements ("A manual retry of timestamps stays on the same audio…" and "A manual retry of decomposition re-splits the same script") with a pointer to this change, so the requirement lives in one place.

## 2. Backend: retry service checks and step choice (TDD; design Decisions 1-3)

- [ ] 2.1 Write failing tests in a new `backend/test/decomposition-retry.test.ts` for `retryDecomposition(sessionId)`:
  - unknown session;
  - each 409 reason, with every provider stub asserting it received nothing;
  - concurrent calls open exactly one cycle;
  - acceptance after a retryable failure and after a not-retryable one.
- [ ] 2.2 Write failing tests for the step choice: no stored timestamps opens a cycle on `timestamps`; stored timestamps open one on `decomposition`.
- [ ] 2.3 Implement `backend/src/decompositionRetry.ts`: the checks, the step choice, `startNewCycle`, then the gate. Make 2.1-2.2 pass.

## 3. Backend: the two steps and the voice-over (TDD; design Decision 3)

- [ ] 3.1 Write failing tests for the timestamps step through the retry:
  - after an exhausted alignment cycle, the retry obtains the timestamps from the same MP3 and registers the chunks;
  - after `native-unusable`, the retry goes straight to the alignment stub, and the native file is not read (spy on the read).
- [ ] 3.2 Write failing tests for the division step through the retry:
  - after an instruction failure, the same script is divided from the same timestamps;
  - no `timestamps` attempt is added;
  - the chunks' `PROMPT`s reconstruct the stored script;
  - the session reaches `chunks-processing`;
  - the script, title and language are unchanged.
- [ ] 3.3 Write failing tests for AC3: for both steps, and for both a successful and a failed retry, the voice stub receives nothing, and the MP3 hash, the `voice_overs` row and the native timestamps file are unchanged.
- [ ] 3.4 Make 3.1-3.3 pass. Expect them to pass through `runDecompositionPhase`. Fix any gap in the phase, not in the retry service.

## 4. Backend: launcher, pause and derived state (TDD; design Decisions 4 and 5)

- [ ] 4.1 Write failing tests in `launch-gate.test.ts`:
  - the `decomposition` stage has a registered launcher and is no longer in `NOT_YET_LAUNCHABLE`;
  - a paused retry is counted as one held decomposition unit;
  - continue launches it exactly once.
- [ ] 4.2 Write failing tests in `phase-progress.test.ts`:
  - an accepted retry derives `chunk-decomposing` while scheduled, held or in flight, on either step;
  - a retry whose cycle fails derives `failed` with the new cause;
  - JOS-168's and JOS-155's existing rule tests still pass.
- [ ] 4.3 Register the decomposition launcher (`heldWork`, `launch`), leaving a documented hook for JOS-136's "after the narration" term. Add the decomposition row to the shared retry-rule table. Make 4.1-4.2 pass.

## 5. Backend: route (TDD; design Decision 1)

- [ ] 5.1 Write failing tests in `session-api-surface.test.ts` for `POST /sessions/:sessionId/decomposition/retry`:
  - 200 `{ ok: true, held }`;
  - 404 for an unknown session and for a malformed id;
  - 409 `{ ok: false, reason }` for each reason;
  - 400 for any body field;
  - the route is in `/docs/json`.
- [ ] 5.2 Add the route and its Zod schemas in `routes.ts`, reusing the retry-route schemas if JOS-155 has merged; make 5.1 pass.

## 6. Frontend: retry action (TDD; design Decision 7)

- [ ] 6.1 Write failing tests in `test/components.test.tsx`:
  - `phaseActions` returns retry for a failed decomposition phase, retryable or not, and nothing otherwise;
  - the Decomposition section shows `Retry decomposition` only when failed;
  - a click calls `retryDecomposition` and disables the button until the answer;
  - a 409 reason is shown as its sentence;
  - nothing changes before a snapshot arrives.
- [ ] 6.2 Implement `retryDecomposition` in `api/client.ts`, the action in `phaseActions.ts`, and the button in `PhaseSection.tsx` through the shared retry-button component, extracting it if JOS-155 has not; make 6.1 pass.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review the tests from JOS-139, JOS-140 and JOS-144 (decomposition phase), JOS-152 (launch gate and `NOT_YET_LAUNCHABLE` contents), JOS-168 and JOS-155 (phase actions, retry rule) for assumptions this change breaks; update them.
- [ ] 7.2 Confirm every scenario in `specs/decomposition-manual-retry/spec.md` has at least one test, and map ticket AC1-AC3 to tests; list both in the step 8 report.
- [ ] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the default store: row counts per table (`runs`, `stage_attempts`, `voice_overs`, `narration_timestamps`, `scenes`), applied migrations, trigger list, and `data/projects/` contents.
- [ ] 8.2 Run the targeted tests: `decomposition-retry`, `launch-gate`, `phase-progress`, `session-api-surface`, `components`.
- [ ] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`, so local provider credentials cannot mask a failure.
- [ ] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 8.5 Create the report `openspec/changes/retry-decomposition/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch store and scratch projects folder, with stub alignment and reasoning providers; confirm `GET /health`.
- [ ] 9.2 Prepare a session with a stored MP3 and a failed alignment, and record the MP3's hash. Then:
  - `curl -X POST /sessions/:id/decomposition/retry` → 200;
  - `curl GET /sessions/:id` reaches `chunks-processing`;
  - the MP3 hash is unchanged.
- [ ] 9.3 Prepare a session with stored timestamps and a failed instruction request. Then:
  - retry → 200;
  - chunks registered;
  - no new `timestamps` attempt row.
- [ ] 9.4 Error cases, each with `curl`:
  - the retry again on a session with chunks → 409;
  - an unknown id → 404;
  - a body `{"script":"x"}` → 400;
  - a paused failed session → 200 `{ held: true }`, then `POST /continue` runs it.

  `curl GET /docs/json` documents the route.
- [ ] 9.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/retry-decomposition/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: a new button and flow on the session page, so it applies.
- [ ] 10.2 Run backend (scratch store, stub providers) and frontend. Open a session failed in decomposition: the section shows `Failed`, the cause and `Retry decomposition`.
- [ ] 10.3 Click `Retry decomposition`. The section moves to `In progress`, then `Complete`, and the Scenes section fills in, all without a reload.
- [ ] 10.4 On a second failed session, pause, then retry. The section shows `In progress` with `Waiting for you to continue (1 held)`. Continue, and it completes.
- [ ] 10.5 Restore the environment and save `openspec/changes/retry-decomposition/reports/YYYY-MM-DD-step-10-e2e.md`.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only change is the new route.
- [ ] 11.2 `docs/data-model.md`: record that a decomposition retry opens a cycle on the `timestamps` or `decomposition` stage instance, chosen by whether timestamps are stored, and never writes voice-over records or files.
- [ ] 11.3 `docs/backend-standards.md`: record the `decomposition` launcher and the shared retry-rule table, if JOS-155 has not already documented the table.
- [ ] 11.4 `docs/frontend-standards.md`: add `Retry decomposition` to the naming table.

## 12. Close out

- [ ] 12.1 Ask the user before commenting on JOS-136 that the `decomposition` launcher exists and that its "launch after the narration" term goes into `heldWork` and the launch hook.
- [ ] 12.2 Ask before pushing. Open the PR with a description linking to JOS-156. Target `feature/jos-168-view-progress-by-phase` while JOS-168's PR is open, then retarget to `feature/entrega-2-JAME`, or open the follow-up PR there.
- [ ] 12.3 Obtain review by at least one human, not only AI agents.
- [ ] 12.4 Archive the OpenSpec change after merge.
