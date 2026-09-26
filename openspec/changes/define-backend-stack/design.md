# Design — Define the backend stack

## Context

Vid4You has no application code: the repository holds only the `packages/specboot` tooling, with no root `package.json`. PRD v1.3 specifies product behaviour and is deliberately silent on implementation technology, while `docs/backend-standards.md` still describes an inherited template stack belonging to a different application, complete with file globs pointing elsewhere.

The behaviours that make this choice hard to reverse are not CRUD concerns. A session runs five stages; scenes progress independently; each stage carries a 1 + 3 retry budget with not-retryable failures skipping retries; a hardcoded per-stage limit caps simultaneous provider requests across all sessions, first come first served; a session-wide pause holds new work while sent requests finish; and after a restart an in-flight provider call is either resumed or recorded as exactly one failed attempt. A framework that fights any of these would be expensive to abandon later.

Two constraints come from the repository rather than the PRD: `docs/openspec-tasks-mandatory-steps.md` assumes a database, curl-testable endpoints and Playwright E2E, and the project Definition of Done requires OpenAPI documentation and VineJS/Zod-style validation. Whether those are binding for Vid4You or inherited along with the stale standards docs is unresolved, and it decides whether non-TypeScript candidates are admissible at all.

## Goals / Non-Goals

**Goals:**
- Choose the backend language, runtime and framework, with the rejected alternatives and the reasoning recorded.
- Prove the choice against the four behaviours hardest to retrofit — retry budget, shared concurrency cap, restart resumption, idempotency — plus a live push to an open page.
- Leave `docs/backend-standards.md` describing Vid4You.
- Answer the database/TypeScript question so US-42c is not boxed in by an unexamined assumption.

**Non-Goals:**
- Choosing the persistence engine or schema (US-42c), the frontend stack (US-42b), the live-update mechanism (US-42e), the media tooling (US-42d) or the AI providers (US-33).
- Building any product feature. No PRD acceptance criterion is satisfied by this change.
- Setting non-functional targets; none exist yet (PRD §15 gap 9, US-41).
- Any deployment or hosting concern beyond a local single-user install.

## Decisions

**Decision 1 — Evaluate with a walking skeleton, not a comparison matrix.**
Build a throwaway prototype in the leading candidate and make it perform the actual hard behaviours.
*Alternatives:* a paper comparison of frameworks (rejected: restart resumption and idempotency cannot be judged from documentation, and they are exactly where frameworks differ); a full implementation of one story (rejected: it would front-run stories whose specs do not exist and cost far more than the timebox).

**Decision 2 — Drive the skeleton with a stubbed provider, never a real one.**
The stub exposes configurable latency, transient failures, not-retryable failures and duplicate success confirmations.
*Alternatives:* real provider APIs (rejected: costs money, needs keys this change deliberately does not exercise, and is non-deterministic, which makes the retry and idempotency experiments unrepeatable).

**Decision 3 — Answer the database/TypeScript question before scoring, not after.**
It is a gate, not a tiebreaker: if those expectations are binding, non-TypeScript candidates are inadmissible and the evaluation is far narrower.
*Alternatives:* scoring all candidates first and applying the constraint at the end (rejected: wastes most of a two-day timebox evaluating candidates that may be ineligible).

**Decision 4 — Use a deliberately disposable persistence stand-in.**
Restart resumption and idempotency cannot be demonstrated without *some* durable store, but choosing one belongs to US-42c. The skeleton uses the simplest durable mechanism that proves the behaviour, and the ADR records it as a stand-in with no bearing on US-42c.
*Alternatives:* waiting for US-42c (rejected: the two spikes would deadlock, since US-42c's own experiments assume a backend); picking the real store here (rejected: it pre-empts a decision with its own criteria and evidence).

**Decision 5 — Prototype the leading candidate only, with a documented fallback trigger.**
If it fails a must-pass gate, stop and prototype the runner-up rather than continuing to score on paper.
*Alternatives:* prototyping all three candidates (rejected: does not fit the timebox and yields shallower evidence on each).

**Decision 6 — Record the decision in an ADR unconditionally.**
The spike's own ticket softened this to "if contentious"; this design hardens it, because the choice constrains every implementation story and its reasoning must outlive the people present.

## Candidate Evaluation (2026-09-25)

Per Open Question 1's resolution, OpenAPI generation and typed validation are scored (folded into "testability"), not must-pass gates. Non-TypeScript candidates remain admissible.

### Must-pass gates (C1–C7, media invocation, single-command start)

| Candidate | C1–C7 without fighting the framework | Can invoke ffmpeg (US-42d, a long-running subprocess) | Single-command local start | Result |
|---|---|---|---|---|
| TypeScript/Node (Fastify) | Pass — native async/await, no ORM/DI ceremony forced on the orchestration loop | Pass — `child_process` | Pass — `npm start` | **Admitted** |
| Python (FastAPI) | Pass — `asyncio` is equally expressive | Pass — `subprocess` | Pass — `uvicorn app:app` | **Admitted** |
| Go | Pass — goroutines/channels are a natural fit, if more verbose for a resumable per-scene state machine | Pass — `os/exec` | Pass — single static binary | **Admitted** |

No candidate is eliminated at the gate. `docs/PRD.md` §5–§12.1 (read directly, not only via the ticket's paraphrase) confirm all three can express the five-stage flow, the retry/concurrency/pause rules, and restart resumption; the gate exists to catch a framework that structurally fights these, and none of the three do at this scale (a local, single-user install).

### Weighted scoring

| Criterion | Weight | Node/Fastify | Python/FastAPI | Go |
|---|---|---|---|---|
| Orchestration fit (C1, C2, C5, C6) | 30% | 9 | 8.5 | 8 |
| Shared concurrency & queueing (C3, C4) | 20% | 8.5 | 8.5 | 9 |
| Live push (C8) | 15% | 9 | 8.5 | 8.5 |
| Testability (unit + state verification + curl + E2E, incl. OpenAPI/typed validation) | 15% | 9 | 9.5 | 7 |
| Familiarity & maintenance cost | 10% | 9 | 6 | 5 |
| Local install simplicity (C9) | 10% | 8 | 7 | 9.5 |
| **Weighted total** | | **8.80** | **8.25** | **7.98** |

Reasoning behind the differentiators:
- **Testability**: FastAPI's native OpenAPI + Pydantic generation is the strongest of the three; Fastify + Zod (`fastify-type-provider-zod`, `@fastify/swagger`) is close behind with comparable ceremony; Go needs an added library (e.g. `huma`) and more manual wiring.
- **Familiarity & maintenance cost**: this is scored from repository evidence, not an assumption about the developer — `packages/specboot` is already Node/TypeScript tooling, and `CLAUDE.md`'s "all code must be fully typed" principle is already exercised project-wide in TypeScript. Nothing in the repo evidences Python or Go usage.
- **Local install simplicity**: Go's single static binary needs no runtime install, the strongest score here; Node needs the Node runtime; Python needs a runtime plus virtual-env/dependency management, historically the most failure-prone for "a non-expert can start."
- **Orchestration and concurrency** are close across all three at this scale (a local, single-session-at-a-time-in-practice install) — the real differentiation is ergonomics, not capability: none of C1–C7 is infeasible in any candidate.

### Decision

**Leading candidate: TypeScript + Node.js + Fastify**, with:
- **Zod** for typed request/response validation, via `fastify-type-provider-zod`.
- **`@fastify/swagger`** (+ `@fastify/swagger-ui`) for generated OpenAPI documentation.
- A plain in-process orchestrator (no external queue/broker such as Redis/BullMQ) — the per-stage concurrency cap and retry budget are implemented as an in-memory scheduler backed by the persistence stand-in, since a broker is unnecessary ceremony for a local single-user install (C9) and would itself need proving under C6/C7.
- Chosen over AdonisJS (heavier ORM/CLI ceremony not needed by an orchestration-first backend) and NestJS (DI/module ceremony adds friction to a background-scheduler-shaped problem that isn't primarily request/response CRUD).

**Documented fallback: Python + FastAPI**, activated only if the Fastify skeleton fails a must-pass gate during the experiments (tasks.md §4.7). FastAPI's async orchestration and OpenAPI/validation story are close enough to Node's that switching costs no further scoring effort — the same experiments would simply be re-run against it.

**Not selected without a specific failure to justify it: Go.** It scores respectably (7.98) and is the strongest candidate on local install simplicity and raw concurrency primitives, but it trails on testability ergonomics (weakest OpenAPI/validation story of the three) and there is no familiarity signal for it in this repository, unlike TypeScript.

## Risks / Trade-offs

- **Skeleton gold-plating** → The timebox is two working days and the skeleton is explicitly throwaway unless the disposition decision keeps it; nothing in it is polished for production.
- **The persistence stand-in leaks into the decision** → The ADR must state which observations depend on the stand-in, so US-42c can revisit them rather than inherit them silently.
- **Sequencing with US-42c causes rework** → The two are linked in Linear; running them together or back-to-back is recommended, and this risk is accepted explicitly if they run apart.
- **The "TypeScript is assumed" signal proves wrong late** → Decision 3 moves it to the front, before any scoring effort is spent.
- **Evidence is thin at the timebox edge** → The decision is still recorded at the end of the timebox, and whatever was not proven is written down as a risk rather than left implicit.
- **Mandatory task steps may not fit the chosen stack** → If the stack implies no database, `docs/openspec-tasks-mandatory-steps.md` needs revising; the ruling is US-42c's, and this change only surfaces the conflict.

## Migration Plan

Nothing is deployed and there is no existing system to migrate. Two outcomes are possible:
- **Skeleton kept** — it becomes the project seed, introducing the first application code and toolchain. Rollback is deleting the directory; no data or users are affected.
- **Skeleton discarded** — only the ADR and the rewritten `docs/backend-standards.md` remain.

The disposition must be stated explicitly rather than left to drift.

## Open Questions

1. **Are the database and TypeScript expectations binding?** Resolved (2026-09-25):
   - **The "database" expectation is adapted, not discarded.** `docs/openspec-tasks-mandatory-steps.md` is itself inherited template content, from the same unrelated-project template family as the pre-rewrite `docs/backend-standards.md` and `docs/data-model.md`, so its literal CRUD/RDBMS framing does not bind Vid4You. But the principle behind it — durable state must be inspectable before and after a test — is independently required by PRD §12.1 (C6 restart resumption, C7 idempotency) regardless of the template. Verification steps in this change's `tasks.md` generalize "database state" to "persisted state" accordingly; no RDBMS is assumed.
   - **The VineJS/Zod + OpenAPI "project Definition of Done" is not binding.** No such document exists anywhere in this repository (checked `openspec/config.yaml`, `docs/base-standards.md`, `CLAUDE.md`, `ai-specs/`); it appears only as phrasing inside JOS-179's own ticket text, and the product owner confirmed (2026-09-25) it does not reflect a real, external constraint on Vid4You. It is downgraded from a must-pass gate to a strong preference. Note also that even taken at face value it would not have excluded Python: FastAPI's native OpenAPI + typed-validation story is at least as strong as VineJS's, so "OpenAPI + typed validation" does not imply TypeScript.
   - **Consequence:** Section 2's must-pass gates drop the hard TypeScript-only admissibility test; OpenAPI generation and typed validation remain scored criteria (already covered by the weighted criteria in `tasks.md` §2.1) that TypeScript, Python and Go candidates can all satisfy. This answer is handed to US-42c (JOS-181) so persistence is not boxed into an RDBMS by an unexamined assumption.
2. **Is the skeleton kept as the project seed?** Decided at the end, from the evidence.
3. **Does US-42c run alongside this change?** A scheduling decision for the product owner; running apart is permitted but carries the rework risk above.
4. **What speed-factor and per-phase time limits apply?** Out of scope here; they come from US-42d's measurements and US-33's hardcoded values.
