# ADR 0002 — Persistence for sessions and project files

- Status: Accepted
- Date: 2026-09-25
- Change: `define-persistence` (JOS-181, US-42c)

## Context

Vid4You had no chosen persistence mechanism. PRD v1.3 §12.1–§12.3 specifies the *behaviour* persistence must produce — progress survives restarts, a repeated success confirmation must not duplicate a result or relaunch a stage, project files live in per-project folders that never expire and never overwrite each other — but names no mechanism. `docs/data-model.md` still documented twelve entities from an unrelated inherited domain.

Two couplings mattered: `define-backend-stack` (JOS-179) already proved restart resumption and idempotency against a persistence stand-in it explicitly labelled disposable, and `docs/openspec-tasks-mandatory-steps.md` assumes a database it can inspect, snapshot and restore.

## Decision

**Embedded SQLite via Node's built-in `node:sqlite`** — this *confirms* the `define-backend-stack` stand-in as the actual, decided persistence engine, on the merits scored below, not by default or convenience.

**Documented fallback: a server database (e.g. Postgres)**, activated only if a must-pass gate were later found to fail at a scale this skeleton didn't exercise. Not triggered — every gate and every experiment passed.

**Not selected: structured files (JSON per session/scene under the project folder).** A real, honestly-scored contender — see below — but it loses specifically on the two guarantees this change exists to prove.

## Decisions to make (per the ticket) — answered

1. **Store type:** embedded database (above).
2. **Mandatory "database state verification" step:** **executable as written**, no amendment needed — SQLite is a database in the literal sense the step assumes (`docs/openspec-tasks-mandatory-steps.md` Step N+1 already ran cleanly against it in this change's own Step 7 report).
3. **File references:** relative to a recorded project-folder root (Decision 4 below).
4. **Idempotency mechanism:** a `PRIMARY KEY` uniqueness constraint on a `scene_results` table (Decision 3 below) — enforced by the store, not by a prior application-level read.
5. **Resume data:** the external request id, stage-equivalent (provider), sent time and latency, written *before* the request is sent (Decision 2, already implemented by `define-backend-stack`).
6. **Concurrency and transactions:** proven at 20 concurrently-completing scenes with no lost updates (§ Evidence).
7. **Schema versioning:** a version-tracked migration runner from this change's first commit (Decision 6 below).
8. **Queue and pause state:** the readiness queue is rebuilt at startup from persisted scene status; only the paused marker is itself persisted (Decision 5, already implemented by `define-backend-stack`, confirmed unaffected by this change's schema additions).

## Candidate Evaluation

The ticket frames this as a three-way choice — embedded database, server database, or structured files — not a named shortlist, so the weights below are this change's own, stated explicitly.

**Must-pass gates** (uniqueness constraints; durable writes before a provider call returns; concurrent per-scene writes; migrations; inspectability for the mandatory verification step): all three candidates pass every gate. Structured files can satisfy each one, but only with materially more hand-rolled engineering for uniqueness and concurrency specifically — a real, not disqualifying, weakness recorded honestly.

**Weighted scoring** (local single-user simplicity 25%, testability 25%, migration tooling 20%, fit with the chosen runtime 30%):

| Criterion | Weight | Embedded DB | Server DB | Structured files |
|---|---|---|---|---|
| Local single-user simplicity | 25% | 9.5 | 3 | 8.5 |
| Testability | 25% | 9.5 | 8.5 | 6 |
| Migration tooling | 20% | 8 | 9.5 | 5 |
| Fit with the chosen runtime | 30% | 9.5 | 7 | 7 |
| **Weighted total** | | **9.20** | **6.88** | **6.73** |

Structured files scored honestly, not dismissed: it wins real points for transparency (a human can read a session's state by opening a file) and adds no new dependency. It loses precisely where the *mechanism* this change must prove lives — idempotency and concurrent-write safety are exactly what a database gives for free and files force you to hand-roll.

A server database's sharpest loss is local simplicity: it needs a separate running process, a real barrier to "a non-expert can start it" for a local single-user install.

## Decisions (from `design.md`, confirmed by evidence)

**Decision 1 — Record stage attempts as append-only entries, not counters on the chunk.** Proven live: a manual retry appends a *new* `provider_requests` row (a different id) rather than mutating the original — see § Evidence.

**Decision 2 — Write the provider request record before the request is sent.** Already implemented by `define-backend-stack`; confirmed still correct against the real store (restart resumption, § Evidence).

**Decision 3 — Enforce idempotency with a uniqueness constraint in the store, not an application check.** **The central finding of this change.** `define-backend-stack`'s existing idempotency guard was an application-level check-then-act (`if (req.resolved) return`) — safe *only* because `node:sqlite`'s API is synchronous and Node is single-threaded, an accidental property of the current code, not a structural guarantee, and exactly the pattern `specs/persistence-foundation/spec.md` rejects. Fixed with a real `scene_results` table (`scene_id PRIMARY KEY`): the commit of a result is an `INSERT` that the store itself rejects on a second attempt, regardless of any in-memory flag. Proven both at the unit level (`test/persistence.test.ts`) and live (duplicate delivery after a real success stays at one `scene_results` row).

**Decision 4 — Store file references as paths relative to a recorded project-folder root.** Implemented: real per-project folders are now created on disk (`data/projects/<title> <YYYY-MM-DD HH-mm>`, PRD §12.2's exact naming, with a counter on collision), real placeholder artefact files are written, and scene records store the relative path. Proven live: renaming a folder by hand and updating only the recorded root left every existing (already-relative) artefact reference resolving correctly with no other change.

**Decision 5 — Rebuild the readiness queue at startup; persist only the paused marker.** Already implemented by `define-backend-stack`; confirmed unaffected by this change's additions.

**Decision 6 — Adopt versioned schema migrations from the first commit.** Implemented: `applyMigrationsTo()` + a `schema_migrations` table; migration 2 (`runs.language`, `runs.project_folder`) is the first real migration. Proven against a hand-built version-1 fixture database: pre-existing session/scene rows are untouched, new columns get safe defaults, and re-applying is a no-op.

**Decision 7 — Prove the choice on the harness from `define-backend-stack` rather than a separate prototype.** Followed throughout — every experiment ran against the same skeleton, extended in place.

## Evidence

All required experiments were run **live** against the real, decided store (not a stand-in), with full transcripts in `openspec/changes/define-persistence/reports/`:

| Experiment | Result |
|---|---|
| 5.1 Restart resumption, request identified by stage/provider | **Proven.** Genuine mid-flight `kill -9` + restart; the recorded request, joined to its scene, identifies stage and provider; resumed from original send time |
| 5.2 Unrecoverable case | **Proven.** Exactly one failed attempt recorded, auto-retry launched, no duplicate |
| 5.3 Idempotency (sequential and "concurrent") | **Proven**, store-enforced (see Decision 3) |
| 5.4 Concurrent scene writes | **Proven.** 20 scenes, 50ms latency each; every scene's own instruction and result verified individually; `scene_results` count exactly 20, no cross-contamination |
| 5.5 Same-title isolation | **Proven.** `Twin Title 2026-09-25 15-55` and `... (2)`, distinct and both present |
| 5.6 Folder rename in place | **Proven.** Real `mv`, recorded-root update, artefact reference still resolved |
| 5.7 Schema migration survival | **Proven** against a hand-built version-1 fixture (`test/persistence.test.ts`) |
| Step N+1 (mandatory DB verification) executable | **Confirmed** — see `reports/2026-09-25-step-7-unit-test-and-db-verification.md` |

**A second real bug was found and fixed during this change's own verification step:** `resetAll()` (the test-reset helper) wiped database rows but not the real project-folder directories tests create on disk. Running the full test suite twice in a row without a fix produced mismatched folder-collision-counter suffixes. Fixed by having `resetAll()` also wipe `PROJECTS_ROOT`; verified by re-running the suite twice in a row afterward, both green. Recorded here because it is the same *class* of gap as Decision 3's finding: a guarantee that held only by accident of how tests happened to be run, not by construction.

## Growth and Limitations (stated explicitly, per the ticket)

- **Attempt-history growth:** unbounded — the MVP sets no retention limit (PRD §4.1), and this change does not invent one. `provider_requests` grows by one row per attempt, `scene_results` by at most one row per scene ever completed. At the scales this MVP targets (hundreds of scenes per session), this is not a practical concern within the MVP's lifetime; a real retention policy is a future decision, not one this change makes.
- **Folder-move limitation:** relative artefact references survive a folder **rename in place** (proven, § Evidence) because only the session's recorded root needs updating. A folder moved to a genuinely different location still needs that same recorded-root update — there is no filesystem-watching or automatic re-linking. This is a local single-user tool; "the user must tell the app where they moved it" is an accepted, explicit limitation, not an oversight.

## Risks left unproven within the timebox

- **Scale beyond ~20 concurrent scene writes** was not exercised; the mechanism (SQLite WAL mode serializing writers) is expected to hold at the hundreds-of-scenes scale the MVP targets, but this change did not stress-test that specific ceiling.
- **The artefact model (relative-path columns instead of a dedicated table)** is a deliberate simplification for this skeleton's single-stage model; a real multi-stage implementation (separate image and video artefacts per scene) should revisit whether a dedicated table earns its ceremony once there is more than one artefact per scene.

## Consequences

- `docs/data-model.md` is rewritten (this change) to describe Vid4You's sessions, chunks and stage attempts, replacing the inherited unrelated content.
- `docs/backend-standards.md` gains a persistence section, coordinated with `docs/adr/0001-backend-stack.md` so the two documents describe the same store consistently.
- `define-backend-stack`'s (JOS-179) restart and idempotency observations are confirmed for restart, and **corrected** for idempotency — its ADR is updated to point here for the real mechanism.
- Every backend implementation story follows the data model and persistence conventions recorded here rather than inventing a parallel representation.
