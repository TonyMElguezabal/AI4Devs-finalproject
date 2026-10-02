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
2. **Does a moved project folder need automatic re-linking**, or is updating the recorded root by hand acceptable for a local single-user tool? — **Answered (2026-09-25): no automatic re-linking.** Updating the recorded root by hand is accepted for a local single-user tool; there is no filesystem-watching or automatic detection. Proven sufficient live in experiment 5.6 (§ Execution Record, `docs/adr/0002-persistence.md` § Growth and Limitations).
3. **Does any consumer need intermediate state transitions**, or only current state? This decides whether attempt history must be queryable as a timeline or only as a count — US-34 suggests a count suffices. — **Answered (2026-09-25): current state (a count) is what's exposed to consumers today** (the scene's `attempts` field). The full append-only timeline still exists in `provider_requests` and is queryable directly if a future story needs it — nothing is lost, but nothing beyond a count is built for US-34 ahead of that need actually arising.

## Execution Record (2026-09-25)

### §1 — Inputs collected

- **Database-expectation ruling (1.1):** taken as decided by `define-backend-stack` task 1.1 — adapted, not discarded. "Database state" reads as "persisted state"; no RDBMS is assumed by that ruling, so this change remains free to choose on the merits.
- **Backend language/runtime (1.2):** Node.js + TypeScript (`docs/adr/0001-backend-stack.md`).
- **Which of JOS-179's stand-in-dependent observations must be re-proven (1.3):**
  - **Restart resumption (C6):** the stand-in *is* `node:sqlite` — the same technology this change independently evaluates below. If it wins on the merits (it does — see § Candidate Evaluation), the mechanism does not change; JOS-179's restart-resumption evidence is confirmed rather than invalidated.
  - **Idempotency (C7) — a genuine gap, not just re-proof.** JOS-179's `handleProviderResult` enforces idempotency with an **application-level check-then-act** (`if (req.resolved) return`), exactly the pattern this change's own Decision 3 and `specs/persistence-foundation/spec.md` reject: "Uniqueness SHALL be enforced by the store itself rather than by a prior read in application code." It happens to be safe *today* only because `node:sqlite`'s API is synchronous and Node is single-threaded, so nothing can interleave between the check and the write — an accidental property of the current code, not a structural guarantee. It would silently break under an async driver or a future refactor. This change fixes it with a real store-level uniqueness constraint (§4 below) rather than merely re-confirming the existing behaviour.
- **What remains undecided (1.4):** real hardcoded values (US-33), the frontend's final shape (US-42b, in progress), the live-update transport's final form (US-42e, in progress) — none block this change.

### §2 — Record derivation

Every field below traces to a PRD section (task 2.5); fields that don't are dropped rather than invented. Columns note what the skeleton already models vs. what this change adds.

**Session** (§3, §4.1, §8.1, §12.2):

| Field | PRD source | Status |
|---|---|---|
| `id` | §3 | Already modelled (`runs.id`) |
| `title` | §3 | Already modelled |
| `script` | §4.2 | **Not modelled** — decomposition isn't simulated by this skeleton (an accepted simplification carried from `define-backend-stack`); adding a real script field with no consumer would be inventing state no story here reads |
| `language` | §4.1 | **Added this change** — a real field with no consumer previously; needed for the data model to be honest even though no decomposition reads it yet |
| `state` (8 values) | §8.1 | Already modelled (derived) |
| `paused` marker | §8.1, §9 | Already modelled |
| project folder | §12.2 | **Added this change** — see Decision 4 below; the skeleton previously produced no real files at all |
| creation timestamp | §12.2 (folder naming) | Already modelled (`createdAt`); now also drives the folder name |
| voice-over / alignment provider bindings, MP3 & timestamp references, total narration duration, failed-phase detail | §8.1, §11.2 | **Not modelled** — these belong to stages (voice, alignment) this single-stage skeleton does not simulate; adding the columns with no writer would be schema for its own sake |

**Chunk / scene** (§3, §6, §7.2, §7.3, §8.2, §10.3):

| Field | PRD source | Status |
|---|---|---|
| `id` (1..N, invariable) | §6 | Already modelled |
| `PROMPT`/`IMAGE`/`VIDEO` instruction | §3, §10.3 | Modelled as one `instruction` field (the skeleton conflates image/video into one stage, per its own scope note) |
| narration interval, requested duration, speed factor + warning | §7.2, §7.3 | **Not modelled** — these come from the real media pipeline (`define-media-assembly`, US-15), which this skeleton does not simulate |
| `state` (6 values) | §8.2 | Already modelled |
| image/clip result references | §8.2, §12.2 | **Upgraded this change** from an opaque string to a real relative file path to a real file on disk (§4 below) |
| per-stage provider binding | §11.2 | Already modelled (`provider` column) |

**Stage attempt** (§10.1, §10.3, §11):

| Field | PRD source | Status |
|---|---|---|
| stage, provider, outcome, external request id, queued-vs-executing time | §10.1, §11.2 | Already modelled (`provider_requests`), per `define-backend-stack`'s Decision 2 equivalent (write-ahead, before send) |
| sequence within the 1+3 budget | §10.1 | Already modelled (`attempt_number`) |

**Idempotency key / artefact record:** rather than a generic "idempotency key" abstraction, this change implements the guarantee directly as a store-level uniqueness constraint on the commit of a scene's result (§4.3) — see Decision 3. A dedicated `artefacts` table was considered and rejected in favour of relative-path columns directly on the scene record (§2.4/2.6): with one artefact per completed scene in this skeleton (no separate image/video stages), a join table would add ceremony without adding a guarantee a column doesn't already give; a real multi-stage implementation should revisit this.

**Fields kept out solely to serve US-34 diagnostics, so their cost is visible (2.6):** none beyond what's already listed above (`provider`, `attempts`) — no additional diagnostics-only fields were added.

### §3 — Store evaluation

The ticket frames this as a three-way choice: **embedded database, server database, or structured files** — not a named shortlist like the sibling spikes, so the candidates and the scoring weights below are this change's own, stated explicitly rather than left implicit.

**Must-pass gates** (uniqueness constraints; durable writes before a provider call returns; concurrent per-scene writes; migrations; inspectability for the mandatory verification step):

| Candidate | Uniqueness | Write-ahead | Concurrent writes | Migrations | Inspectable | Result |
|---|---|---|---|---|---|---|
| Embedded DB (SQLite via `node:sqlite`) | Native `UNIQUE`/`PRIMARY KEY` | Trivial (write, then send) | WAL mode serializes writers safely at this scale | Hand-rolled version table + ordered scripts — a standard, low-risk pattern | `SELECT COUNT(*)` etc. — already proven across three reports | **Admitted** |
| Server DB (e.g. Postgres) | Native, even more mature | Trivial | Native, best-in-class | Mature tooling (e.g. migration frameworks) | Native | **Admitted** |
| Structured files (JSON per session/scene under the project folder) | Hand-rolled (e.g. atomic `O_EXCL` file creation as the "constraint") | Trivial | Hand-rolled locking; real risk of a read-modify-write race without care | Hand-rolled, no standard tooling for "a directory of JSON files" | Most transparent of the three — a human can open the file directly | **Admitted** |

No candidate eliminated at the gate — structured files can satisfy every gate, just with materially more hand-rolled engineering to get uniqueness and concurrency genuinely right, which is a real, not disqualifying, weakness recorded honestly rather than used to eliminate it outright.

**Weighted scoring** (weights are this change's own choice, since the ticket names criteria without percentages: local single-user simplicity 25%, testability 25%, migration tooling 20%, fit with the chosen runtime 30% — weighted toward runtime fit because re-litigating an already-proven integration across three sibling changes has a real cost):

| Criterion | Weight | Embedded DB | Server DB | Structured files |
|---|---|---|---|---|
| Local single-user simplicity | 25% | 9.5 | 3 | 8.5 |
| Testability | 25% | 9.5 | 8.5 | 6 |
| Migration tooling | 20% | 8 | 9.5 | 5 |
| Fit with the chosen runtime | 30% | 9.5 | 7 | 7 |
| **Weighted total** | | **9.20** | **6.88** | **6.73** |

- **Local simplicity:** a server DB needs a separate running process (Postgres itself, or Docker) — a real barrier to "a non-expert can start it" for a local single-user install, and the sharpest differentiator here.
- **Structured files scored honestly, not dismissed:** it wins genuine points for transparency (a human can read a session's state by opening a file) and needs no new dependency, a serious property for this kind of tool. It loses specifically where the *mechanism* this change must prove lives: idempotency and concurrent-scene-write safety are exactly what a database gives for free and files force you to hand-roll — the two hardest guarantees, not incidental ones.
- **Fit with the chosen runtime:** `node:sqlite` is already integrated, proven across `define-backend-stack`'s three experiment reports, and needs zero new dependencies — re-litigating that integration for marginal gain elsewhere is the real cost a server DB or a file-based store would add.

**Decision: embedded SQLite via `node:sqlite`** — this *confirms* `define-backend-stack`'s disposable stand-in as the actual choice, on the merits scored above, not by default. **Documented fallback: server DB (Postgres)**, activated only if a must-pass gate is later found to fail at a scale this skeleton didn't exercise (none did). Structured files, while a real contender, is not the fallback: it loses specifically on the guarantees (§4.3's uniqueness constraint, §5.4's concurrent-write experiment) this change exists to prove, so falling back to it would reopen exactly what failed.
