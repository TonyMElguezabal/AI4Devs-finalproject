# Tasks — Define the backend stack

Timebox: 2 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-179-define-backend-stack` from `main` — **substituted:** the user explicitly directed this work to continue on the already-created `feature/entrega-2-JAME` instead; that instruction was treated as authoritative over this generic branch-naming convention rather than creating a second, competing branch
- [x] 0.2 Verify branch creation and current branch status — verified: `feature/entrega-2-JAME`, pushed to `origin`

## 1. Gate: Resolve the binding constraints before any scoring

- [x] 1.1 Determine whether the database expectation in `docs/openspec-tasks-mandatory-steps.md` is binding for Vid4You or inherited from the template — **adapted, not discarded**: the document is itself inherited template content, but PRD §12.1 (C6/C7) independently requires inspectable durable state; "database" generalizes to "persisted state," no RDBMS assumed. See `design.md` Open Question 1.
- [x] 1.2 Determine whether the TypeScript signal in the project Definition of Done (VineJS/Zod validation, OpenAPI generation) is binding or inherited — **not binding**: no such document exists anywhere in this repository; confirmed with the product owner (2026-09-25) it is not a real external constraint. Downgraded from a must-pass gate to a scored preference (folded into the testability criterion in §2.3). See `design.md` Open Question 1.
- [x] 1.3 Record the answer with its reasoning; this decides whether non-TypeScript candidates are admissible at all — recorded in `design.md` Open Question 1. Non-TypeScript candidates (Python, Go) remain admissible.
- [x] 1.4 Hand the recorded answer to US-42c (JOS-181) so persistence is not boxed in by an unexamined assumption — recorded in `design.md`; JOS-181 is not boxed into an RDBMS.

## 2. Evaluate candidates

- [x] 2.1 Apply the must-pass gates to each candidate: C1–C7 expressible without fighting the framework, ability to invoke the US-42d media tooling (ffmpeg via subprocess, confirmed in `define-media-assembly`), single-command local start. (OpenAPI generation and typed validation are no longer must-pass gates per §1.2 — they are scored under the testability criterion in 2.3, since all three candidates can satisfy them.) See `design.md` § Candidate Evaluation.
- [x] 2.2 Eliminate candidates failing any gate, recording which gate and why — no candidate eliminated at the gate; all three (Node/Fastify, Python/FastAPI, Go) pass C1–C7, media invocation and single-command start. See `design.md` § Candidate Evaluation.
- [x] 2.3 Score surviving candidates against the weighted criteria (orchestration 30%, concurrency 20%, live push 15%, testability 15%, familiarity 10%, local simplicity 10%) — Node/Fastify 8.80, Python/FastAPI 8.25, Go 7.98. See `design.md` § Candidate Evaluation.
- [x] 2.4 Select the leading candidate and record the runner-up as the documented fallback — **leading: TypeScript + Node.js + Fastify + Zod + `@fastify/swagger`**; **fallback: Python + FastAPI**, triggered only per §4.7. See `design.md` § Candidate Evaluation.

## 3. Build the walking skeleton

- [x] 3.1 Create a throwaway prototype in the leading candidate, outside the product source tree — `skeleton/` under this change folder
- [x] 3.2 Implement the stubbed provider with configurable latency, transient failures, not-retryable failures and duplicate success confirmations — `skeleton/src/provider.ts`
- [x] 3.3 Implement the disposable persistence stand-in, recording explicitly that it does not pre-empt US-42c — `skeleton/src/db.ts` (SQLite via `node:sqlite`); see `skeleton/README.md`
- [x] 3.4 Expose the minimal HTTP surface the experiments need: start a run, read state, trigger a retry — `skeleton/src/routes.ts`
- [x] 3.5 Serve a minimal page that receives pushed state changes, for experiment 4.4 — `skeleton/public/index.html`

## 4. Run the experiments and record evidence

- [x] 4.1 Restart resumption: kill the process mid-call, restart, show the original result picked up; then the unrecoverable case producing exactly one failed attempt — live evidence in `reports/2026-09-25-step-7-curl-manual-testing.md` §5; unit-tested in `skeleton/test/orchestrator.test.ts`
- [x] 4.2 Shared concurrency: with the cap at N, show more than N ready requests across two sessions, exactly N in flight, the rest sent in readiness order, waiting excluded from the per-phase limit — live evidence in `reports/2026-09-25-step-7-curl-manual-testing.md` §6
- [x] 4.3 Retry budget: a transient failure consuming 1 + 3 attempts then landing in `failed`; a not-retryable failure landing in `failed` immediately with no retries — live evidence in `reports/2026-09-25-step-7-curl-manual-testing.md` §3, §7; unit-tested
- [x] 4.4 Live push: a state change reaching the open page without a reload, including reconnection after the restart in 4.1 — `reports/2026-09-25-step-8-e2e-live-push.md`
- [x] 4.5 Idempotency: the same success confirmation delivered twice producing one result and one next-stage launch — live evidence in `reports/2026-09-25-step-7-curl-manual-testing.md` §8; unit-tested
- [x] 4.6 For each experiment record the outcome including failures, the framework-specific machinery required, and any dependence on the persistence stand-in — see the three reports above; no experiment failed
- [x] 4.7 If a must-pass gate fails during the experiments, stop and switch to the documented fallback candidate rather than continuing on paper — not triggered; Node/Fastify passed every experiment

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Confirm no pre-existing test suite exists (the repository has no application code); record this rather than assuming it — confirmed: no test suite existed anywhere in the repository before this change
- [x] 5.2 Write automated tests covering experiments 4.1, 4.3 and 4.5, so the behaviours are repeatable rather than demonstrated once — `skeleton/test/orchestrator.test.ts` (7 tests; also covers the 4.2 concurrency primitive)
- [x] 5.3 Document the test command that runs them — `skeleton/README.md` (`npm test`); isolated-DB form documented in `reports/2026-09-25-step-6-unit-test-and-state-verification.md`

## 6. Run Unit Tests and Verify Persisted State (MANDATORY)

- [x] 6.1 Capture the pre-test state of the persistence stand-in (counts and key records) — see report
- [x] 6.2 Run the targeted tests for the skeleton and capture the pass/fail summary — 7/7 passed
- [x] 6.3 Run the full skeleton suite and record totals, failures and runtime — one cohesive suite; 7 passed, 0 failed, 674ms
- [x] 6.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it — verified equal (0/0/0 before and after, isolated test DB)
- [x] 6.5 Create the report `openspec/changes/define-backend-stack/reports/YYYY-MM-DD-step-6-unit-test-and-state-verification.md` with commands executed, results, pre/post comparison and cleanup actions — done
- [x] 6.6 Mark this step complete only after the tests pass and the report file exists — done

## 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the skeleton backend and confirm it is reachable — done (`/health`)
- [x] 7.2 Exercise the start-run endpoint with curl and verify the response and resulting state — done
- [x] 7.3 Exercise the read-state endpoint with curl and verify it reflects the run — done
- [x] 7.4 Exercise the retry endpoint with curl against a failed stage and verify the attempt count — done
- [x] 7.5 Exercise error cases: unknown identifier, malformed payload, and a not-retryable provider failure — done
- [x] 7.6 Record every command and response, then restore the stand-in to its pre-test state — recorded in `reports/2026-09-25-step-7-curl-manual-testing.md`; demo DB deleted (disposable stand-in, no product data — see report's Cleanup section)

## 8. E2E Testing with Playwright MCP (MANDATORY - applicable, minimal - AGENT MUST EXECUTE)

- [x] 8.1 Ensure the skeleton backend and its minimal page are running — done
- [x] 8.2 Navigate to the page with Playwright MCP `browser_navigate` and snapshot the initial state — **substituted Claude in Chrome** (Playwright MCP unavailable in this session); see `reports/2026-09-25-step-8-e2e-live-push.md`
- [x] 8.3 Trigger a state change server-side and confirm via snapshot that the page updates without a reload — done
- [x] 8.4 Drop the connection, let a change occur, restore it, and confirm the page reaches correct current state — done; surfaced and fixed a real gap in `public/index.html` (see report)
- [x] 8.5 Restore the environment and record the scenarios and outcomes in the change folder — server stopped, demo DB deleted, browser tab closed

## 9. Record the decision

- [x] 9.1 Write the ADR: chosen stack, rejected alternatives with reasons, and the evidence behind each conclusion — `docs/adr/0001-backend-stack.md`
- [x] 9.2 State which observations depend on the disposable persistence stand-in, so US-42c can revisit them — ADR § Evidence, "Dependence on the disposable persistence stand-in"
- [x] 9.3 Record anything the timebox left unproven as an explicit risk — ADR § "Risks left unproven within the timebox"

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 Rewrite `docs/backend-standards.md` for Vid4You: stack, project structure, layering, naming, error handling, validation approach — done, fully replaced
- [x] 10.2 Add API and OpenAPI conventions, plus the testing approach and its commands — done
- [x] 10.3 Add the logging and diagnostics conventions that carry per-stage provider and attempt records (US-34) — done, § Logging and Diagnostics
- [x] 10.4 Verify no inherited template content describing another application remains in the file — verified (`grep` for the previous domain's terms found none; the two mentions of "an unrelated inherited template" are deliberate provenance notes about the rewrite, not residual content)
- [x] 10.5 Note that `openspec/config.yaml` still names `docs/api-spec.yml` and `docs/data-model.md` as the contract and data model, and that both remain stale until their own tickets address them — already recorded in `proposal.md` § Impact (pre-existing); still accurate, no action needed here

## 11. Close out

- [x] 11.1 Decide and state explicitly whether the skeleton becomes the project seed or is discarded — **kept as the project seed.** All five required behaviours were proven live against it (no must-pass gate failed, so the documented fallback was never triggered), and `define-persistence`'s own Decision 7 already plans to prove its persistence choice by extending this exact harness rather than building a separate one — discarding it would force that change to redo work. Physical promotion into `backend/` (the real five-stage model, real persistence) is deferred to JOS-186 rather than done inline here, since it depends on JOS-181's still-open decision. See `docs/adr/0001-backend-stack.md` § Consequences.
- [x] 11.2 Create follow-up items for anything the spike revealed, linked to epic E13 (JOS-177) — **JOS-186** created (bootstrap `backend/` from the skeleton, parented under JOS-177, blocked by JOS-181); comments added to **JOS-167** (US-37, restart/concurrency-accounting risk) and **JOS-183** (US-42e, SSE reconnect-resync finding)
- [x] 11.3 Record time spent, to calibrate future spikes — recorded as an AI-agent session (not a human timesheet): the work spanned two continuous work sessions on 2026-09-25 — gate resolution + candidate scoring (~30 min of agent time), then skeleton build + all five live experiments + reports + ADR + this rewrite (~3–4 hours of agent time). Well under the 2-day human timebox, though not directly comparable to human effort.
- [x] 11.4 Obtain review by at least one human, not only AI agents — **pending.** This cannot be completed by the agent; flagged to the user as the one remaining action before archiving this change.
