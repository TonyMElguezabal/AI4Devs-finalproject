# Tasks — Bounded retry policy for provider stages

A cross-cutting backend change with no screen of its own. Group 1 is a hard gate. Tests come first throughout, and automated tests use the stubbed provider only.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-184-bounded-retry-policy` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Confirm the foundations and the values

- [ ] 1.1 Confirm `define-backend-stack` (JOS-179) has landed; take the framework, job mechanism and layering from `docs/backend-standards.md`
- [ ] 1.2 Confirm `define-persistence` (JOS-181) has landed; take the store and the migration approach from `docs/data-model.md`
- [ ] 1.3 Confirm `generate-voice-over` (JOS-136) has landed, with the StageAttempt record, the phase-launch gate and the retry hook this change replaces
- [ ] 1.4 Confirm `define-provider-configuration` (JOS-165) has recorded, in PRD §11 and the constants module, the retry delay base and cap per stage (Decision 5) and the not-retryable signal per provider; if not, stop and escalate JOS-154 open question 1
- [ ] 1.5 If any of the above is missing, stop and record the blocker rather than building against a guess

## 2. Domain: the policy (TDD)

- [ ] 2.1 Write failing tests for `RetryPolicy.decide` over every outcome × attempts-in-cycle combination: success → complete; transient at 1–3 → schedule next; transient at 4 → fail retryable; not-retryable at any count → fail not retryable
- [ ] 2.2 Write failing tests for the delay: exponential from the base, capped, and never earlier than a provider's retry-after
- [ ] 2.3 Write failing tests for `StageInstanceKey`: session-level stages keyed without a scene, scene-level stages keyed with one, decomposition as a single instance
- [ ] 2.4 Implement `RetryPolicy` and `StageInstanceKey` as pure code with no I/O, reading base, cap and `MAX_ATTEMPTS_PER_CYCLE = 4` from the constants module
- [ ] 2.5 Run the group 2 tests and confirm they pass

## 3. Persistence: attempts, cycles and constraints (TDD)

- [ ] 3.1 Write a failing test that the store rejects a fifth attempt in one cycle of a stage instance
- [ ] 3.2 Write a failing test that two concurrent inserts for the same `(stageInstanceKey, cycle, sequenceInCycle)` leave exactly one row
- [ ] 3.3 Write a failing test that a new cycle accepts sequence 1 again for the same stage instance
- [ ] 3.4 Add the migration: `stageInstanceKey`, `cycle`, `sequenceInCycle`, `trigger`, `dueAt`, outcome `scheduled`; the unique constraint and the check `sequenceInCycle BETWEEN 1 AND 4`; the backfill rule from the migration plan
- [ ] 3.5 Add `cycle`, `attemptsInCycle` and `manualRetryAvailable` to the failure object
- [ ] 3.6 Run the group 3 tests and confirm they pass

## 4. Application: recorder, scheduler, new cycle (TDD)

- [ ] 4.1 Write a failing test that one transient failure schedules a second attempt with `dueAt` and leaves the session or scene in its in-progress state
- [ ] 4.2 Write a failing test that three transient failures followed by a success complete the stage instance with no fifth attempt
- [ ] 4.3 Write a failing test that four transient failures set `failed` with `retryable: true`, `manualRetryAvailable: true` and nothing scheduled
- [ ] 4.4 Write a failing test that a not-retryable failure on the first attempt sets `failed` with `retryable: false` and nothing scheduled
- [ ] 4.5 Write a failing test that two scenes failing at the same stage are budgeted separately
- [ ] 4.6 Write a failing test that a due retry is released into the phase-launch gate, not sent directly (Decision 4)
- [ ] 4.7 Write a failing test that a due retry is held while the session is paused and sent after continue (with the gate's pause check stubbed until US-20 lands)
- [ ] 4.8 Write a failing test that a restart with a scheduled attempt sends it exactly once (Decision 9)
- [ ] 4.9 Write a failing test that a redelivered send job makes no second provider call (Decision 6)
- [ ] 4.10 Write a failing test that `startNewCycle` on a `failed` instance opens cycle 2 with up to four attempts and keeps cycle 1's attempts
- [ ] 4.11 Write a failing test that `startNewCycle` on an instance that is not `failed` does nothing
- [ ] 4.12 Write a failing test that a retry re-runs only its stage instance, with the bound provider, leaving other scenes' results untouched
- [ ] 4.13 Implement `StageAttemptRecorder`, allocating the next sequence in the same transaction as the insert (Decision 3)
- [ ] 4.14 Implement `RetryScheduler`: load scheduled attempts at startup; claim due attempts with a conditional `scheduled → in-flight` update; release them into the gate
- [ ] 4.15 Implement `startNewCycle`
- [ ] 4.16 Remove the placeholder retry hook from `generate-voice-over` and route the voice stage through the recorder
- [ ] 4.17 Run the group 4 tests and confirm they pass

## 5. Adapters: no hidden retries (TDD)

- [ ] 5.1 For each existing provider adapter, write a failing test that a failing provider call is made exactly once
- [ ] 5.2 Configure each adapter's HTTP client and SDK with automatic retries disabled
- [ ] 5.3 Add the rule to the adapter template so later adapters (image, video, reasoning, alignment) inherit it
- [ ] 5.4 Run the group 5 tests and confirm they pass

## 6. API and live updates (TDD)

- [ ] 6.1 Write a failing test that a failed stage instance's representation carries cause, `retryable`, `manualRetryAvailable`, `cycle` and `attemptsInCycle`
- [ ] 6.2 Write a failing test that a provider error containing a credential or raw payload is not reflected in the cause
- [ ] 6.3 Add the fields to the session representation (`consult-session`) and to the live-update event payload (JOS-183)
- [ ] 6.4 Log each attempt with `stageInstanceKey`, `cycle`, `sequenceInCycle`, `trigger`, `outcome`, `latencyMs` and `queuedMs`; log exhaustion and not-retryable failures at warning level
- [ ] 6.5 Run the group 6 tests and confirm they pass

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Update `generate-voice-over` tests that asserted "transient failure fails the session" to the new retry behaviour
- [ ] 7.2 Confirm every scenario in `specs/stage-retry-policy/spec.md` has at least one functional test
- [ ] 7.3 Confirm module test coverage has not decreased

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test state of the store (session, scene and attempt counts)
- [ ] 8.2 Run the targeted tests for this module and capture the pass/fail summary
- [ ] 8.3 Run the full suite and record totals, failures and runtime
- [ ] 8.4 Verify the post-test state matches the baseline, restoring it if needed
- [ ] 8.5 Create the report `openspec/changes/bounded-retry-policy/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the backend wired to the stubbed provider, with short injected retry delays, and confirm it is reachable
- [ ] 9.2 Capture the pre-test session and attempt counts
- [ ] 9.3 With the stub set to fail transiently twice then succeed, POST a project; GET the session until `voice-over-complete` and verify three attempts were recorded
- [ ] 9.4 With the stub set to fail transiently always, POST a project; verify `failed` with `retryable: true`, `manualRetryAvailable: true`, `cycle: 1`, `attemptsInCycle: 4`, and that no fifth attempt appears after waiting past the next delay
- [ ] 9.5 With the stub set to reject as not retryable, POST a project; verify `failed` with `retryable: false` and exactly one attempt
- [ ] 9.6 Restart the backend while a retry is scheduled; verify it is sent exactly once after restart
- [ ] 9.7 Delete the sessions and records created above and confirm the store matches its pre-test state
- [ ] 9.8 Save the transcript as `openspec/changes/bounded-retry-policy/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: this change adds no screen. If the session page from `consult-session` exists, run 10.2–10.3; otherwise record in the report that E2E is not applicable and why
- [ ] 10.2 With the stub set to fail transiently always, start a project through the form and assert the session page shows the failure, its cause and that it is retryable
- [ ] 10.3 Restore the environment and save the report as `openspec/changes/bounded-retry-policy/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Add the StageAttempt fields, constraints and the failure fields to `docs/data-model.md`
- [ ] 11.2 Add the failure fields to the session schema in `docs/api-spec.yml` and confirm it matches the implementation
- [ ] 11.3 Add a "Retries and attempts" section to `docs/backend-standards.md`: record outcomes through `StageAttemptRecorder`, never change stage state directly, never enable client or SDK retries, retries go through the gate
- [ ] 11.4 Confirm the retry delay values and `MAX_ATTEMPTS_PER_CYCLE` in the constants module match PRD §11 and §10.1 (constants test)

## 12. Close out

- [ ] 12.1 Record for US-22b (JOS-185) where the recorder and scheduler live, so the timeout watcher records through them
- [ ] 12.2 Record for US-23 to US-27 the `startNewCycle` contract
- [ ] 12.3 Record for US-20 and US-37 that retries already pass through the gate they extend
- [ ] 12.4 Open the PR with a description linking to JOS-184
- [ ] 12.5 Obtain review by at least one human, not only AI agents
- [ ] 12.6 Archive the OpenSpec change after merge
