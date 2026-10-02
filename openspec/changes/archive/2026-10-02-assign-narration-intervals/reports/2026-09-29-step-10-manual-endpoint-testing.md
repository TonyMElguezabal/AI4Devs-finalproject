# Step 10 Report — Manual Endpoint Testing

- Date: 2026-09-29
- Change: assign-narration-intervals (JOS-143)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-143-assign-narration-intervals`

## Setup (task 10.1)

The real server on a scratch database and scratch projects folder, so the shared default store was never opened by the server:

```
DB_PATH=<scratch>/manual.sqlite PROJECTS_ROOT=<scratch>/projects PORT=3199 node src/server.ts
curl -s -i localhost:3199/health   ->   HTTP/1.1 200 OK   {"ok":true}
```

The boot log shows `boot reconciliation complete` and `listening on http://127.0.0.1:3199`. The scratch database was created at migration 9 by the server itself (migrations 2-9 applied).

## Real narration and decomposition (task 10.2)

Reused the real ElevenLabs narration of `english-exclamation-paragraph` (MP3 measured at 46.254150 s, native timestamps) recorded for JOS-142; no new provider call was needed because the data is already real. The script is the concatenation of the timestamps' `alignment.characters`.

1. `POST /sessions` with `{"title":"JOS-143 manual test","script":<that script>,"language":"en"}` -> `201`, session `01M3R625X7Q63YV3KX5523DWHW`.
2. A helper script (kept out of the repo) stored the MP3 and timestamps with `insertVoiceOver` and ran `runDecompositionPhase` with a stub instruction generator, as JOS-142's step 10 did (no route triggers decomposition, by decision). It printed `{"ok":true,"sceneIds":[...4 ids...]}`.
3. `curl -s localhost:3199/sessions/01M3R625X7Q63YV3KX5523DWHW` returned 4 scenes, each with `narrationInterval`:

| Scene | `narrationInterval` (s) | Pause after its last spoken character | 
|---|---|---|
| 1 | 0 -> 12.005 | speech ends 10.890, absorbs 1.115 s |
| 2 | 12.005 -> 25.518 | speech ends 25.077, absorbs 0.441 s |
| 3 | 25.518 -> 33.402 | speech ends 32.798, absorbs 0.604 s |
| 4 | 33.402 -> 46.25415 | reaches the MP3's end |

Checks run on the response and the raw timestamps:

- The first interval starts at 0 and each start equals the previous end exactly (`==`, no tolerance); the last end is `46.25415`, the MP3's measured duration. **Partition OK.**
- Each inner boundary equals the first spoken character's start time of the next scene in the raw timestamps (12.005, 25.518, 33.402): rule A. **Match at all 3 inner boundaries.**
- The first spoken character starts at 0 in this recording, so scene 1 starting at 0 does not by itself exercise leading silence; that case is covered by the unit tests (7.1).

## Trying to change an interval (task 10.3)

Against the registered session, every route that writes to a session or scene was sent `"narrationInterval":{"startSeconds":1,"endSeconds":2}` in its body:

| Request | Response |
|---|---|
| `POST .../scenes/:sceneId/retry` | `409` `cannot retry a scene in status 'submitted'` |
| `POST .../scenes/:sceneId/correct` (with `instruction`) | `409` `correction is only offered on a failed stage, not 'submitted'` |
| `POST .../pause` | `200` `{"ok":true}` |
| `POST .../continue` | `200` `{"ok":true}` |
| `POST /sessions` (with title, script, language) | `201` |

Re-reading the session afterwards: intervals still `(0, 12.005) (12.005, 25.518) (25.518, 33.402) (33.402, 46.25415)`. The two 409 answers come from the scene's status, not from the extra field; the field is not in any request schema and no handler reads it, so it is dropped where the request is accepted. A real image-stage failure, retry and correction cannot be produced without a real provider failure, and that case is pinned by the unit tests in `narration-interval-immutability.test.ts` (5.1).

Direct `UPDATE` on the scratch database (through the `sqlite3` CLI, which shares the file with the server):

```
UPDATE scenes SET narration_start_seconds = 99 WHERE id='3fe12f5d-...';
  -> Error: stepping, locked: scenes.narration_start_seconds cannot be modified once the chunk is established (19)
UPDATE scenes SET narration_end_seconds = 99 WHERE id='3fe12f5d-...';
  -> Error: stepping, locked: scenes.narration_end_seconds cannot be modified once the chunk is established (19)
```

(The command was repeated once through `node:sqlite` as a fallback, which gave the same message without the `stepping,` prefix.) The rows read back unchanged: `[{idx 1: 0 -> 12.005}, {2: 12.005 -> 25.518}, {3: 25.518 -> 33.402}, {4: 33.402 -> 46.25415}]`.

## OpenAPI (task 10.4)

`curl -s localhost:3199/docs/json` and a walk of the whole document for `narrationInterval`:

- 2 occurrences: `POST /sessions` 201 response and `GET /sessions/{sessionId}` 200 response, both under `scenes.items.properties`.
- 0 occurrences under any `requestBody`.
- Shape `{startSeconds: number, endSeconds: number}`, both required, no additional properties, with the description citing PRD §3 and §7.3, read-only and immutable.

## Cleanup (task 10.5)

The server was stopped (`GET /health` no longer answered) and the scratch store reset with the test-only `resetAll()`:

| | Rows before reset | Rows after reset |
|---|---|---|
| runs | 2 | 0 |
| scenes | 4 | 0 |
| scene_results | 4 | 0 |
| provider_requests | 4 | 0 |
| voice_overs / narration_timestamps / stage_attempts | 1 / 1 / 1 | 0 / 0 / 0 |
| `schema_migrations` | 8 (2-9) | 8 (2-9) |
| triggers | 13 | 13 |

The `provider_requests` and `scene_results` rows are registration's own bookkeeping for the four chunks; the server log shows no outbound provider call. The scratch projects folder is empty after the reset.

Default store (`data/skeleton.sqlite`), inspected read-only after the run: every table at 0 rows, 13 triggers, migrations 2-9, `data/projects` empty. Identical to the step 9 baseline, and `git status` shows no tracked file modified.

## Result

PASS. The stored intervals partition the real 46.25415 s narration from 0, each inner boundary is the next scene's speech start, the field is read-only in the API and documented on responses only, and the database refuses both interval updates with the `locked:` message.
