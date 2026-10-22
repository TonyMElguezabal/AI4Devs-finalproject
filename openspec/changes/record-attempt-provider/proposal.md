## Why

An image or clip attempt (`provider_requests` row) does not say which provider it ran on; the only source is the scene's current binding (`scenes.provider`, `scenes.video_provider`). Since JOS-172 can move a failed stage to another provider, the earlier attempts are then attributed to the new provider. The JOS-175 scratch-store check found eight failed clip attempts counted for the provider the scene was moved to. The per-provider reports (JOS-223 usage, JOS-224 failures) need the provider on the attempt itself to be exact (JOS-222, ADR 0008, follow-up F1).

## What Changes

- `provider_requests` gets a nullable `provider_id` column (migration 21).
- Every new image or clip attempt stores the provider the scene's stage is bound to when the attempt is recorded.
- The migration backfills every existing row with the scene's bound provider for the row's stage (`provider` for image, `video_provider` for clip). Nothing else is changed.
- `ProviderRequestRow` exposes `providerId`, so a read of an attempt shows the provider it ran on.
- Stage diagnostics and telemetry keep their current behaviour; they are not switched to the new column.

## Capabilities

### New Capabilities
- `attempt-provider-attribution`: each image and clip attempt records the provider it ran on, including attempts made before this change (backfilled) and attempts on both sides of a provider move.

### Modified Capabilities
<!-- None: diagnostics and telemetry requirements are unchanged (AC4). -->

## Impact

- Backend: `backend/src/db.ts` (migration 21, `insertProviderRequest`, the two provider-request readers), `backend/src/types.ts` (`ProviderRequestRow`).
- No API, frontend or dependency change. No caller of `insertProviderRequest` changes.
- Docs: `docs/data-model.md` §3 (new field).
- Unblocks exact per-provider rows in JOS-223 and JOS-224; the reports themselves are out of scope.
