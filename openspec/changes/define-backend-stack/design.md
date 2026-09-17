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

1. **Are the database and TypeScript expectations binding?** Resolved inside this change by Decision 3; the answer is handed to US-42c.
2. **Is the skeleton kept as the project seed?** Decided at the end, from the evidence.
3. **Does US-42c run alongside this change?** A scheduling decision for the product owner; running apart is permitted but carries the rework risk above.
4. **What speed-factor and per-phase time limits apply?** Out of scope here; they come from US-42d's measurements and US-33's hardcoded values.
