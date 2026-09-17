# Design — Define persistence for sessions and project files

## Context

The PRD describes persistence entirely through observable behaviour. Sessions, chunks, states, result references and errors survive restarts and can be recovered later (§12.1). A repeated success confirmation must not duplicate a result, relaunch the next stage, or add a scene twice (§12.1). A request already sent to a provider is resumed after a restart if the provider still holds its result, and otherwise counts as exactly one failed attempt (§12.1). Project files live in a folder named with the video title plus creation time to the minute, with a counter on collision, are never deleted automatically, and include every temporary-link result saved before its link expires (§12.2). A session is consulted by identifier and shows only its own data (§12.3).

None of that names a mechanism. The repository offers no help either: `docs/data-model.md` documents twelve entities from an unrelated inherited domain, so there is no existing model to extend.

Two couplings matter. `define-backend-stack` (JOS-179) is already In Progress and proves restart resumption and idempotency against a stand-in it labels disposable — those observations must be revisited here. And `docs/openspec-tasks-mandatory-steps.md` assumes a database it can inspect, snapshot and restore; if the chosen store is not one, the process document is wrong rather than the choice.

## Goals / Non-Goals

**Goals:**
- Enumerate the record set the PRD implies, with the fields each record must carry.
- Choose the store and prove it against restart resumption, idempotency, concurrent per-scene writes and same-title folder isolation.
- Define how records reference files on disk, and what survives a folder being moved.
- Replace `docs/data-model.md` with Vid4You's model.
- Rule on whether the mandatory database-verification step is executable as written.

**Non-Goals:**
- Implementing US-28, US-29 or US-30; this change decides the mechanism they will use.
- Choosing the backend framework or ORM conventions beyond what persistence requires (US-42a).
- Inventing retention or size limits; the MVP deliberately sets none.
- Designing the folder naming rule itself, which is already fixed by §12.2 and owned by US-30.

## Decisions

**Decision 1 — Record stage attempts as append-only entries, not counters on the chunk.**
Each attempt carries its stage, sequence within the 1 + 3 budget, provider, outcome (success, transient failure, not-retryable), external request identifier, and queued-versus-executing time.
*Alternatives:* an attempt counter and last-error field on the chunk (rejected: US-34 must show provider and attempts per stage, US-22 must distinguish a fresh automatic cycle after a manual retry, and §10.1 excludes waiting time from the per-phase limit — a counter discards all three).

**Decision 2 — Write the provider request record *before* the request is sent.**
The external request identifier, stage and send time are persisted first; only then is the call made.
*Alternatives:* recording after the response returns (rejected: this is precisely the window §12.1 cares about — a crash between send and response would leave no trace of an in-flight request, making resumption impossible and turning a paid, completed generation into a silent loss).

**Decision 3 — Enforce idempotency with a uniqueness constraint in the store, not an application check.**
A repeated success confirmation collides with an existing record and is rejected by the store.
*Alternatives:* checking "has this already completed?" in application code before writing (rejected: two confirmations arriving concurrently both pass the check and both write; the race is exactly the scenario §12.1 describes).

**Decision 4 — Store file references as paths relative to a recorded project-folder root.**
The session records its folder; artefacts record paths relative to it.
*Alternatives:* absolute paths (rejected: files never expire and folders are named for humans, so a folder will eventually be moved or renamed, invalidating every absolute reference); storing blobs in the store (rejected: §12.2 requires files on disk in per-project folders, and video artefacts are large).

**Decision 5 — Rebuild the readiness queue at startup; persist only the paused marker.**
Queue order is derivable from chunk states and timestamps; the paused marker is a user decision that must not be lost.
*Alternatives:* persisting the queue itself (rejected: it duplicates state that can be derived, and a stale queue after a crash is worse than a rebuilt one); persisting nothing (rejected: a restart would silently resume a session the user paused).

**Decision 6 — Adopt versioned schema migrations from the first commit.**
*Alternatives:* deferring migrations until the schema stabilises (rejected: §11.2 requires that later versions leave chunks and intervals of existing sessions untouched, and files never expire, so long-lived sessions will outlive several schema versions).

**Decision 7 — Prove the choice on the harness from `define-backend-stack` rather than a separate prototype.**
*Alternatives:* an independent prototype (rejected: duplicates the stub provider and risks proving something the backend spike cannot reproduce); waiting for that spike to finish (rejected: the two would deadlock, since its stand-in exists precisely because this decision is open).

## Risks / Trade-offs

- **The backend stack changes after this decision** → Keep the choice expressed through a narrow persistence interface so the store can be re-hosted; run the two spikes together, as their Linear link records.
- **JOS-179's stand-in biases the result** → Its ADR must list which observations depend on the stand-in; this change re-runs those against the real store rather than inheriting them.
- **The data model front-runs stories that own the fields** → Model only fields the PRD names; anything a story invents later is that story's delta, not this one's.
- **Unbounded attempt history** → Record the growth consequence and its rough rate; do not invent a retention rule the PRD excludes.
- **Mandatory verification step may not fit** → If the store is not a database, propose an amendment to `docs/openspec-tasks-mandatory-steps.md` rather than quietly skipping the step.
- **A folder moved by hand still breaks references** → Relative paths survive a folder *rename in place*; a folder moved elsewhere needs its recorded root updated. State the limit explicitly rather than implying durability the design does not provide.

## Migration Plan

There is no existing data and nothing deployed, so no migration is required. The first schema version ships with the migration mechanism in place, so later versions have a path that preserves existing sessions.

Rollback is deleting the store and the prototype; no user data exists to lose.

## Open Questions

1. **Is the database expectation binding?** Input from `define-backend-stack` task 1.1, not decided here.
2. **Does a moved project folder need automatic re-linking**, or is updating the recorded root by hand acceptable for a local single-user tool?
3. **Does any consumer need intermediate state transitions**, or only current state? This decides whether attempt history must be queryable as a timeline or only as a count — US-34 suggests a count suffices.
