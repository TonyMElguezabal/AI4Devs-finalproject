# Tasks — Per-phase maximum execution time, measured from send

A backend change with no screen of its own. Group 1 is a hard gate. Tests come first throughout, with an injectable clock and short injected limits; automated tests use the stubbed provider only.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-185-stage-execution-time-limit` from `origin/feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set
- [x] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations and the values

- [x] 1.1 Confirm `bounded-retry-policy` (JOS-184) has landed, with `StageAttemptRecorder`, `RetryScheduler` and the conditional claim on scheduled attempts
- [x] 1.2 Confirm `define-provider-configuration` (JOS-165) has recorded the per-phase maximum time for every stage in PRD §11 and the constants module. Recorded for decomposition, image, voice, alignment and video; assembly is `undetermined`, decided 2026-10-05: not timed until defined (spec requirement "A stage without a defined maximum time is not timed", task 2.2a)
- [x] 1.3 Confirm the product decision on accepting late results (design open question 1); if it is "always discard", simplify Decisions 4–6 in these artifacts before coding. Confirmed by the product owner 2026-10-05: accept late results, including lifting an exhausted `failed` stage; Decisions 4-6 stand
- [x] 1.4 Record, per existing provider adapter, whether a result can still be received after the client stopped waiting (design open question 2). Recorded in design.md § Pre-implementation findings
- [x] 1.5 If any of the above is missing, stop and record the blocker rather than building against a guess (blockers recorded and resolved: late results, assembly limit; the unfrozen clock during a pause stays an assumption from `pause-and-continue-session` Decision 9)

## 2. Domain: deadlines (TDD)

- [x] 2.1 Write failing tests that the deadline is `sentAt + maxExecutionTime(stage)` and that an attempt without `sentAt` has no deadline
- [x] 2.2 Write a failing test that each stage uses its own maximum time from the constants module
- [x] 2.2a Write a failing test that a stage whose maximum time is `undetermined` has no deadline
- [x] 2.3 Implement the deadline computation with an injectable clock (a stage with an `undetermined` limit has no deadline)
- [x] 2.4 Run the group 2 tests and confirm they pass

## 3. Persistence: outcomes (TDD)

- [x] 3.1 Write failing tests for the conditional transitions `in-flight → timed-out`, `timed-out → late-success`, `timed-out → superseded` and `scheduled → cancelled`, each succeeding exactly once under concurrency
- [x] 3.2 Add the migration: outcomes `timed-out`, `superseded`, `late-success`, `cancelled`, and the `lateResultAt` column
- [x] 3.3 Run the group 3 tests and confirm they pass

## 4. Application: the watcher and late results (TDD)

- [x] 4.1 Write a failing test that an attempt queued behind the request limit for longer than the maximum time, then answering promptly, succeeds with no timeout
- [x] 4.2 Write a failing test that an attempt held by a pause for longer than the maximum time starts its clock when sent
- [x] 4.3 Write a failing test that a sent attempt with no result after the maximum time is recorded `timed-out` and the retry policy schedules the next attempt
- [x] 4.4 Write a failing test that a timeout on the fourth attempt of a cycle sets the stage instance to `failed`, retryable
- [x] 4.5 Write a failing test that a result and a timeout racing on the same attempt produce exactly one outcome (Decision 3)
- [x] 4.6 Write a failing test that a late success before the retry is sent is accepted and the scheduled retry is cancelled and never sent
- [x] 4.7 Write a failing test that a late success while the retry is in flight is accepted, and the retry's later success is recorded `superseded`
- [x] 4.8 Write a failing test that a late success after a later attempt already succeeded is `superseded` and the next stage is not launched again
- [x] 4.9 Write a failing test that a late success after exhaustion, with no manual retry, completes the stage instance and clears the failure (Decision 6)
- [x] 4.10 Write a failing test that a late success after a manual retry opened a new cycle is `superseded`
- [x] 4.11 Write a failing test that a late failure is recorded on its attempt and consumes no budget
- [x] 4.12 Write a failing test that after a restart an in-flight attempt times out at its original `sentAt` plus its maximum time, and one whose deadline passed during downtime is timed out promptly at startup
- [x] 4.12a Write failing tests that the default Fal.ai adapter abandons a call that outlasts the image stage's maximum time and reports a transient failure, and that its clock starts when the call is made, not when the scene was queued
- [x] 4.12b Give the Fal.ai adapter the image stage's maximum time as its default `timeoutMs`
- [x] 4.13 Implement `AttemptTimeoutWatcher` over `in-flight` `stage_attempts` rows for the stages that register a timeout handler (voice-over today; design Decision 9): run at startup after US-28's resumption, then on a fixed interval; claim expired attempts with the conditional update; hand them to `StageAttemptRecorder` as transient
- [x] 4.14 Route late results through the ordinary result handler; on successful completion mark `late-success`, on collision mark `superseded`, and cancel scheduled retries of the stage instance
- [x] 4.15 Log every timeout and late result with `stageInstanceKey`, `cycle`, `sequenceInCycle`, `sentAt`, elapsed time and resulting outcome
- [x] 4.16 Run the group 4 tests and confirm they pass

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review `bounded-retry-policy` tests for assumptions that an in-flight attempt always ends in success or failure, and extend them with timeouts. Reviewed: only `startNewCycle` assumed it (a stage failed only after `transient` or `not-retryable`); fixed, and `stage-attempt-recorder.test.ts` now covers timeouts
- [x] 5.2 Confirm every scenario in `specs/stage-execution-time-limit/spec.md` has at least one functional test
- [x] 5.3 Confirm module test coverage has not decreased. Lines and functions rose; total branches moved 92.47% to 92.38% (see the step 6 report)

## 6. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture the pre-test state of the store (session, scene and attempt counts by outcome)
- [x] 6.2 Run the targeted tests for this module and capture the pass/fail summary
- [x] 6.3 Run the full suite and record totals, failures and runtime
- [x] 6.4 Verify the post-test state matches the baseline, restoring it if needed
- [x] 6.5 Create the report `openspec/changes/stage-execution-time-limit/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [x] 6.6 Mark this step complete only after the tests pass and the report file exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the backend wired to the stubbed provider, with a short injected maximum time and retry delay, and confirm it is reachable
- [x] 7.1a Add two stub voice modes with failing tests first, so a timeout and a late result can be shown by hand: `hang-once-then-success` (the first call never answers, later calls succeed) and `success-after-limit` (every call answers successfully after the voice stage's maximum time plus two seconds)
- [x] 7.2 Capture the pre-test session and attempt counts
- [x] 7.3 With the stub set to hang once then answer, POST a project; verify via GET that the first attempt is `timed-out` and the session completes on the retry
- [x] 7.4 With the stub set to answer late (after the maximum time, before the retry delay), POST a project; verify the late result is accepted, the retry is `cancelled`, and only one voice-over exists
- [x] 7.5 With the stub set to hang always, POST a project; verify `failed` after four timed-out attempts, `retryable: true`
- [x] 7.6 Verify that time spent waiting before a send is not timed: the voice stage has no request cap to queue behind (its cap is undetermined), so hold a session with a pause for longer than the maximum time, then continue it, and verify the attempt is sent at that moment and does not time out while held. The request-cap queue case is the image stage's and is covered by `image-time-limit.test.ts`
- [x] 7.7 Delete the sessions and records created above and confirm the store matches its pre-test state
- [x] 7.8 Save the transcript as `openspec/changes/stage-execution-time-limit/reports/YYYY-MM-DD-step-7-curl-endpoint-testing.md`

## 8. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Record in `openspec/changes/stage-execution-time-limit/reports/YYYY-MM-DD-step-8-e2e-playwright.md` that E2E is not applicable: this change has no user-facing behaviour beyond the failure fields already covered by `bounded-retry-policy`

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 Add the new outcomes and `lateResultAt` to `docs/data-model.md`, with the allowed transitions
- [x] 9.2 Add to the "Retries and attempts" section of `docs/backend-standards.md`: the clock starts at `sentAt`; late results go through the ordinary result handler; adapters record whether they can receive a late result
- [x] 9.3 Confirm the per-phase maximum times in the constants module match PRD §11 (constants test)

## 10. Close out

- [ ] 10.1 Record for US-28 the startup ordering: resumption first, then the timeout watcher
- [ ] 10.2 Record for US-29 that late results rely on its idempotent completion rule
- [ ] 10.3 Open the PR with a description linking to JOS-185
- [ ] 10.4 Obtain review by at least one human, not only AI agents
- [ ] 10.5 Archive the OpenSpec change after merge
