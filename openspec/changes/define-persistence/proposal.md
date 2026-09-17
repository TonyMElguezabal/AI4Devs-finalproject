# Define persistence for sessions and project files

Linear-Issue: JOS-181

## Why

PRD v1.3 states the behaviour persistence must produce but never the mechanism: progress survives restarts, a request already sent to a provider is resumed or counted as exactly one failed attempt, repeated success confirmations never duplicate results or relaunch a stage, and project files live in per-project folders that never expire. Nothing in the repository decides how any of that is stored — and `docs/data-model.md` still documents twelve entities from an unrelated inherited domain, so the project has no data model of its own.

Until this is settled, US-28 (restart survival), US-29 (idempotent confirmations) and US-30 (local files) cannot be implemented, and US-42a's own restart and idempotency experiments rest on a stand-in it explicitly labels disposable.

## What Changes

- Enumerate the full record set the PRD implies — session, chunk, stage attempt, idempotency key — with the fields each must carry.
- Choose the store, judged against restart safety, idempotency, concurrent per-scene writes and the project's own verification process.
- Decide how records reference the files on disk, and what happens when a project folder is moved or renamed by hand.
- Decide what must be written **before** a provider request is sent, so a restart can resume it rather than lose it.
- Decide whether the readiness queue and the paused marker survive a restart or are rebuilt.
- Decide the schema-versioning approach, since later versions must not alter chunks and intervals already established in existing sessions.
- Rule on whether the mandatory "verify database state" step in `docs/openspec-tasks-mandatory-steps.md` is executable against the chosen store, or whether that document needs revising.
- **Rewrite `docs/data-model.md`** so it describes Vid4You's sessions, chunks and stage attempts instead of inherited content.
- Add a persistence section to `docs/backend-standards.md`, consistent with US-42a.
- No product behaviour ships, and no user-facing capability changes.

## Capabilities

### New Capabilities

- `persistence-foundation`: the guarantees this change establishes about how session state is stored and how it relates to files on disk — a documented data model, write-ahead recording of provider requests, file references that stay valid, and recorded evidence before implementation begins.

The product behaviours this change's prototype exercises remain owned by their own stories and will be specified there: US-28 (restart survival and resumption), US-29 (idempotent confirmations), US-30 (local files and folder naming).

### Modified Capabilities

None. `openspec/specs/` is still empty. The `backend-foundation` capability introduced by the `define-backend-stack` change is not yet archived, so it is not an existing spec this change can modify; the two are complementary and must stay consistent.

## Impact

- **Documentation**: `docs/data-model.md` rewritten end to end; a persistence section added to `docs/backend-standards.md`; a new ADR.
- **Process**: `docs/openspec-tasks-mandatory-steps.md` Step N+1 requires capturing, verifying and restoring database state, and filing a report. If the chosen store is not a database, that step needs amending — this change owns the ruling.
- **Dependency on `define-backend-stack` (JOS-179)**: that change is already In Progress and uses a deliberately disposable persistence stand-in. Its restart and idempotency observations must be revisited against whatever is chosen here, and its answer on whether the database expectation is binding is an input to this change, not an output.
- **Downstream tickets**: unblocks US-28, US-29 and US-30, and informs US-34, whose per-stage provider and attempt diagnostics come from the records defined here.
- **Growth**: the MVP sets no retention limits, so attempt history accumulates without bound. This change records the consequence rather than inventing a limit the PRD does not state.
- **No deployed systems, external APIs or user data are affected.** Experiments run against a stubbed provider, so no credentials are exercised.
