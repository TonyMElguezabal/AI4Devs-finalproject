# Step 8 Report - Manual Endpoint Testing with curl

- Date: 2026-10-27
- Change: record-provider-changes (JOS-229)
- Agent: Claude Sonnet 5.5

## Setup
- A copy of the Windows-run database (`Winrun_results/vid4you.sqlite`, copied with its `-wal`/`-shm`, checkpointed on the copy; the original was only copied, its checksum `ad5830c5…` is the same before and after).
- The real backend of this worktree (`node src/server.ts`, port 3129) with a scratch `DB_PATH` and `PROJECTS_ROOT`, `ADMIN_PASSWORD` set for the run and `CORS_ALLOWED_ORIGINS` for the browser check. No vendor key is configured, so nothing can be sent to a vendor.
- On start the server migrated the copy from version 23 to 25 (JOS-225's migration 24 and this change's 25). `provider_changes` existed and held 0 rows (task 8.1).
- Two test-only preparations on the copy: a second video profile "RunningHub B" and a made-up key on the "RunningHub" profile (both through the Administrator API, keys `sk-test-…` that are never sent), because the copy has no key and a profile without one cannot be made active. A master key file `backend/data/provider-keys.key` was created in this worktree (ignored by git) and is removed at the end.
- The failed clip: scene 3 of the real session "Windows project" was edited with `sqlite3` on the copy only (`status='failed'`, `video_result` emptied, bound to "RunningHub B", a made-up failure text).

## Results
| Check | Result |
|---|---|
| Migration 25 (8.1) | `schema_migrations` max 25; `provider_changes` empty after start |
| `PUT /admin/providers/video` to "RunningHub B", then back to "RunningHub", then "RunningHub" again, then an unknown id (8.2, AC1) | 200, 200, 200 (no change), 400. Without the key on RunningHub the first attempt back answered 409 `not-usable` and logged nothing. sqlite: exactly two rows, `RunningHub → RunningHub B` and `RunningHub B → RunningHub`, kind `active-provider`, no session or scene, labels copied |
| Failed clip listed and moved (8.3, AC2) | `GET /admin/failed-stages` listed scene 3 (bound "RunningHub B", active "RunningHub"); `POST …/to-active-provider` answered 200; a second identical move answered 409 `already-on-active` and logged nothing. sqlite: third row `failed-stage-move`, stage `video`, session "Windows project", scene 3, `RunningHub B → RunningHub` |
| Report, last 30 days (8.4, AC3) | `GET /admin/reports/provider-changes?from&to`: 3 entries, newest first (the move, then the two changes); the move carries the session title and scene number 3, the changes carry `null` for both |
| Report, period without them | `{"from":"2026-10-01…","to":"2026-10-10…","entries":[]}` |
| Report, no period | `from: null`, 3 entries |
| 401 (AC4) | 401 without the password and with a wrong one |
| 400 | `from` after `to`: 400 `querystring/from must be before to`; `from=yesterday`: 400 |
| Content | The response (one line) holds none of: script, prompt, instruction, apiKey, `sk-test`, the made-up failure text: 0 hits |
| OpenAPI | `GET /docs/json` lists `/admin/reports/provider-changes` |

## Database state
- Row counts (runs/scenes/provider_changes/active_providers) are `2/58/3/1` before and after a further read of the report: reading changes nothing.
- `Winrun_results/vid4you.sqlite` checksum unchanged.
- The server was stopped by its own process id (95515, matched to the server log). The scratch copy is kept for the browser check (step 9) and removed at its end.
