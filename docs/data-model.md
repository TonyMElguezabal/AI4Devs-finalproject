# Data Model Documentation

This document describes Vid4You's data model: sessions, chunks (scenes), stage attempts, and the result-commit records that make a repeated success confirmation harmless. It replaces the previous version, which described an unrelated inherited application's entities and had no bearing on this product.

The store is embedded SQLite via Node's built-in `node:sqlite` — see `docs/adr/0002-persistence.md` for why, and `openspec/changes/define-backend-stack/skeleton/src/db.ts` for the reference implementation this document describes.

**Scope note, stated once here rather than on every field:** the current implementation (`define-backend-stack`'s walking skeleton, extended by `define-persistence`) is deliberately narrow — it models **one** generic provider-backed stage ("image") standing in for the PRD's five stages, and it does not simulate voice generation, timestamp alignment, or script decomposition. Fields the PRD implies for those stages are noted below as **not modelled**, with the reason, rather than invented ahead of the stories that own them.

## Model Descriptions

### 1. Session (`runs` table)

Represents one video project. PRD §3, §4.1, §8.1, §9, §12.2.

**Fields:**
- `id`: system-generated identifier (Primary Key) — §3. **ULID**, not a random UUID (`start-video-project`, JOS-134, Decision 3): opaque (not derived from the title) *and* creation-ordered (sorts lexicographically by creation time), which a UUIDv4 is not.
- `title`: the project's title — §3
- `script`: the script exactly as submitted, **write-once from registration onward** — §4.2/D10 (`start-video-project`, JOS-134, Decisions 1 and 2). Emptiness is judged on a trimmed view at the validation boundary; the stored value is never trimmed. No operation updates this column after creation.
- `language`: script language, selected from the hardcoded supported list; a session cannot exist without one — §4.1. Also write-once, same as `script`.
- `created_at`: creation timestamp; also drives the project-folder name, to the minute — §12.2
- `state`: **derived**, not stored — one of the eight session states in §8.1, computed from the session's scenes each time it is read (`orchestrator.ts`'s `deriveSessionState`). A session with zero scenes (the state immediately after `start-video-project` registers it, before decomposition creates any) derives to `submitted`. This skeleton only ever produces `submitted`, `chunks-processing`, `final-video` or `failed`, since voice-over and decomposition phases aren't modelled.
- `paused`: a marker on top of the current state, never a state itself, per §8.1/§9 (Decision 8, `define-live-updates`)
- `project_folder`: the real per-project folder name under a configured root, named `<title> <YYYY-MM-DD HH-mm>` with a counter suffix on collision — §12.2 (Decision 4, `define-persistence`)

**Not modelled** (no consumer yet — see the scope note): voice-over/alignment provider bindings, MP3 and timestamp references, total narration duration (§11.2) — these belong to stages this skeleton doesn't simulate.

**Relationships:** one session has many scenes.

### 2. Scene / chunk (`scenes` table)

Represents one narrated segment of the video. PRD §3, §6, §7.2, §7.3, §8.2, §10.3.

**Fields:**
- `id`: identifier, unique within the session and invariable once assigned (Primary Key) — §6
- `run_id`: the owning session (Foreign Key)
- `idx`: ascending narrative order, 1..N — §6
- `instruction`: the visual instruction (the skeleton conflates `PROMPT`/`IMAGE`/`VIDEO` into one field, since it models one combined stage); correctable only while the scene is `failed` — §3, §10.3
- `status`: one of the six chunk states in §8.2. This skeleton only ever produces `submitted`, `image-generating`, `chunk-complete` or `failed` (never `image-complete`/`video-generating` individually, since there is no second real stage)
- `attempts`: attempt count within the current 1+3 retry cycle — §10.1
- `current_request_id`: the in-flight provider request's external id, or null
- `last_error`: the most recent failure reason, when applicable
- `result`: the **relative path** to the real artefact file written under the session's project folder — §12.2 (Decision 4)
- `provider`: the (stubbed) provider name that produced the result — §11.2
- `provider_mode` / `provider_latency_ms`: skeleton-only fields configuring the stubbed provider's behaviour for that scene; not part of the real product model

**Not modelled:** narration interval start/end, requested clip duration, speed factor and its warning flag (§7.2, §7.3, AC23) — these come from the real media pipeline (`define-media-assembly`, US-15), which this skeleton does not simulate.

**Relationships:** many scenes belong to one session; one scene has many stage attempts (provider requests) and at most one committed result.

### 3. Provider request / stage attempt (`provider_requests` table)

An append-only record of one attempt to call the (stubbed) provider for a scene. PRD §10.1, §10.3, §11, §11.2.

**Fields:**
- `id`: the external request identifier — without this, restart resumption (§12.1) is impossible
- `scene_id`: the scene this attempt belongs to (Foreign Key)
- `sent_at`: when the request was recorded — written **before** the request is sent (Decision 2), so a crash between send and response still leaves a trace
- `latency_ms`, `mode`: skeleton-only fields the stub provider uses to compute its outcome deterministically
- `attempt_number`: sequence within the current 1+3 budget — §10.1
- `resolved`: whether this specific request's delivery has been processed (guards against redelivering the same webhook event — a different, narrower concern than the scene-level idempotency below)

**Never updated in place** once written except to flip `resolved`: each retry inserts a **new** row rather than mutating the previous attempt (Decision 1) — proven in `openspec/changes/define-persistence/reports/2026-09-25-step-8-curl-endpoint-testing.md` §8.6.

### 4. Scene result commit (`scene_results` table)

The actual idempotency guarantee. PRD §12.1 ("more than one success confirmation for the same generation must not duplicate a result").

**Fields:**
- `scene_id`: **Primary Key** — this is the whole mechanism. A second attempt to insert a row for a scene that already has one is rejected by the store itself, not by application code that read a flag first (Decision 3, `define-persistence`, the change's central finding — see `docs/adr/0002-persistence.md`).
- `result`: the committed relative artefact path
- `committed_at`: when the commit happened

### 5. Schema migrations (`schema_migrations` table)

Tracks which versioned migrations have been applied, so an existing session's data survives a schema upgrade (§11.2, Decision 6). Fields: `version` (Primary Key), `applied_at`.

## Entity Relationship Diagram

```mermaid
erDiagram
    Session {
        String id PK "ULID"
        String title
        String script
        String language
        String created_at
        Boolean paused
        String project_folder
    }
    Scene {
        String id PK
        String run_id FK
        Int idx
        String instruction
        String status
        Int attempts
        String current_request_id
        String last_error
        String result
        String provider
    }
    ProviderRequest {
        String id PK
        String scene_id FK
        String sent_at
        Int attempt_number
        Boolean resolved
    }
    SceneResult {
        String scene_id PK "FK to Scene"
        String result
        String committed_at
    }
    SchemaMigration {
        Int version PK
        String applied_at
    }

    Session ||--o{ Scene : "has (ascending idx)"
    Scene ||--o{ ProviderRequest : "append-only attempts"
    Scene ||--o| SceneResult : "at most one commit"
```

## Key Design Principles

1. **Append-only attempts, mutable read model.** `provider_requests` never rewrites history; `scenes.status`/`result` is a derived, idempotently-updatable read model on top of it (Decision 1).
2. **The store enforces the guarantees that matter, not application code.** Idempotency (§4 above) and referential integrity (foreign keys, `PRAGMA foreign_keys = ON`) are structural, not conventions a caller has to remember to check first (Decision 3).
3. **File references are relative, always.** Every artefact path is relative to the owning session's recorded `project_folder`, so renaming that folder in place requires updating exactly one column, not every artefact row (Decision 4).
4. **No entity models a phase this skeleton doesn't simulate.** Where the PRD implies a field (narration interval, speed factor, voice/alignment provider bindings) with no current writer or reader, it is documented as **not modelled** here rather than added speculatively — a story that needs it adds it as its own delta.
5. **Schema versioning from the start.** `schema_migrations` exists even though there is currently one real migration, so a long-lived session (sessions never expire, §12.2) can outlive several schema versions without its existing rows being touched (Decision 6).

## Notes

- All identifiers are opaque strings, not auto-incrementing integers, consistent with §3's "system-generated identifier." **Session** identifiers are ULIDs (`start-video-project`, JOS-134, Decision 3 — opaque *and* creation-ordered, which §12.2's "two sessions in the same minute" case relies on being observable). Scene, provider-request and scene-result identifiers remain UUIDs — §12.3's "reached by identifier" guarantee is specifically about sessions, not these internal records.
- No entity in this model is a security boundary — per §12.3, session separation is a functional-integrity property (a project must not show or overwrite another project's data), not an access-control mechanism. There are no accounts, roles or permissions in this data model.
- What's still open: the real persistence engine choice is **not** open — that's `docs/adr/0002-persistence.md`, this document's basis. What remains genuinely open is the full multi-stage model (voice, alignment, video as their own simulated stages) and the real hardcoded parameter values (US-33), both out of scope for the changes that produced this document.
