## Context

- `provider_requests` (baseline schema, `stage` added in migration 12) has no provider column. The latest migration on `origin/main` is 19 (`provider_profiles`, JOS-218).
- All 12 image and clip writes go through `insertProviderRequest` in `backend/src/db.ts` (callers in `orchestrator.ts` and `provider.ts`). It is called after the provider call returns, with the scene id and the stage.
- The scene's bindings: `scenes.provider` (image, sentinel `stub-image-provider` until bound) and `scenes.video_provider` (clip, null until the clip stage starts). Telemetry (`reportProviderRequest`) and stage diagnostics already derive the provider from these two columns.
- JOS-172 rebinds a stage only when the scene is `failed` (`UPDATE scenes SET provider = ? ... AND status = 'failed'`, `rebindFailedClip`). A scene with an attempt in flight is not `failed`, so the binding cannot change between the call and its record.

## Goals / Non-Goals

**Goals:**
- Every image and clip attempt stores the provider it ran on (AC1, AC3).
- Existing rows are backfilled from the scene's binding (AC2).
- Diagnostics and telemetry unchanged (AC4).

**Non-Goals:**
- The reports (JOS-223, JOS-224).
- Switching diagnostics or telemetry to the new column.
- Recovering the true provider of attempts made before a move that happened before this change (not recorded anywhere).

## Decisions

### 1. Read the binding inside the INSERT, not from the callers
`insertProviderRequest` fills `provider_id` with a subquery on the scene: `CASE WHEN stage = 'video' THEN video_provider ELSE provider END`.
- Alternative: add a `providerId` parameter and pass it from the 12 call sites. More diff, and each site would read the same binding the subquery reads. Rejected.
- Correct because the binding cannot change while an attempt is in flight (Context, last bullet).

### 2. Nullable column, no default
`ALTER TABLE provider_requests ADD COLUMN provider_id TEXT`. A clip row whose scene has no `video_provider` (the orchestrator falls back to the registry default, `orchestrator.ts` "`reread.videoProvider ?? registry.defaultIdentifier`") stays null rather than guessing. Fixture tests that insert rows directly keep working.

### 3. Backfill in the same migration
Migration 20 adds the column and runs one `UPDATE provider_requests SET provider_id = (SELECT CASE ... FROM scenes WHERE scenes.id = provider_requests.scene_id)`. Only `provider_id` is written.

### 4. Expose `providerId` on `ProviderRequestRow`
Both readers (`getProviderRequest`, `getLatestProviderRequestForScene`) map the column; they share one row mapper instead of the two copies they have today.

## Risks / Trade-offs

- [Rows recorded before this change for a scene already moved get the new provider] → Accepted by AC2; the reports note the cut-off date if needed.
- [Image rows of never-bound scenes get the sentinel `stub-image-provider`] → Same value telemetry and diagnostics already see; reports map unknown identifiers as they do today.

## Migration Plan

Migration 20 runs at start-up like every other migration. Rollback: the column is ignored by older code (SQLite keeps it); no data is removed.
