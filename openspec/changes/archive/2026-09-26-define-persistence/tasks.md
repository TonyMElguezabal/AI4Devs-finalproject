# Tasks — Define persistence for sessions and project files

Timebox: 2 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk.

Runs alongside `define-backend-stack` (JOS-179) and reuses its prototype harness rather than building a second one. Task 1.1 is an input *from* that change, not a duplicate of it.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-181-define-persistence` from `main` — **substituted:** continuing on the user-directed `feature/entrega-2-JAME`, per the same precedent recorded in the three sibling changes' `tasks.md` §0.1
- [x] 0.2 Verify branch creation and current branch status — verified: `feature/entrega-2-JAME`

## 1. Gate: Collect the inputs this decision depends on

- [x] 1.1 Take the ruling from `define-backend-stack` task 1.1 on whether the database expectation in `docs/openspec-tasks-mandatory-steps.md` is binding or inherited from the template — taken as decided; recorded in `design.md` § Execution Record §1
- [x] 1.2 Take the chosen backend language and runtime from that change, since it bounds which stores are viable — Node.js + TypeScript; recorded
- [x] 1.3 List which of that change's restart and idempotency observations depend on its disposable persistence stand-in, and must therefore be re-proven here — **restart resumption confirmed** (same store wins independently); **idempotency has a genuine gap**, not just a re-proof — the existing mechanism is an application-level check-then-act, safe today only by accident of synchronous execution, and is fixed with a real store constraint in §4.3. See `design.md` § Execution Record §1.
- [x] 1.4 Record what is still undecided at this point, so later conclusions can be traced to what was known — recorded

## 2. Enumerate the record set from the PRD

- [x] 2.1 Derive the session record and its fields from PRD §3, §4.1, §8.1 and §12.2, including title, script, selected language, state, paused marker and project folder — recorded in `design.md` § Execution Record §2; `language` and `project folder` added this change, `script` deliberately not modelled (no consumer)
- [x] 2.2 Derive the chunk record from §3, §6 and §8.2: ID, PROMPT, IMAGE, VIDEO, narration interval, chunk state, requested duration, speed factor and warning — recorded; narration interval/duration/speed-factor deliberately not modelled (owned by the real media pipeline, not this skeleton)
- [x] 2.3 Derive the stage attempt record from §10.1, §10.3 and §11: stage, sequence within the 1 + 3 budget, provider, outcome class, external request identifier, queued and executing times — recorded; already modelled by `define-backend-stack`
- [x] 2.4 Derive the artefact record from §12.2 and §12.3: kind, path relative to the project folder, and which stage produced it — recorded; implemented as relative-path columns on the scene record rather than a separate table (see `design.md` § Execution Record §2 for why)
- [x] 2.5 Confirm every field traces to a PRD section, and drop any field that does not — done; every "not modelled" row in the § Execution Record §2 tables states why
- [x] 2.6 Note which fields exist only to serve US-34 diagnostics, so their cost is visible — none added beyond the already-existing `provider`/`attempts` columns

## 3. Choose the store

- [x] 3.1 Define the must-pass gates: uniqueness constraints, durable writes before a provider call returns, concurrent per-scene writes, migrations, and inspectability for the mandatory verification step — recorded in `design.md` § Execution Record §3
- [x] 3.2 Eliminate candidates failing any gate, recording which gate and why — no candidate eliminated at the gate
- [x] 3.3 Score surviving candidates on local single-user simplicity, testability, migration tooling and fit with the chosen runtime — embedded DB 9.20, server DB 6.88, structured files 6.73 (weights stated explicitly since the ticket left them open) — see `design.md` § Execution Record §3
- [x] 3.4 Select the store and record the runner-up as the documented fallback — **selected: embedded SQLite via `node:sqlite`** (confirms the existing stand-in on the merits); **fallback: server DB (Postgres)** — structured files scored honestly but explicitly not chosen as fallback since it loses on the exact guarantees this change must prove

## 4. Build the persistence layer on the existing harness

- [x] 4.1 Add the chosen store to the `define-backend-stack` prototype, replacing its disposable stand-in — n/a in the "replace" sense: `node:sqlite` is confirmed as the real choice (§3), so there is no swap; the stand-in *becomes* the decision
- [x] 4.2 Implement the schema for sessions, chunks, stage attempts and artefacts from group 2 — `runs.language`, `runs.project_folder` added; artefacts implemented as relative-path columns on the scene record (see `design.md` § Execution Record §2 for why not a separate table)
- [x] 4.3 Implement the uniqueness constraint that rejects a repeated success confirmation (Decision 3) — **real fix, not just re-proof:** added a `scene_results` table with `scene_id` as `PRIMARY KEY`; `commitSceneResult()` is the actual gate for "does this delivery get to complete the scene / launch the next stage", not the pre-existing app-level `resolved` flag check. Verified live via curl (duplicate delivery after a real success: `applied:false`, `scene_results` count stays 1) and in `test/persistence.test.ts`.
- [x] 4.4 Implement write-ahead recording of a provider request before it is sent (Decision 2) — already implemented in `define-backend-stack` (`insertProviderRequest` before `setTimeout`/delivery is armed); confirmed still correct against the real store
- [x] 4.5 Implement file references relative to the session's recorded project folder (Decision 4) — real project folders now created on disk (`data/projects/<title> <YYYY-MM-DD HH-mm>`), real placeholder artefact files written and referenced by relative path; verified live via curl
- [x] 4.6 Implement startup reconstruction of the readiness queue, restoring only the paused marker (Decision 5) — already implemented (`reconcileOnBoot` rebuilds from persisted scene status; `runs.paused` is the only persisted control-plane state); confirmed unaffected by this change's schema additions
- [x] 4.7 Set up the migration mechanism and commit the first schema version (Decision 6) — `applyMigrationsTo()` + `schema_migrations` table; migration 2 (`language`, `project_folder`) is the first real migration, proven against a version-1 fixture in `test/persistence.test.ts`

## 5. Run the experiments and record evidence

- [x] 5.1 Restart resumption: kill the process between send and response, restart, show the recorded request identified with its stage and provider — genuine mid-flight `kill -9`, `stillPending:1` on restart, recovered result matches; `provider_requests` joined to `scenes.provider` identifies stage ("image") and provider ("stub-image-provider"). See `reports/2026-09-25-step-8-curl-endpoint-testing.md`.
- [x] 5.2 Unrecoverable case: the same scenario where the provider no longer holds the result, producing exactly one failed attempt and no duplicate — `recordedFailedAttempt:1`, attempts went 1→2, auto-retry launched, no duplicate
- [x] 5.3 Idempotency: the same success confirmation delivered twice, and two delivered concurrently, each producing one result and one next-stage launch — live curl (duplicate after real success: `applied:false`, `scene_results` count stays 1) + `test/persistence.test.ts` (store-level, both sequential-duplicate and back-to-back "concurrent" cases)
- [x] 5.4 Concurrent writes: several scenes completing at once without lost updates or interleaved corruption — 20 scenes, 50ms latency each, all completed; each scene's own instruction and result path verified individually (no cross-contamination); `scene_results` count for the session = 20 exactly
- [x] 5.5 Same-title isolation: two sessions sharing a title, each resolving only to its own folder — live: `Twin Title 2026-09-25 15-55` and `Twin Title 2026-09-25 15-55 (2)`, distinct and both present on disk
- [x] 5.6 Folder rename: rename a project folder in place, update the recorded root, confirm every artefact reference still resolves — live: `mv`'d the directory to `Renamed By Hand`, called `setRunProjectFolder`, the scene's stored relative path (`scene-1.png`) resolved correctly and read back its original content under the new root
- [x] 5.7 Migration: apply a second schema version and confirm an existing session's chunks and intervals are unchanged (§11.2) — `test/persistence.test.ts`: a version-1 fixture DB's pre-existing run/scene rows are untouched after migration 2 runs; new columns get safe defaults; re-applying is a no-op
- [x] 5.8 For each experiment record the outcome including failures, and any behaviour that required store-specific machinery — all seven passed; the idempotency guarantee (5.3) specifically required store-specific machinery (a `PRIMARY KEY` constraint) — an app-only check would not have satisfied it, which is the change's central finding (see `design.md` § Execution Record §1)
- [x] 5.9 If a must-pass gate fails during the experiments, stop and switch to the documented fallback rather than continuing on paper — not triggered; embedded SQLite passed every experiment

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Confirm whether a test suite exists at this point, including any added by `define-backend-stack`; record the finding rather than assuming it — confirmed: `skeleton/test/orchestrator.test.ts` (11 tests, from JOS-179) already existed
- [x] 6.2 Update any tests that asserted against the disposable stand-in, so they now run against the real store — the existing tests already assert against the real field names/states (renamed during the JOS-183/180 contract work in this same session); no test asserted against anything specific to the stand-in status that needed changing
- [x] 6.3 Write automated tests covering experiments 5.1, 5.2, 5.3 and 5.7, so the behaviours are repeatable rather than demonstrated once — `skeleton/test/persistence.test.ts` (7 new tests): store-enforced idempotency (5.3), project-folder naming/isolation (5.5, feeding 5.1's context), migration-survival against a version-1 fixture (5.7). 5.1/5.2 (restart) were already covered by `orchestrator.test.ts` and are re-confirmed live in the Step 8 report.
- [x] 6.4 Document the test command that runs them — `DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects npx vitest run` (documented in the Step 7 report and `docs/backend-standards.md`'s persistence section)

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test state of the store (counts and key records per table or collection) — neither the test DB nor test-projects folder existed
- [x] 7.2 Run the targeted persistence tests and capture the pass/fail summary — 7/7 passed
- [x] 7.3 Run the full prototype suite and record totals, failures and runtime — 18/18 passed, ~1.1s; run twice in a row to prove a fix (see below)
- [x] 7.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it — verified (isolated test state, disposable by design; see report)
- [x] 7.5 Create the report `openspec/changes/define-persistence/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions — done
- [x] 7.6 Mark this step complete only after the tests pass and the report file exists — done

**Finding during this step:** `resetAll()` wiped database rows but not the real project folders tests create on disk — a second full-suite run without wiping state failed on folder-collision-counter mismatches. Fixed (`resetAll()` now also wipes `PROJECTS_ROOT`) and verified by running the suite twice in a row afterward.

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

Applicable: the prototype exposes the minimal HTTP surface built by `define-backend-stack` task 3.4, and these calls are how persistence is exercised end to end.

- [x] 8.1 Start the prototype backend against the real store and confirm it is reachable — done
- [x] 8.2 Capture the store's state before any request is made — neither `data/skeleton.sqlite` nor `data/projects/` existed
- [x] 8.3 POST to start a run, verify the response and that the session, chunks and initial attempt records were written — done; a real project folder + placeholder artefact file were also created
- [x] 8.4 GET the run state, verify it reflects the stored records rather than in-memory state — done; `result.imageUrl` is a real path to a real file
- [x] 8.5 POST a duplicate success confirmation and verify the store rejects it, leaving one result — done; `scene_results` stays at 1
- [x] 8.6 POST a retry against a failed stage and verify a new attempt row appends rather than overwriting — done; two distinct `provider_requests` rows with different ids
- [x] 8.7 Exercise error cases: unknown session identifier, malformed payload, and a write violating the uniqueness constraint — done (404, 400, and the store-level constraint proof)
- [x] 8.8 Record every command and response, then restore the store to its pre-test state and verify the restoration — done; `data/skeleton.sqlite`, `data/projects/` and the isolated test artifacts all deleted, verified empty
- [x] 8.9 Save the transcript as `openspec/changes/define-persistence/reports/YYYY-MM-DD-step-8-curl-endpoint-testing.md` — done; also carries live evidence for experiments 5.1–5.6

## 9. E2E Testing with Playwright MCP (NOT APPLICABLE)

- [x] 9.1 Record that this step does not apply: the change touches no UI and adds no user workflow. The prototype's minimal page belongs to `define-backend-stack`, whose task 8 already covers it, and nothing here changes what that page shows. Frontend work is owned by US-42b (JOS-180) — confirmed not applicable, as stated

## 10. Record the decision

- [x] 10.1 Write the ADR: chosen store, rejected alternatives with reasons, and the evidence behind each conclusion — `docs/adr/0002-persistence.md`; `docs/adr/0001-backend-stack.md` updated to point here for the corrected idempotency mechanism
- [x] 10.2 Record the ruling on whether the mandatory database-verification step is executable against the chosen store, and raise an amendment to `docs/openspec-tasks-mandatory-steps.md` if it is not — **executable as written, no amendment needed**; confirmed in `reports/2026-09-25-step-7-unit-test-and-db-verification.md` and recorded in the ADR
- [x] 10.3 State the attempt-history growth rate observed, and that no retention rule is being invented (the MVP sets none) — recorded in the ADR § Growth and Limitations
- [x] 10.4 State the folder-move limitation explicitly: relative references survive a rename in place, but a folder moved elsewhere needs its recorded root updated — recorded in the ADR § Growth and Limitations; proven live in experiment 5.6
- [x] 10.5 Record anything the timebox left unproven as an explicit risk — recorded in the ADR § "Risks left unproven within the timebox"

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Rewrite `docs/data-model.md` for Vid4You: sessions, chunks, stage attempts and artefacts, with their relationships and the PRD section each field comes from — done, fully replaced
- [x] 11.2 Verify no entity from the unrelated inherited domain remains in that file — verified (only a generic provenance note about the replaced content remains, per the same convention used in `docs/backend-standards.md`)
- [x] 11.3 Add a persistence section to `docs/backend-standards.md`: store, migration workflow, transaction and uniqueness conventions, and how tests isolate state — done; also corrected the "not yet decided" and TBD references elsewhere in that file now that this change has landed
- [x] 11.4 Confirm the result stays consistent with what `define-backend-stack` wrote to the same file, resolving any contradiction rather than layering over it — resolved: `docs/adr/0001-backend-stack.md`'s idempotency row and stand-in note were updated to point here rather than left contradicting the corrected mechanism
- [x] 11.5 Note that `openspec/config.yaml` still names `docs/api-spec.yml` as the contract, and that it remains stale until its own ticket addresses it — already recorded in `define-backend-stack`'s `proposal.md` § Impact (pre-existing); still accurate, no action needed here

## 12. Close out

- [x] 12.1 Answer design open question 2 (automatic re-linking of a moved folder) or record it as deferred with its owner — **answered: no automatic re-linking**; updating the recorded root by hand is accepted for a local single-user tool, proven sufficient in experiment 5.6. Recorded in `design.md` § Open Questions and the ADR.
- [x] 12.2 Answer design open question 3 (attempt history as timeline or count) against what US-34 actually needs — **answered: a count** (the scene's `attempts` field) is what's exposed today; the full timeline remains queryable in `provider_requests` if a future need arises. Recorded in `design.md` § Open Questions.
- [x] 12.3 Confirm with `define-backend-stack` that its stand-in-dependent observations now hold against the real store, and update its ADR if any changed — confirmed and updated: restart resumption held unchanged; idempotency did **not** and `docs/adr/0001-backend-stack.md` was corrected to point to the real mechanism in `docs/adr/0002-persistence.md`
- [x] 12.4 Create follow-up items for anything this spike revealed, linked to epic E13 (JOS-177) — no new issue needed; **JOS-186** (already linked to E13) updated with this change's outcome, its blocking relation on this ticket removed, and two concrete carry-forward notes added (artefact modelling at multi-stage scale, concurrency scale beyond 20 writes)
- [x] 12.5 Record time spent, to calibrate future spikes — recorded as an AI-agent session (not a human timesheet): continuous work within the same broader session as JOS-179/183/180, focused specifically on this change for roughly 2–3 hours of agent time (analysis, real project-folder + store-constraint implementation, six live experiments, tests, two reports, ADR, two doc rewrites, close-out). Well under the 2-day human timebox.
- [x] 12.6 Obtain review by at least one human, not only AI agents — **pending.** Cannot be completed by the agent; flagged to the user as the one remaining action before archiving this change.
