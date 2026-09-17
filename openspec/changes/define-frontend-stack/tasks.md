# Tasks — Define the frontend stack

Timebox: 2 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk.

Consumes the push mechanism from `define-live-updates` (JOS-183) and the backend harness from `define-backend-stack` (JOS-179). Task 1.1 and 1.2 are inputs *from* those changes, not decisions re-opened here.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-180-define-frontend-stack` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Collect the inputs this decision depends on

- [ ] 1.1 Take the TypeScript ruling from `define-backend-stack` task 1.2; do not re-open it here
- [ ] 1.2 Take the live-update mechanism from `define-live-updates`, or record that it is unsettled and a stand-in will be used behind the Decision 3 seam
- [ ] 1.3 Determine whether an OpenAPI-generated API client will be available, since it decides whether the frontend hand-writes its types
- [ ] 1.4 Record what is still undecided at this point, so later conclusions can be traced to what was known

## 2. Record the screen inventory from the PRD

- [ ] 2.1 Start-a-project screen: title, script, and a language selector limited to the hardcoded list, with no session startable without a language (§4.1, AC01)
- [ ] 2.2 Session-by-phase view: a section per phase, the session's current state, the failed phase with its error and actions, and provider plus attempts for session-level stages (§8.1, §8.3, AC21)
- [ ] 2.3 Scene list: ascending identifier order, chunk state, available image or clip, errors and actions (§6, §8.2, AC21)
- [ ] 2.4 Scene details: `PROMPT`, `IMAGE`, `VIDEO`, narration interval, requested duration, speed factor and warning, provider and attempts per stage (§3, §7.2, AC23)
- [ ] 2.5 Correction form: offered only on a failed stage, limited to the two visual instructions (§10.3, AC09)
- [ ] 2.6 Pause and continue: session-level control with the paused marker shown on top of current state (§8.1, §9, AC07)
- [ ] 2.7 Downloads: per-scene image and clip during processing, final MP4 only at `final-video`, nothing offered for MP3, timestamps or texts (§12.3)
- [ ] 2.8 Confirm every screen traces to a PRD section, and record the project-list gap rather than inventing the screen

## 3. Evaluate candidates

- [ ] 3.1 Apply the must-pass gates to each candidate: renders the push without reload, drivable via the accessibility tree, one documented start command at a fixed URL, fully typed, no auth layer
- [ ] 3.2 Eliminate candidates failing any gate, recording which gate and why
- [ ] 3.3 Score surviving candidates against the weighted criteria (live updates at scale 25%, agent automatability 20%, fit for the screen inventory 20%, backend interop 15%, familiarity 10%, local simplicity 10%)
- [ ] 3.4 Score the server-rendered candidate on its merits for a local single-user no-auth tool, and record the reason if it loses
- [ ] 3.5 Select the leading candidate and record the runner-up as the documented fallback

## 4. Build the prototype

- [ ] 4.1 Create a throwaway prototype in the leading candidate, outside the product source tree
- [ ] 4.2 Point it at the `define-backend-stack` harness rather than a third mock server
- [ ] 4.3 Put the push connection behind a single seam, so the mechanism can be swapped without touching views (Decision 3)
- [ ] 4.4 Build the scene list, rendering order from the scene identifier rather than arrival order (Decision 6)
- [ ] 4.5 Build scene details and the conditional correction form, derived from stage state rather than a flag (Decision 4)
- [ ] 4.6 Build the pause and continue control with the paused marker distinct from a running generation
- [ ] 4.7 Build the download affordances with their state gating
- [ ] 4.8 Apply the accessible naming convention from Decision 5 to every element above

## 5. Run the experiments and record evidence

- [ ] 5.1 Scale: a session of roughly 200 scenes receiving rapid concurrent state changes, staying in identifier order, responsive, without a reload
- [ ] 5.2 Drive those updates at a rate and concurrency drawn from the retry and request-limit rules (§10.1, §11), not at a comfortable cadence
- [ ] 5.3 Reconnect: drop the push connection and restart the backend, confirming the open page reaches current state without a manual reload
- [ ] 5.4 Conditional editing: the form present on a failed image stage, absent on a successful one, and never exposing identifier, prompt or order
- [ ] 5.5 Download gating: the final MP4 offered only at `final-video`, and nothing offered for MP3, timestamps or texts
- [ ] 5.6 Record whether the scene list needed virtualisation at the observed sizes, answering design open question 3 from evidence
- [ ] 5.7 For each experiment record the outcome including failures, and any dependence on the live-update stand-in
- [ ] 5.8 If a must-pass gate fails during the experiments, stop and switch to the documented fallback rather than continuing on paper

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 6.1 Confirm which test suites exist at this point, including any added by `define-backend-stack` and `define-persistence`; record the finding rather than assuming it
- [ ] 6.2 Write component tests covering scene ordering (5.1), conditional editing (5.4) and download gating (5.5), so the behaviours are repeatable rather than demonstrated once
- [ ] 6.3 Write a test asserting the accessible names the convention fixes, so drift breaks a test rather than a later story's E2E
- [ ] 6.4 Document the test command that runs them

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 7.1 Capture the pre-test state of the store behind the harness (counts and key records)
- [ ] 7.2 Run the targeted frontend tests and capture the pass/fail summary
- [ ] 7.3 Run the full prototype suite and record totals, failures and runtime
- [ ] 7.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it
- [ ] 7.5 Create the report `openspec/changes/define-frontend-stack/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 7.6 Mark this step complete only after the tests pass and the report file exists

## 8. Manual Endpoint Testing with curl (MANDATORY - minimal - AGENT MUST EXECUTE)

Applicable but deliberately narrow: this change adds no endpoints. The purpose here is to confirm the UI consumes the harness's existing surface faithfully, not to re-test endpoints owned by `define-backend-stack` task 7.

- [ ] 8.1 Start the harness backend and confirm it is reachable
- [ ] 8.2 Exercise with curl each endpoint the prototype consumes, recording the exact response shape
- [ ] 8.3 Compare that shape against what the UI renders, confirming the UI invents no field the backend does not return
- [ ] 8.4 Trigger a state change with curl and confirm it reaches the open page without a reload
- [ ] 8.5 Record every command and response, then restore the store to its pre-test state
- [ ] 8.6 Save the transcript as `openspec/changes/define-frontend-stack/reports/YYYY-MM-DD-step-8-curl-endpoint-testing.md`

## 9. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

Central to this change: Decision 1 makes agent automatability a gate, and this step is what proves it.

- [ ] 9.1 Ensure both the harness backend and the prototype frontend are running from their documented commands
- [ ] 9.2 Navigate to the application with `browser_navigate` and snapshot the initial state
- [ ] 9.3 Start a project by filling title, script and language, and assert via snapshot that it cannot be started without a language
- [ ] 9.4 Open the session, assert the per-phase sections and the scene list in ascending identifier order
- [ ] 9.5 Pause the session, assert the paused marker reads distinctly from a running generation, then continue
- [ ] 9.6 Open a scene's details and assert its interval, requested duration, speed factor, provider and attempts are shown
- [ ] 9.7 Assert the correction form is present on a failed stage and absent on a successful one
- [ ] 9.8 Trigger a per-scene download and assert it is offered, and that the final MP4 is not offered before `final-video`
- [ ] 9.9 Confirm every interaction above located its target through the accessibility tree, with no test-only selectors
- [ ] 9.10 Restore the environment and save the report as `openspec/changes/define-frontend-stack/reports/YYYY-MM-DD-step-9-e2e-playwright.md`

## 10. Record the decision

- [ ] 10.1 Write the ADR: chosen framework and build tooling, rejected alternatives with reasons, and the evidence behind each conclusion
- [ ] 10.2 State which observations depend on a live-update stand-in, so `define-live-updates` can revisit them
- [ ] 10.3 Record the scale ceiling actually observed, and whether virtualisation proved necessary
- [ ] 10.4 Record the project-list gap as a product question for the owner, with what the prototype assumed meanwhile
- [ ] 10.5 Record anything the timebox left unproven as an explicit risk

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Rewrite `docs/frontend-standards.md` for this product: stack, project structure, component conventions, state handling for live updates, testing approach and commands, and the start command
- [ ] 11.2 Add the accessibility and naming conventions from Decision 5, with the stable accessible names for phase sections, scene rows, detail fields and actions
- [ ] 11.3 Add the screen inventory from group 2, so implementation stories inherit it
- [ ] 11.4 Verify no inherited template content describing another application remains — the file currently has 44 such lines and no mention of this product
- [ ] 11.5 Confirm the result stays consistent with what `define-backend-stack` and `define-persistence` wrote to their standards files, resolving any contradiction rather than layering over it

## 12. Close out

- [ ] 12.1 Decide and state explicitly whether the prototype becomes the project seed or is discarded
- [ ] 12.2 Answer design open question 2 (generated API client) or record it as deferred with its owner
- [ ] 12.3 Create follow-up items for anything the spike revealed, linked to epic E13 (JOS-177)
- [ ] 12.4 Record time spent, to calibrate future spikes
- [ ] 12.5 Obtain review by at least one human, not only AI agents
