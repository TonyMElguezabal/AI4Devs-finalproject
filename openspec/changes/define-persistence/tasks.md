# Tasks — Define persistence for sessions and project files

Timebox: 2 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk.

Runs alongside `define-backend-stack` (JOS-179) and reuses its prototype harness rather than building a second one. Task 1.1 is an input *from* that change, not a duplicate of it.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-181-define-persistence` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Collect the inputs this decision depends on

- [ ] 1.1 Take the ruling from `define-backend-stack` task 1.1 on whether the database expectation in `docs/openspec-tasks-mandatory-steps.md` is binding or inherited from the template
- [ ] 1.2 Take the chosen backend language and runtime from that change, since it bounds which stores are viable
- [ ] 1.3 List which of that change's restart and idempotency observations depend on its disposable persistence stand-in, and must therefore be re-proven here
- [ ] 1.4 Record what is still undecided at this point, so later conclusions can be traced to what was known

## 2. Enumerate the record set from the PRD

- [ ] 2.1 Derive the session record and its fields from PRD §3, §4.1, §8.1 and §12.2, including title, script, selected language, state, paused marker and project folder
- [ ] 2.2 Derive the chunk record from §3, §6 and §8.2: ID, PROMPT, IMAGE, VIDEO, narration interval, chunk state, requested duration, speed factor and warning
- [ ] 2.3 Derive the stage attempt record from §10.1, §10.3 and §11: stage, sequence within the 1 + 3 budget, provider, outcome class, external request identifier, queued and executing times
- [ ] 2.4 Derive the artefact record from §12.2 and §12.3: kind, path relative to the project folder, and which stage produced it
- [ ] 2.5 Confirm every field traces to a PRD section, and drop any field that does not
- [ ] 2.6 Note which fields exist only to serve US-34 diagnostics, so their cost is visible

## 3. Choose the store

- [ ] 3.1 Define the must-pass gates: uniqueness constraints, durable writes before a provider call returns, concurrent per-scene writes, migrations, and inspectability for the mandatory verification step
- [ ] 3.2 Eliminate candidates failing any gate, recording which gate and why
- [ ] 3.3 Score surviving candidates on local single-user simplicity, testability, migration tooling and fit with the chosen runtime
- [ ] 3.4 Select the store and record the runner-up as the documented fallback

## 4. Build the persistence layer on the existing harness

- [ ] 4.1 Add the chosen store to the `define-backend-stack` prototype, replacing its disposable stand-in
- [ ] 4.2 Implement the schema for sessions, chunks, stage attempts and artefacts from group 2
- [ ] 4.3 Implement the uniqueness constraint that rejects a repeated success confirmation (Decision 3)
- [ ] 4.4 Implement write-ahead recording of a provider request before it is sent (Decision 2)
- [ ] 4.5 Implement file references relative to the session's recorded project folder (Decision 4)
- [ ] 4.6 Implement startup reconstruction of the readiness queue, restoring only the paused marker (Decision 5)
- [ ] 4.7 Set up the migration mechanism and commit the first schema version (Decision 6)

## 5. Run the experiments and record evidence

- [ ] 5.1 Restart resumption: kill the process between send and response, restart, show the recorded request identified with its stage and provider
- [ ] 5.2 Unrecoverable case: the same scenario where the provider no longer holds the result, producing exactly one failed attempt and no duplicate
- [ ] 5.3 Idempotency: the same success confirmation delivered twice, and two delivered concurrently, each producing one result and one next-stage launch
- [ ] 5.4 Concurrent writes: several scenes completing at once without lost updates or interleaved corruption
- [ ] 5.5 Same-title isolation: two sessions sharing a title, each resolving only to its own folder
- [ ] 5.6 Folder rename: rename a project folder in place, update the recorded root, confirm every artefact reference still resolves
- [ ] 5.7 Migration: apply a second schema version and confirm an existing session's chunks and intervals are unchanged (§11.2)
- [ ] 5.8 For each experiment record the outcome including failures, and any behaviour that required store-specific machinery
- [ ] 5.9 If a must-pass gate fails during the experiments, stop and switch to the documented fallback rather than continuing on paper

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 6.1 Confirm whether a test suite exists at this point, including any added by `define-backend-stack`; record the finding rather than assuming it
- [ ] 6.2 Update any tests that asserted against the disposable stand-in, so they now run against the real store
- [ ] 6.3 Write automated tests covering experiments 5.1, 5.2, 5.3 and 5.7, so the behaviours are repeatable rather than demonstrated once
- [ ] 6.4 Document the test command that runs them

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 7.1 Capture the pre-test state of the store (counts and key records per table or collection)
- [ ] 7.2 Run the targeted persistence tests and capture the pass/fail summary
- [ ] 7.3 Run the full prototype suite and record totals, failures and runtime
- [ ] 7.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it
- [ ] 7.5 Create the report `openspec/changes/define-persistence/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 7.6 Mark this step complete only after the tests pass and the report file exists

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

Applicable: the prototype exposes the minimal HTTP surface built by `define-backend-stack` task 3.4, and these calls are how persistence is exercised end to end.

- [ ] 8.1 Start the prototype backend against the real store and confirm it is reachable
- [ ] 8.2 Capture the store's state before any request is made
- [ ] 8.3 POST to start a run, verify the response and that the session, chunks and initial attempt records were written
- [ ] 8.4 GET the run state, verify it reflects the stored records rather than in-memory state
- [ ] 8.5 POST a duplicate success confirmation and verify the store rejects it, leaving one result
- [ ] 8.6 POST a retry against a failed stage and verify a new attempt row appends rather than overwriting
- [ ] 8.7 Exercise error cases: unknown session identifier, malformed payload, and a write violating the uniqueness constraint
- [ ] 8.8 Record every command and response, then restore the store to its pre-test state and verify the restoration
- [ ] 8.9 Save the transcript as `openspec/changes/define-persistence/reports/YYYY-MM-DD-step-8-curl-endpoint-testing.md`

## 9. E2E Testing with Playwright MCP (NOT APPLICABLE)

- [ ] 9.1 Record that this step does not apply: the change touches no UI and adds no user workflow. The prototype's minimal page belongs to `define-backend-stack`, whose task 8 already covers it, and nothing here changes what that page shows. Frontend work is owned by US-42b (JOS-180)

## 10. Record the decision

- [ ] 10.1 Write the ADR: chosen store, rejected alternatives with reasons, and the evidence behind each conclusion
- [ ] 10.2 Record the ruling on whether the mandatory database-verification step is executable against the chosen store, and raise an amendment to `docs/openspec-tasks-mandatory-steps.md` if it is not
- [ ] 10.3 State the attempt-history growth rate observed, and that no retention rule is being invented (the MVP sets none)
- [ ] 10.4 State the folder-move limitation explicitly: relative references survive a rename in place, but a folder moved elsewhere needs its recorded root updated
- [ ] 10.5 Record anything the timebox left unproven as an explicit risk

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Rewrite `docs/data-model.md` for Vid4You: sessions, chunks, stage attempts and artefacts, with their relationships and the PRD section each field comes from
- [ ] 11.2 Verify no entity from the unrelated inherited domain remains in that file
- [ ] 11.3 Add a persistence section to `docs/backend-standards.md`: store, migration workflow, transaction and uniqueness conventions, and how tests isolate state
- [ ] 11.4 Confirm the result stays consistent with what `define-backend-stack` wrote to the same file, resolving any contradiction rather than layering over it
- [ ] 11.5 Note that `openspec/config.yaml` still names `docs/api-spec.yml` as the contract, and that it remains stale until its own ticket addresses it

## 12. Close out

- [ ] 12.1 Answer design open question 2 (automatic re-linking of a moved folder) or record it as deferred with its owner
- [ ] 12.2 Answer design open question 3 (attempt history as timeline or count) against what US-34 actually needs
- [ ] 12.3 Confirm with `define-backend-stack` that its stand-in-dependent observations now hold against the real store, and update its ADR if any changed
- [ ] 12.4 Create follow-up items for anything this spike revealed, linked to epic E13 (JOS-177)
- [ ] 12.5 Record time spent, to calibrate future spikes
- [ ] 12.6 Obtain review by at least one human, not only AI agents
