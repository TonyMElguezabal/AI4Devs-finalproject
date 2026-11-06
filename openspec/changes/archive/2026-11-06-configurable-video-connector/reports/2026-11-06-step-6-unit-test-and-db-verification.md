# Step 6 — Unit tests and database verification (2026-11-06)

## Isolation

- Every run used a scratch `DB_PATH` and `PROJECTS_ROOT` under the session scratchpad, never `backend/data`.
- Baseline before the runs: the checksums of `AI4Devs-finalproject/backend/data/*.sqlite` were recorded. The worktree has no `backend/data` folder.
- After the runs, the checksums are unchanged (`diff` empty). No `backend/data` was created in the worktree.
- The scratch database held 5 provider profiles after the last test (the seeded ones). It is thrown away; nothing to restore.

## Targeted tests (6.2)

| Suite | Result |
| --- | --- |
| `video-connector`, `video-connector-admin`, `adapter-contract`, `settings`, `video-provider`, `provider-connection-check`, `telemetry-provider-name` | 7 files, 369 tests passed |
| `provider-price`, `provider-types`, `admin-provider-profiles-route`, `video-connector-admin` | 4 files, 89 tests passed |
| frontend `video-connector-section` | 6 tests passed (5 failed before task 4.2, as written first) |

## Full runs (6.3)

| Package | typecheck | lint | test |
| --- | --- | --- | --- |
| backend | passed | passed, no problems | 215 files passed, 6 skipped; 2890 tests passed, 12 skipped |
| frontend | passed | 0 errors, 7 warnings, all `react-hooks/exhaustive-deps`, none added by this change | 20 files, 489 tests passed |

## Found while testing

- The placeholder pattern `[a-z_]+` did not match `{image_base64}`. It is now `[a-z0-9_]+` in the connector and in the validation.
- The connection check holds its own fetch. The admin test now sets it with `setConnectionCheckFetch`.
- The shipped `settings.default.json` now names `"resolution": "768P"` for the video section.
