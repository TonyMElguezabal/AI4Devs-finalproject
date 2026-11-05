# Step 7 Report - Manual Endpoint Testing with curl

- Date: 2026-10-27
- Change: report-sessions (JOS-225)
- Agent: Claude Sonnet 5.5

## Setup
- A copy of the Windows-run database (`Winrun_results/vid4you.sqlite` with its `-wal` and `-shm`, checkpointed on the copy). The original was never opened by the server; its checksum is the same before and after.
- The real backend of this worktree (`npm start`) on port 3125 with a scratch `DB_PATH` and `PROJECTS_ROOT` and `ADMIN_PASSWORD` set for the run. On start it migrated the copy from version 23 to 24.
- The copy holds two real finished sessions ("Windows project", 5 scenes; "Windows 2 full run 1", 53 scenes). Four synthetic sessions were added to the copy only: in progress (2 scenes, one with both warnings, retries on its image and clip), paused, failed in the voice-over before any scene, and failed in assembly. Marker texts (`MARKER-SCRIPT-n`, `MARKER-FAILURE-CAUSE`, `MARKER-ASSEMBLY-CAUSE`, `MARKER-IMAGE-INSTRUCTION`, `MARKER-VIDEO-INSTRUCTION`, `MARKER-SCENE-ERROR`) sit in their scripts, failure causes, instructions and scene error.
- Note: on start the server's own recovery picked up one synthetic scene that was left "submitted", tried to generate its image and failed it (no vendor key is configured, so nothing was sent). That is why the in-progress session shows two failed scenes and four attempts; the row still equals the spike's query on the same store. The row counts were read again after the server had settled.

## Results
| Check | Result |
|---|---|
| 401 on both routes, without a password and with a wrong one (AC4) | 401 four times |
| List, all time (AC1, AC3) | 6 sessions, newest first. Each row (state and failed phase, paused, scenes, failed scenes, attempts, seconds to the voice-over and to the final video) equals the row of the spike's R4 query (`poc/queries.sql`) run with `sqlite3` on the same store |
| Failed before scenes (AC3) | "Failed in voice-over": state `failed`, phase `voice-over`, 0 scenes, both times null. "Failed in assembly": failed, 0 scenes, 12 s to the voice-over, no final-video time. "Paused session": paused true, state in progress |
| Periods | Last 30 days: all six. Last 7 days: the five newest (the session of 20 October drops). Custom range 20 to 22 October: only "Windows project". A range with a `+02:00` offset selects the same session as its UTC equivalent. A period with nothing: `rows: []` |
| Drill-down with scenes (AC2) | The real session's 53 scenes; scene 1 and 2 equal sqlite (status, providers, image and clip request counts, requested duration, speed factor). The synthetic session shows both warnings, 2 image attempts and 1 clip attempt on scene 1, and `null` clip provider and duration on the unbound scene 2 |
| Drill-down without scenes | `{"sessionId":"syn-voicefail","rows":[]}` |
| Unknown session | 404 `There is no such session.` |
| `from` after `to`, `from=yesterday` | 400 (both) |
| Content (AC5) | The list and all six drill-downs (16,306 bytes in all) hold none of the six marker kinds: 0 hits for `MARKER` |
| OpenAPI | `GET /docs/json` lists `/admin/reports/sessions` and `/admin/reports/sessions/{sessionId}/scenes` |

## Database state
- Row counts (runs/scenes/stage_attempts/provider_requests/voice_overs/provider_profiles/active_providers) after the server settled: `6/60/8/196/5/5/0`; unchanged after six more reads of the list and the drill-down.
- `Winrun_results/vid4you.sqlite` checksum unchanged.
- The server was stopped by its own process id. The scratch copy is kept for the browser check (step 8) and removed at its end.

## Finding
- The scene's speed factor is returned unrounded (for example `1.0183299389002036`). The page rounds it for display; see the step 8 report.

## Outcome
- Step 7 status: PASS
- Blocking issues: none
