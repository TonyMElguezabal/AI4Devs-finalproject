# Tasks — Define the live progress update mechanism

Timebox: 1.5 working days (the ticket estimates S). The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk rather than reported as passing.

Runs against the walking skeleton and stubbed provider from `define-backend-stack` (JOS-179). The backend stack, the store and the frontend framework are inputs here, not decisions re-opened.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-183-define-live-updates` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Collect the inputs this decision depends on

- [ ] 1.1 Take the backend stack and runtime from `define-backend-stack`, and record which streaming primitives it offers
- [ ] 1.2 Take the frontend stack from `define-frontend-stack` and locate its Decision 3 push seam, which this mechanism must drop into
- [ ] 1.3 Confirm with `define-persistence` whether the store is authoritative and can return a session's current state in one read, or record it as an assumption (design open question 1)
- [ ] 1.4 Determine whether the documented start command serves HTTP/1.1 or HTTP/2, and record the per-origin connection ceiling that follows (design open question 2)
- [ ] 1.5 Record what is still undecided at this point, so later conclusions can be traced to what was known

## 2. Settle the direction of flow before comparing transports

- [ ] 2.1 Enumerate every browser-to-server interaction the PRD implies: start a project (§4.1), pause and continue (§9), manual retry (§10.2), correct a visual instruction (§10.3), download (§12.3)
- [ ] 2.2 Confirm each is an ordinary request answered by an ordinary response, or identify the one that is not
- [ ] 2.3 Record whether a one-way transport suffices, as a conclusion with its reasoning rather than an assumption (Decision 1)

## 3. Evaluate candidates

- [ ] 3.1 Apply the must-pass gates to Server-Sent Events, WebSocket and polling: reaches an open page without a reload, recovers from a dropped connection and a backend restart, needs no auth or fan-out layer, addressable per session
- [ ] 3.2 Eliminate candidates failing any gate, recording which gate and why
- [ ] 3.3 Score the survivors against the weighted criteria (correctness under disconnection 30%, burst behaviour at hundreds of scenes 25%, fit with the chosen backend and frontend stacks 20%, local simplicity 15%, operational visibility 10%)
- [ ] 3.4 Score polling honestly against §8.3's "as soon as it happens" at the scene counts §4.1 permits, and record the reason if it loses
- [ ] 3.5 Select the leading candidate and record the runner-up as the documented fallback

## 4. Define the contract

- [ ] 4.1 Define the session event payload: current session state from the eight in §8.1, and the paused marker as a separate field (Decision 8)
- [ ] 4.2 Define the scene event payload: scene identifier, current chunk state from the six in §8.2, the affected stage on failure, the error cause, and the provider and attempt count for that stage (§10.1, §11.2)
- [ ] 4.3 Confirm the payload carries current state rather than a delta, and record why duplicates and reordering are then harmless (Decision 2)
- [ ] 4.4 Define the stream address, scoped to a single session identifier (Decision 5, §12.3, AC22)
- [ ] 4.5 Define the snapshot read that resync depends on: session state, paused marker and every scene's current state in one request (Decision 4)
- [ ] 4.6 Define the heartbeat interval and the client reconnection backoff (Decision 7)
- [ ] 4.7 Define the coalescing rule: same-entity events collapse to the latest state, distinct scenes never merge, no artificial delay before an entity's first pending event (Decision 6)
- [ ] 4.8 Record the minimum diagnostics the stream carries, and note what US-34 may still need to fetch separately (design open question 4)

## 5. Decide the catch-up rule

- [ ] 5.1 State the choice between replay and resync explicitly, with the reasoning from where authoritative state lives (§12.1)
- [ ] 5.2 Record what replay would have required — event identifiers, server-side retention and an eviction policy — so the rejected option is visible
- [ ] 5.3 Record the consequence of the choice: which intermediate transitions, if any, a disconnected page never sees
- [ ] 5.4 Note that a complete transition history, if a later story needs one, comes from the persisted stage-attempt records rather than from the stream

## 6. Build the experiment harness

- [ ] 6.1 Extend the `define-backend-stack` skeleton with the chosen mechanism, rather than building a third mock server (Decision 9)
- [ ] 6.2 Wire it into the frontend seam from task 1.2, or into a minimal page if the frontend prototype is unavailable, recording which was used
- [ ] 6.3 Add a way to drive a session of roughly 200 scenes through state changes from the stubbed provider
- [ ] 6.4 Add a way to sever the connection and to restart the backend on demand
- [ ] 6.5 Instrument the page to record the events it received and the state it holds per scene, so assertions rest on observation rather than on inspection by eye

## 7. Run the experiments and record evidence

- [ ] 7.1 Burst: roughly 200 scenes transitioning near-simultaneously, driven at the concurrency and retry cadence of §10.1 rather than a comfortable one
- [ ] 7.2 Assert on the terminal state of all 200 scenes and on per-scene ordering, not on a total event count that coalescing legitimately reduces
- [ ] 7.3 Disconnect and catch-up: sever the connection, let several transitions occur, restore it, and confirm the page reaches correct current state under the rule from group 5
- [ ] 7.4 Backend restart: restart mid-session and confirm the page recovers without a manual reload (§12.1)
- [ ] 7.5 Idle: run a long session with a quiet stretch and confirm the connection survives or reconnects transparently; start it early so it runs alongside the others
- [ ] 7.6 Measure the snapshot read at a few hundred scenes, and record the cost as evidence for or against the catch-up rule (Decision 4)
- [ ] 7.7 Open the same session in two tabs and confirm the connection ceiling from task 1.4 is not exceeded
- [ ] 7.8 Confirm a page open on one session receives no event from another session running at the same time (AC22)
- [ ] 7.9 Record each outcome including failures, and any observation that depended on a stand-in rather than the decided stack or store
- [ ] 7.10 If a must-pass gate fails during the experiments, stop and switch to the documented fallback rather than continuing on paper

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 8.1 Confirm which test suites exist at this point, including any added by `define-backend-stack`, `define-persistence` and `define-frontend-stack`; record the finding rather than assuming it
- [ ] 8.2 Write a test that applying the same event twice leaves the held state unchanged (Decision 2)
- [ ] 8.3 Write a test that a scene's state is correct after events for it arrive collapsed, and that distinct scenes are never merged (Decision 6)
- [ ] 8.4 Write a test that the paused marker is carried separately from the session state and that continuing leaves the state unchanged (§8.1, Decision 8)
- [ ] 8.5 Write a test that reconnection applies the catch-up rule from group 5
- [ ] 8.6 Document the test command that runs them

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 9.1 Capture the pre-test state of the store behind the harness (counts and key records)
- [ ] 9.2 Run the targeted tests from group 8 and capture the pass/fail summary
- [ ] 9.3 Run the full harness suite and record totals, failures and runtime
- [ ] 9.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it
- [ ] 9.5 Create the report `openspec/changes/define-live-updates/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 9.6 Mark this step complete only after the tests pass and the report file exists

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

This change's endpoint is a held-open stream, so the usual request-and-return pattern does not apply. Record the exact invocation used, so later stories inherit it rather than each rediscovering the problem.

- [ ] 10.1 Start the harness backend and confirm it is reachable
- [ ] 10.2 Open the stream with curl held open, and capture the raw frames a session emits during processing
- [ ] 10.3 Confirm the captured frames match the payload shape defined in group 4, field for field
- [ ] 10.4 Call the snapshot read with curl and confirm it returns the session state, the paused marker and every scene's current state
- [ ] 10.5 Trigger a state change with curl and confirm it appears on the held-open stream
- [ ] 10.6 Open a stream for one session and confirm no event from another running session appears on it
- [ ] 10.7 Confirm a request for a non-existent session identifier is rejected rather than opening an empty stream
- [ ] 10.8 Record every command and response, then restore the store to its pre-test state
- [ ] 10.9 Save the transcript as `openspec/changes/define-live-updates/reports/YYYY-MM-DD-step-10-curl-endpoint-testing.md`

## 11. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Ensure the harness backend and the page from task 6.2 are running from their documented commands
- [ ] 11.2 Navigate with `browser_navigate` and snapshot the initial state of an in-progress session
- [ ] 11.3 Drive state changes from the backend and assert via snapshot that the page reflects them without a reload (§8.3)
- [ ] 11.4 Pause the session and assert the paused marker appears on top of the current state, then continue and assert the state is unchanged (§8.1, §9, AC07)
- [ ] 11.5 Sever the connection, let transitions occur, restore it, and assert via snapshot that the page reaches current state with no manual reload
- [ ] 11.6 Restart the backend mid-session and assert the page recovers on its own
- [ ] 11.7 Assert a failed scene shows its affected stage, provider and attempt count as delivered by the stream (§10.1, §11.2)
- [ ] 11.8 Confirm every assertion located its target through the accessibility tree, with no test-only selectors
- [ ] 11.9 Restore the environment and save the report as `openspec/changes/define-live-updates/reports/YYYY-MM-DD-step-11-e2e-playwright.md`

## 12. Record the decision

- [ ] 12.1 Write the ADR: chosen mechanism, rejected alternatives with reasons, and the evidence behind each conclusion
- [ ] 12.2 Record the catch-up rule and its justification, including what a disconnected page does not see
- [ ] 12.3 Record the event payload shape as the contract US-18, US-19, US-21 and US-34 build against
- [ ] 12.4 State which observations depend on a stand-in, so `define-persistence` and `define-backend-stack` can close them
- [ ] 12.5 Record what the timebox left unproven as an explicit risk, naming the idle experiment if it did not finish
- [ ] 12.6 Record the observed end-to-end latency as an observation, without inventing a threshold the project has not set (design open question 3)

## 13. Update Technical Documentation (MANDATORY)

- [ ] 13.1 Add a live-updates section to `docs/backend-standards.md`: the mechanism, the stream address, the event payloads, the coalescing rule, the heartbeat, and the snapshot read
- [ ] 13.2 Add a live-updates section to `docs/frontend-standards.md`: consuming the stream, applying state-carrying events, reconnection with backoff, and the catch-up rule on every reconnect
- [ ] 13.3 Write the payload shape once and reference it from both documents, so the two cannot drift apart
- [ ] 13.4 Confirm the result stays consistent with what `define-backend-stack`, `define-persistence` and `define-frontend-stack` wrote to their standards files, resolving any contradiction rather than layering over it
- [ ] 13.5 Record the held-open curl invocation from task 10.2 in `docs/backend-standards.md`, so the mandatory curl step is executable for every later story that touches the stream

## 14. Close out

- [ ] 14.1 Decide and state explicitly whether the experiment code becomes the project seed or is discarded
- [ ] 14.2 Close the `define-frontend-stack` observations that depended on its push stand-in, and the `define-backend-stack` push demonstration
- [ ] 14.3 Create follow-up items for anything the spike revealed, linked to epic E13 (JOS-177)
- [ ] 14.4 Record the decision on next steps: proceed, pivot or cancel
- [ ] 14.5 Record time spent, to calibrate future spikes
- [ ] 14.6 Obtain review by at least one human, not only AI agents
