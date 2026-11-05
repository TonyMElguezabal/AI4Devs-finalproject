## Context

- **Active provider (JOS-171, JOS-218).** `active_providers(stage PK, provider_id, changed_at)` holds only the last choice. The one write path is `PUT /admin/providers/:stage` in `routes.ts`, which checks the provider is selectable and usable and then calls `setActiveProvider(stage, providerId)` in `activeProvider.ts`, which calls `upsertActiveProviderChoice`. `activeProviderId(stage)` returns the effective provider: the saved choice, or the settings default when there is none (or when the choice is not shipped by this build). `labelOf(stage, id)` gives a provider's display name.
- **Failed-stage move (JOS-172).** `moveFailedStage(ref)` in `failedStages.ts` reads, guards and writes inside one `inTransaction`; on success it has `bound` (the previous binding, which `resolveProfileId` maps to a profile id) and `active` (the new one). Its three writes are `rebindSessionStage`, `rebindSceneImageProvider` and `rebindFailedClip`; it has no other caller.
- **Reports (JOS-223, JOS-228).** `adminReportRoutes.ts` registers report routes inside the `/admin` child plugin (the gate answers 401 first) and shares `periodOf` for the bounds and the 400 rule. `ReportsSection.tsx` holds the period and renders each report.
- The latest migration on `origin/main` is 24 (JOS-200). JOS-224 and JOS-225 are proposed in parallel and add no migration.

## Goals / Non-Goals

**Goals:**
- An append-only log of the two kinds of provider change, written atomically with the change.
- A report of that log in a period, newest first, in the Reports section.

**Non-Goals:**
- Logging provider profile edits (add, edit, delete, key changes) on `/admin`: not a provider change in the sense of R7, and a profile edit is not tied to a stage's choice.
- Reconstructing earlier changes from `active_providers.changed_at` (it has no previous provider).
- Who made the change: there is one shared Administrator password, no accounts.

## Decisions

### Decision 1 — One table, two kinds

```
provider_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  changed_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('active-provider', 'failed-stage-move')),
  stage TEXT NOT NULL CHECK (stage IN ('reasoning', 'voice', 'alignment', 'image', 'video')),
  run_id TEXT REFERENCES runs(id),          -- moves only
  scene_id TEXT REFERENCES scenes(id),      -- image and video moves only
  previous_provider_id TEXT NOT NULL, previous_provider_label TEXT NOT NULL,
  new_provider_id TEXT NOT NULL,      new_provider_label TEXT NOT NULL
)
```

Migration 25, no backfill. `resetAll` (the test reset) deletes it before `scenes` and `runs`. One insert function `recordProviderChange(entry)` in `db.ts`; no update or delete function exists.

*Alternative:* two tables, one per kind. Rejected: the report reads both as one list in one order; nullable `run_id`/`scene_id` cost less than a `UNION`.

### Decision 2 — Labels are copied into the entry

The entry stores each provider's display name as `labelOf` gives it at the moment of the change. An audit row must say what the Administrator saw; a later rename, or a profile removed because nothing is bound to it, would otherwise change or lose the name. Ids are kept too, for joins and for the fallback.

### Decision 3 — Log inside the change's own transaction

- `setActiveProvider` becomes: in `inTransaction`, read `previous = activeProviderId(stage)`, upsert the choice, and when `previous !== providerId` insert the entry. The route keeps its checks before the call, so a refused request reaches neither write. The effective previous provider is logged, so the first choice over a settings default names that default.
- `moveFailedStage` inserts the entry inside its existing transaction, right after the rebind succeeded, with `previous = resolveProfileId(stage, bound)` and `new = active`, `run_id = ref.sessionId`, `scene_id` for image and video. A refusal returns before the insert.

*Alternative:* log in the routes after the call. Rejected: a crash between the change and the log would lose the entry, and the move's transaction already exists.

### Decision 4 — Report

`providerChangesReport({ from, to })` in `backend/src/providerChangesReport.ts`: one query on `provider_changes` with `changed_at` in `[from, to)`, `LEFT JOIN runs` for the title and `LEFT JOIN scenes` for `idx`, returned as the scene number exactly as the failed-stages list of `/admin` returns it (`sceneNumber: scene.index`), ordered by `changed_at DESC, id DESC`. Route `GET /admin/reports/provider-changes` reuses `periodOf` and a strict Zod response:

```
{ from: string | null, to: string,
  entries: [{ changedAt, kind: "active-provider" | "failed-stage-move", stage,
              sessionId: string | null, sessionTitle: string | null, sceneNumber: number | null,
              previousProviderId, previousProviderLabel, newProviderId, newProviderLabel }] }
```

### Decision 5 — Frontend

A `ProviderChangesTable.tsx` component rendered by `ReportsSection.tsx`, loaded in the same effect as the other reports (one 401 locks the page once) with its own error state cleared in `changePeriod`. The "what" column reads "Active provider changed" or "Failed stage moved"; times use the computer's time zone like the other reports.

## Risks / Trade-offs

- [`setActiveProvider` now runs a read and two writes in a transaction] → a single-user store; the cost is negligible.
- [`activeProviderId` falls back to the settings default for an orphaned choice] → the logged previous provider is then the default actually in use, which is what the stage was running on; stated in the spec.
- [Parallel report changes (JOS-224, JOS-225) edit `adminReportRoutes.ts` and `ReportsSection.tsx`] → small rebase for whichever merges second; migration 25 is not claimed by them, task 1.1 re-checks.
- [The log grows without bound] → a few rows per Administrator action; no pruning.

## Migration Plan

Migration 25 creates an empty table. Rollback: revert the code; the empty or partly filled table is harmless to the previous version, which ignores it.

## Open Questions

None.
