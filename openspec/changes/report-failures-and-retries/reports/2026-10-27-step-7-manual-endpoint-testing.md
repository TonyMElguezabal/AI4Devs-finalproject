# Step 7 Report - Manual Endpoint Testing with curl

- Date: 2026-10-27
- Change: report-failures-and-retries (JOS-224)
- Agent: Claude Sonnet 5.5

## Setup
- Source data: a copy of the Windows run database (`Winrun_results/vid4you.sqlite` with its `-wal` and `-shm`, checkpointed on the copy). The original was never opened by the server; its checksum is the same before and after.
- The real backend of this worktree (`npm start`) on port 3124 with `DB_PATH` and `PROJECTS_ROOT` in a scratch folder and `ADMIN_PASSWORD` set for the run. On start it migrated the copy from version 23 to 24.
- The real data holds 2 sessions, 8 session-level attempts (all successful), 192 scene requests (76 transient image failures) and no failed scene. To exercise the other paths, 5 synthetic `stage_attempts` rows and 3 failed scenes were added to the copy only: a voice-over cycle of 4 attempts (3 transient, then a time-out, the first one manual), a manual decomposition attempt that was not retryable, one scene failed at its image and two at their clip, the latter with marker texts `MARKER-IMAGE-FAILURE-TEXT` and `MARKER-CLIP-FAILURE-TEXT` in `scenes.last_error`.

## Results (AC1 to AC5)
| Check | Command | Result |
|---|---|---|
| Real data, all time (AC1) | `curl -H "Authorization: Bearer …" /admin/reports/failures` | 200; one row, image: transient 76, budgets and manual retries `null`; no wordings; scenes failed now 0/0. sqlite: 76 `transient_failure` image requests. The usage report's image rows sum to 2 + 74 = 76. |
| Real data, last 30 days | same with `from=` 30 days ago | 200; same 76 |
| With the synthetic rows (AC1, AC2) | same, all time | voice: transient 3, timed out 1, budgets exhausted 1, manual retries 1; reasoning: not-retryable 1, manual retries 1; image: 76. Matches sqlite counts for the voice outcomes, the manual triggers and the cycles whose 4th attempt failed. The usage report's voice rows sum to 3 transient, 0 not-retryable, 1 timed out. |
| Wordings (AC2) | same | "The voice provider answered HTTP 503." ×3, "The voice provider did not answer in time." ×1 (voice); the decomposition wording ×1 (reasoning); none for image or video |
| Scenes failed now (AC3) | same | image 1, video 2; the same for a period that excludes everything (`from=2020-01-01…&to=2020-01-02…`: no stages, still 1/2) |
| Provider text hidden (AC4) | grep of the body for `MARKER-` | 0 matches |
| No password (AC5) | `curl /admin/reports/failures` | 401 |
| Wrong password (AC5) | `Bearer nope` | 401 `{"ok":false,"reason":"wrong-password"}` |
| `from` after `to` | `from=2026-10-02…&to=2026-10-01…` | 400 `querystring/from must be before to` |
| `from` not a date | `from=yesterday` | 400 `querystring/from Invalid datetime` |
| OpenAPI | `GET /docs/json` | lists `/admin/reports/failures` |

## Database state
- Row counts (runs/scenes/stage_attempts/provider_requests/provider_profiles/active_providers/voice_overs) before and after six report requests: `2/58/13/192/5/0/2` both times (13 attempts = 8 real + 5 synthetic).
- `Winrun_results/vid4you.sqlite` checksum unchanged (`27cd12db…`).
- The server was stopped by its own process id (the one in its log, listening on 3124).
- The scratch copy is kept for the browser check (group 8) and removed at its end.

## Outcome
- Step 7 status: PASS
- Blocking issues: none
