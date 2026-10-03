# Step 10 Report — Manual Testing

- Date: 2026-09-29
- Change: decide-silence-allocation (JOS-142)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-142-decide-silence-allocation`

## Setup (task 10.1)

The real server (`node src/server.ts`, port 3199) on a scratch database and scratch projects folder (`DB_PATH`, `PROJECTS_ROOT`); `GET /docs` answered 200.

## Real narration and decomposition (task 10.2)

Reused `english-exclamation-paragraph`'s real narration (native timestamps, ElevenLabs) already fetched for real in step 2 — no new provider call needed for this check, since the data is already real. A session was created through `POST /sessions`, the real MP3 and timestamps stored, and `runDecompositionPhase` run with a stub instruction generator (no route triggers it, by decision).

- **Phase result:** `{"ok":true,"sceneIds":[...]}`, 4 chunks registered.
- **`GET /sessions/:id`:** `chunks-processing`, 4 chunks, prompts in order and matching the script's own text.
- **Direct check of the adopted rule** — `unitBoundaries` was called on the real speech spans and compared against both formulas at all 6 inner boundaries:

| Boundary | Computed | Matches rule A (next unit's start) | Matches the rejected midpoint rule |
|---|---|---|---|
| 1 | 4.830 s | **yes** | no |
| 2 | 12.005 s | **yes** | no |
| 3 | 19.632 s | **yes** | no |
| 4 | 25.518 s | **yes** | no |
| 5 | 33.402 s | **yes** | no |
| 6 | 39.973 s | **yes** | no |

Every boundary matches rule A exactly and none match the old midpoint rule — the code change is confirmed live, against real narration, not just against synthetic unit tests. `boundaries[0] = 0` and `boundaries[last] = 46.254` (the MP3's own measured duration) hold as required. The 7 sentence-level durations derived from these boundaries sum to `46.254000`, matching the MP3 duration to the microsecond.

## Cleanup and state (task 10.3)

- Backend log: 0 warn/error lines across the whole run.
- The server was stopped; the scratch store was emptied with the test-only `resetAll()`: `runs`, `scenes`, `voice_overs`, `narration_timestamps` all 0, all 11 triggers present, 0 project folders left.
- The default test store (`backend/data/`) was not touched (confirmed via `git status`).

## Outcome

- Step 10 status: PASS
- Blocking issues: none
