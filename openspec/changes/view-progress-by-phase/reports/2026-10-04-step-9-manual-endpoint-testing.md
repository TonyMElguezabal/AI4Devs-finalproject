# Step 9: manual endpoint testing with curl (JOS-168, view-progress-by-phase)

Date: 2026-10-04. Real server (`node src/server.ts`) on port 3199, with a scratch `DB_PATH` and `PROJECTS_ROOT` in the session scratchpad. No provider was called: `POST /sessions` only registers the run, the sessions were seeded straight into the scratch store (stored narration, recorded failure, stage attempt, one submitted scene), and `/continue` was never called.

| Step | Request | Result |
| --- | --- | --- |
| 9.1 | `GET /health` | `{"ok":true}` |
| 9.2 | `POST /sessions`, then `GET /sessions/:id` | `phases` has four entries in order `voice-over`, `decomposition`, `scenes`, `assembly`, all `pending`, `heldCount` 0 |
| 9.3a | session with a stored narration and a recorded decomposition failure | state `failed`, `failedPhase` `decomposition`; `decomposition` is `failed` with `failure` `{cause, retryable: true}`; `voice-over` is `complete` |
| 9.3b | same session after an in-flight `timestamps` attempt queued after the failure | state `chunk-decomposing`, no `failedPhase`; `decomposition` is `in-progress` with no `failure` |
| 9.3c | paused session with one submitted scene | `held` `[{image, 1}]`; `scenes` is `in-progress` with `heldCount` 1; every other entry 0; the scene has `held: true` |
| 9.4 | `GET /sessions/<valid ULID, unknown>` and `GET /sessions/not-a-valid-id` | both 404 `{"error":"session not found"}` |
| 9.4 | `GET /docs/json` | `phases` documented on the create and read responses, with the phase and status enums and the optional `failure` object |

## Finding: held decomposition cannot occur on a real server yet

Task 9.3 first asked for a paused session with a held decomposition (`heldCount` 1). A paused session that had a stored narration and no timestamps read `held: []` and `heldCount` 0 everywhere. The cause is not this change: `launchGate.ts` lists `voice-over` and `decomposition` as not yet launchable, and only the image, video and assembly stages register a launcher, so `sessionHeldWork` can only report those stages. Per CLAUDE.md section 7 the artifacts were corrected before going on: tasks 9.3 and 10.5 now use a held image scene. The decomposition-to-phase mapping stays covered by the `phase-progress` unit tests (`maps each stage to its phase and sums image and video into scenes`), and will be reachable end to end once a decomposition launcher is registered.

## 9.5 Cleanup

Server stopped, scratch store and folder removed, server log had no error lines. A read-only snapshot of the default store matches the step 8 baseline exactly.
