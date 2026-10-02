# ADR 0001 — Backend language, runtime and framework

- Status: Accepted
- Date: 2026-09-25
- Change: `define-backend-stack` (JOS-179, US-42a)
- This is the first ADR in this repository; `docs/adr/` is established here as the convention going forward.

## Context

Vid4You had no application code and no chosen backend technology. PRD v1.3 (`docs/PRD.md`) specifies product behaviour and is deliberately silent on implementation. The behaviours that make this choice hard to reverse are not CRUD concerns:

- **C1** — five stages per session, scenes progress independently, one failed scene does not stop the others (§5, §8.1, §10.2)
- **C2** — a bounded retry budget: 1 initial attempt + up to 3 automatic retries per stage; not-retryable failures skip retries; a manual retry starts a fresh cycle (§10.1, §10.2)
- **C3** — a hardcoded maximum of simultaneous provider requests **per stage, shared across all sessions**, first come first served; waiting counts as neither a failed attempt nor execution time (§10.1)
- **C4** — hardcoded per-phase maximum execution times (§10.1)
- **C5** — a session-wide pause holds not-yet-launched work; requests already sent run to completion (§9)
- **C6** — restart safety: an in-flight provider request is resumed if the provider still holds its result, otherwise recorded as exactly one failed attempt (§12.1)
- **C7** — idempotency: a repeated success confirmation must not duplicate a result, relaunch the next stage, or add a scene twice (§12.1)
- **C8** — live push of state changes to an open page, without reloading (§8.3)
- **C9** — a local, single-user install; no accounts or authentication; provider credentials from the environment or a local secrets file (§12.3, §2.1, §11)
- **C10** — the stack must drive the media-assembly step chosen in `define-media-assembly` (JOS-182): confirmed there to be ffmpeg, invoked as a long-running subprocess

Two additional expectations were carried over from this repository's inherited template (`docs/openspec-tasks-mandatory-steps.md`, the pre-rewrite `docs/backend-standards.md`) rather than stated by the PRD: an assumed database, and an assumed TypeScript/OpenAPI/typed-validation "Definition of Done." Resolving whether these were binding was this change's first gate (see Decision 1 below), because it determines whether non-TypeScript candidates are admissible at all.

## Decision

**Adopt TypeScript + Node.js + Fastify**, with:
- **Zod** for typed request/response validation (`fastify-type-provider-zod`)
- **`@fastify/swagger`** + **`@fastify/swagger-ui`** for generated OpenAPI documentation
- A plain in-process scheduler for the per-stage concurrency cap and retry budget — no external queue/broker (Redis, BullMQ): unnecessary ceremony for a local single-user install (C9), and it would itself need proving under C6/C7
- **SQLite via Node's built-in `node:sqlite`** as the persistence mechanism for the final implementation's starting point — chosen over a native-addon driver (`better-sqlite3`) after the latter's native build failed against this environment's Node/V8 headers during the spike (§ Evidence below); `node:sqlite` needed zero compilation

**Documented fallback: Python + FastAPI**, to be activated only if the Fastify implementation is later found to fail a must-pass gate (none did during this spike).

**Not selected: Go.** Scored respectably (see below) but trails on OpenAPI/typed-validation ergonomics (the weakest of the three, needing an added library) and has no familiarity signal anywhere in this repository.

## Decision 1 — Are the inherited "database" and "TypeScript DoD" expectations binding?

Resolved before any scoring (2026-09-25), because it decides whether non-TypeScript candidates are admissible:

- **The "database" expectation is adapted, not discarded.** `docs/openspec-tasks-mandatory-steps.md` is itself inherited template content, from the same unrelated-project template family as the pre-rewrite `docs/backend-standards.md` and `docs/data-model.md` (confirmed: both described an unrelated inherited domain, not Vid4You's). Its literal CRUD/RDBMS framing does not bind Vid4You. But the *principle* behind it — durable state must be inspectable before and after a test — is independently required by PRD §12.1 (C6, C7) regardless of the template. "Database state" is read as "persisted state" throughout this change; no RDBMS is assumed.
- **The VineJS/Zod + OpenAPI "project Definition of Done" is not binding.** No such document exists anywhere in this repository (checked `openspec/config.yaml`, `docs/base-standards.md`, `CLAUDE.md`, `ai-specs/`); it appeared only as phrasing inside JOS-179's own ticket text. Confirmed with the product owner (2026-09-25) that it does not reflect a real, external constraint on Vid4You. Downgraded from a must-pass gate to a scored preference (folded into "testability" below). Note also that, taken at face value, it would not have excluded Python: FastAPI's native OpenAPI + typed-validation story is at least as strong as VineJS's — "OpenAPI + typed validation" does not imply TypeScript.
- **Consequence:** all three candidates (TypeScript/Node, Python, Go) remained admissible through scoring. This answer is handed to `define-persistence` (US-42c, JOS-181) so persistence is not boxed into an RDBMS by an unexamined assumption.

## Decision 2 — Candidate evaluation

### Must-pass gates

| Candidate | C1–C7 without fighting the framework | Can invoke ffmpeg (C10) | Single-command local start | Result |
|---|---|---|---|---|
| TypeScript/Node (Fastify) | Pass | Pass (`child_process`) | Pass (`npm start`) | **Admitted** |
| Python (FastAPI) | Pass | Pass (`subprocess`) | Pass (`uvicorn`) | **Admitted** |
| Go | Pass | Pass (`os/exec`) | Pass (static binary) | **Admitted** |

No candidate was eliminated at the gate — none structurally fights C1–C7 at this scale (a local, single-user install).

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

- **Testability**: FastAPI's native OpenAPI + Pydantic generation is the strongest of the three; Fastify + Zod is close behind; Go needs an added library (e.g. `huma`) and more manual wiring.
- **Familiarity & maintenance cost**: scored from repository evidence, not an assumption — `packages/specboot` is already Node/TypeScript tooling, and `CLAUDE.md`'s "all code must be fully typed" principle is already exercised project-wide in TypeScript. Nothing in the repo evidences Python or Go usage.
- **Local install simplicity**: Go's static binary needs no runtime install; Node needs the Node runtime; Python needs a runtime plus virtual-env/dependency management — historically the most failure-prone path for "a non-expert can start."
- Orchestration and concurrency are close across all three at this scale; the real differentiation is ergonomics, not raw capability.

**Chosen: Node/Fastify.** Chosen over AdonisJS (heavier ORM/CLI ceremony not needed by an orchestration-first backend) and NestJS (DI/module ceremony adds friction to a background-scheduler-shaped problem that isn't primarily request/response CRUD) as the specific Node framework.

## Evidence — walking skeleton (Decision 1 of the design doc: prove it, don't just score it)

A throwaway prototype (`openspec/changes/define-backend-stack/skeleton/`) was built against a deterministic, in-process stubbed provider (no real provider, no API keys, no cost) and driven through all five required experiments, live against the running process (not only unit-tested):

| Experiment | Result | Evidence |
|---|---|---|
| **Restart resumption** (C6) — kill mid-call, restart, resume | **Proven.** Genuine mid-flight `kill -9` + restart; original result resumed from its original send time, not restarted from zero. Separately, an unrecoverable request was reconciled into exactly one failed attempt, not a silent loss or a duplicate. | `reports/2026-09-25-step-7-curl-manual-testing.md` §5 |
| **Shared concurrency cap** (C3) — cap N, >N ready requests across two sessions | **Proven.** Cap=2, two sessions, 4 ready requests → exactly 2 in flight, the rest queued at 0 attempts (waiting excluded from budget/time), released in FIFO submission order. | same report, §6 |
| **Retry budget** (C2) | **Proven.** Transient failure: 1+3 attempts then `failed`. Not-retryable: `failed` immediately after 1 attempt. | same report, §3, §7 |
| **Live push** (C8) | **Proven, and since confirmed as the real decision, not a stand-in.** SSE update rendered with no reload (confirmed via a status marker only set inside the message handler). `define-live-updates` (JOS-183) independently scored SSE against WebSocket and polling and confirmed it on the merits — see `docs/adr/0003-live-updates.md`. | `reports/2026-09-25-step-8-e2e-live-push.md`; confirmed by `docs/adr/0003-live-updates.md` |
| **Idempotency** (C7) | **Proven at the time, but by an accident of this stack, not by construction — corrected by `define-persistence`.** The original guard was an application-level check-then-act (`if (req.resolved) return`), safe only because `node:sqlite`'s calls are synchronous and Node is single-threaded. `define-persistence` (JOS-181) replaced it with a real store-level uniqueness constraint (a `scene_results` table, `scene_id PRIMARY KEY`) — see `docs/adr/0002-persistence.md` Decision 3. | `reports/2026-09-25-step-7-curl-manual-testing.md` §8; superseded by `docs/adr/0002-persistence.md` |

All five experiments are also covered by automated tests (`skeleton/test/orchestrator.test.ts`, 7 passing at the time this ADR was first written; `define-persistence` later added `test/persistence.test.ts` alongside it — 18 passing in total, see `docs/adr/0002-persistence.md`) so the behaviours are repeatable, not one-off demonstrations (`reports/2026-09-25-step-6-unit-test-and-state-verification.md`).

**A real gap was found and fixed during E2E testing (task 8.4):** the live-push page originally fetched state only once, on load. Since SSE has no backlog, a browser reconnect after a dropped connection (as happens on a backend restart) could land on stale state forever with no visible symptom. Fixed by resyncing on every `EventSource.onopen` (fires on first connect and every automatic reconnect), then re-verified live. This is exactly the class of finding a walking skeleton is meant to surface before it reaches an implementation story — see `reports/2026-09-25-step-8-e2e-live-push.md` for the full account.

**Dependence on the disposable persistence stand-in (Decision 4 of `design.md`) — resolved:** `define-persistence` (JOS-181) has since run, confirming `node:sqlite` as the real persistence engine (not just a stand-in) on its own independently-scored merits (`docs/adr/0002-persistence.md`). Restart resumption held as evidence unchanged; idempotency did not — see the corrected row above. The mechanism proven here (persist enough to recompute "did the provider resolve this?" without relying on in-memory timers) remains the actual, engine-agnostic finding for restart resumption.

**Environment note (not a finding about the stack):** `better-sqlite3`'s native addon failed to compile against this session's Node/V8 headers; Node's built-in `node:sqlite` was used instead with zero native compilation. This is itself weak positive evidence for Node's local-install-simplicity score, since the built-in module avoided a real, encountered installation failure mode entirely.

## Risks left unproven within the timebox

- **Per-phase maximum execution time (C4)** was not exercised as a dedicated experiment — it was not one of the five required experiments, and the skeleton does not implement a timeout enforcement path. This is a risk for the implementation story to prove, not this spike.
- **Concurrency accounting immediately after a restart** is a known simplification: the in-memory semaphore resets to zero on restart, so truly in-flight legacy requests are briefly invisible to the concurrency cap until reconciliation processes them. Not exercised by the 5 required experiments; worth a dedicated check when this becomes real implementation.
- **The Playwright MCP tool named by `docs/openspec-tasks-mandatory-steps.md` was unavailable in this session.** Claude in Chrome was substituted for equivalent agent-executed, real-browser E2E coverage — noted so a future run with Playwright available isn't treated as contradicting this evidence.

## Consequences

- `docs/backend-standards.md` is rewritten (this change) to describe this stack, replacing the inherited, unrelated template content.
- Every backend implementation story follows `docs/backend-standards.md` rather than choosing technology per ticket (per the `backend-foundation` capability spec, `specs/backend-foundation/spec.md`).
- `define-persistence` (US-42c) is unblocked and not boxed into an RDBMS (Decision 1 above).
- The skeleton's disposition (kept as the project seed, or discarded) is decided in `tasks.md` §11.1.
