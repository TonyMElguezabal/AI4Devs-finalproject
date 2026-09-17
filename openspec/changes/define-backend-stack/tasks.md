# Tasks — Define the backend stack

Timebox: 2 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-179-define-backend-stack` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Resolve the binding constraints before any scoring

- [ ] 1.1 Determine whether the database expectation in `docs/openspec-tasks-mandatory-steps.md` is binding for Vid4You or inherited from the template
- [ ] 1.2 Determine whether the TypeScript signal in the project Definition of Done (VineJS/Zod validation, OpenAPI generation) is binding or inherited
- [ ] 1.3 Record the answer with its reasoning; this decides whether non-TypeScript candidates are admissible at all
- [ ] 1.4 Hand the recorded answer to US-42c (JOS-181) so persistence is not boxed in by an unexamined assumption

## 2. Evaluate candidates

- [ ] 2.1 Apply the must-pass gates to each candidate: C1–C7 expressible without fighting the framework, OpenAPI generation, typed validation, ability to invoke the US-42d media tooling, single-command local start
- [ ] 2.2 Eliminate candidates failing any gate, recording which gate and why
- [ ] 2.3 Score surviving candidates against the weighted criteria (orchestration 30%, concurrency 20%, live push 15%, testability 15%, familiarity 10%, local simplicity 10%)
- [ ] 2.4 Select the leading candidate and record the runner-up as the documented fallback

## 3. Build the walking skeleton

- [ ] 3.1 Create a throwaway prototype in the leading candidate, outside the product source tree
- [ ] 3.2 Implement the stubbed provider with configurable latency, transient failures, not-retryable failures and duplicate success confirmations
- [ ] 3.3 Implement the disposable persistence stand-in, recording explicitly that it does not pre-empt US-42c
- [ ] 3.4 Expose the minimal HTTP surface the experiments need: start a run, read state, trigger a retry
- [ ] 3.5 Serve a minimal page that receives pushed state changes, for experiment 4.4

## 4. Run the experiments and record evidence

- [ ] 4.1 Restart resumption: kill the process mid-call, restart, show the original result picked up; then the unrecoverable case producing exactly one failed attempt
- [ ] 4.2 Shared concurrency: with the cap at N, show more than N ready requests across two sessions, exactly N in flight, the rest sent in readiness order, waiting excluded from the per-phase limit
- [ ] 4.3 Retry budget: a transient failure consuming 1 + 3 attempts then landing in `failed`; a not-retryable failure landing in `failed` immediately with no retries
- [ ] 4.4 Live push: a state change reaching the open page without a reload, including reconnection after the restart in 4.1
- [ ] 4.5 Idempotency: the same success confirmation delivered twice producing one result and one next-stage launch
- [ ] 4.6 For each experiment record the outcome including failures, the framework-specific machinery required, and any dependence on the persistence stand-in
- [ ] 4.7 If a must-pass gate fails during the experiments, stop and switch to the documented fallback candidate rather than continuing on paper

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Confirm no pre-existing test suite exists (the repository has no application code); record this rather than assuming it
- [ ] 5.2 Write automated tests covering experiments 4.1, 4.3 and 4.5, so the behaviours are repeatable rather than demonstrated once
- [ ] 5.3 Document the test command that runs them

## 6. Run Unit Tests and Verify Persisted State (MANDATORY)

- [ ] 6.1 Capture the pre-test state of the persistence stand-in (counts and key records)
- [ ] 6.2 Run the targeted tests for the skeleton and capture the pass/fail summary
- [ ] 6.3 Run the full skeleton suite and record totals, failures and runtime
- [ ] 6.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it
- [ ] 6.5 Create the report `openspec/changes/define-backend-stack/reports/YYYY-MM-DD-step-6-unit-test-and-state-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 6.6 Mark this step complete only after the tests pass and the report file exists

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 7.1 Start the skeleton backend and confirm it is reachable
- [ ] 7.2 Exercise the start-run endpoint with curl and verify the response and resulting state
- [ ] 7.3 Exercise the read-state endpoint with curl and verify it reflects the run
- [ ] 7.4 Exercise the retry endpoint with curl against a failed stage and verify the attempt count
- [ ] 7.5 Exercise error cases: unknown identifier, malformed payload, and a not-retryable provider failure
- [ ] 7.6 Record every command and response, then restore the stand-in to its pre-test state

## 8. E2E Testing with Playwright MCP (MANDATORY - applicable, minimal - AGENT MUST EXECUTE)

- [ ] 8.1 Ensure the skeleton backend and its minimal page are running
- [ ] 8.2 Navigate to the page with Playwright MCP `browser_navigate` and snapshot the initial state
- [ ] 8.3 Trigger a state change server-side and confirm via snapshot that the page updates without a reload
- [ ] 8.4 Drop the connection, let a change occur, restore it, and confirm the page reaches correct current state
- [ ] 8.5 Restore the environment and record the scenarios and outcomes in the change folder

## 9. Record the decision

- [ ] 9.1 Write the ADR: chosen stack, rejected alternatives with reasons, and the evidence behind each conclusion
- [ ] 9.2 State which observations depend on the disposable persistence stand-in, so US-42c can revisit them
- [ ] 9.3 Record anything the timebox left unproven as an explicit risk

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 Rewrite `docs/backend-standards.md` for Vid4You: stack, project structure, layering, naming, error handling, validation approach
- [ ] 10.2 Add API and OpenAPI conventions, plus the testing approach and its commands
- [ ] 10.3 Add the logging and diagnostics conventions that carry per-stage provider and attempt records (US-34)
- [ ] 10.4 Verify no inherited template content describing another application remains in the file
- [ ] 10.5 Note that `openspec/config.yaml` still names `docs/api-spec.yml` and `docs/data-model.md` as the contract and data model, and that both remain stale until their own tickets address them

## 11. Close out

- [ ] 11.1 Decide and state explicitly whether the skeleton becomes the project seed or is discarded
- [ ] 11.2 Create follow-up items for anything the spike revealed, linked to epic E13 (JOS-177)
- [ ] 11.3 Record time spent, to calibrate future spikes
- [ ] 11.4 Obtain review by at least one human, not only AI agents
