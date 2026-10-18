# JOS-199 step 11 — unit tests and database verification

Date: 2026-10-18.

## Baseline (11.1)
Store: `backend/data/skeleton.sqlite` (the shared test store). Taken after the earlier full run, so it already carries that run's residue.
- Tables: final_video_builds, narration_timestamps, provider_requests, runs, scene_pause_edits, scene_results, scene_video_results, scenes, schema_migrations, stage_attempts, telemetry_settings, voice_overs.
- `telemetry_settings`: `1|1|0|1|2026-10-18T22:52:48.002Z|01M531837SJ6SPYQF6PASA7DST`. Runs: 0.

## Runs
| Suite | Command | Result |
|---|---|---|
| Targeted backend (redact-paths, telemetry*, log-file, update-check, build-config) | `npx vitest run <names>` | 9 files, 69 tests passed |
| Relay | `npx tsc --noEmit && npx vitest run` | 1 file, 13 tests passed |
| Backend full | `npx tsc --noEmit && npx vitest run` | 115 files passed, 4 skipped; 1681 tests passed, 5 skipped |
| Frontend full | `npm run typecheck && npm test` | 3 files, 244 tests passed |

## Post-test state (11.4)
Same tables, 0 runs. The `telemetry_settings` row differs only in its `answered_at` timestamp (`22:57:23` instead of `22:52:48`): the consent-route tests rewrite the row, so the timestamp is test residue. The consent flags in this store are test values, not a real user's choice. Nothing to restore.

## Notes
- The intermittent `orchestrator.test.ts` failure seen earlier did not reproduce in the three full backend runs of this session.
