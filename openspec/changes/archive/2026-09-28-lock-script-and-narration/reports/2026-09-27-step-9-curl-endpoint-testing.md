# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-09-27
- Change: lock-script-and-narration (JOS-137)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-137-lock-script-and-narration` at `58e5a14`
- Runtime: Node v26.4.0, the real server started as `node src/server.ts` (strip-only mode), on port 3199

## Environment

The server ran against a **scratch** database and project folder (`DB_PATH=$SCRATCH/curl.sqlite`, `PROJECTS_ROOT=$SCRATCH/projects`), never the shared test store. `$B` below is `http://127.0.0.1:3199`. The scratch store was created fresh by the server at boot, so its baseline is: no rows, all five triggers, an empty projects folder.

## Results

| # | Check | Result |
|---|---|---|
| 9.1 | Start the backend; `GET /health` | PASS: `{"ok":true}` |
| 9.2 | `POST /sessions` | PASS: 201, state `submitted` |
| 9.2 | `PUT`, `PATCH`, `DELETE` `/sessions/:id` with a new script | PASS: all three 404 (no such route) |
| 9.2 | `GET /sessions/:id` afterwards | PASS: script, title and language exactly as submitted |
| 9.3 | `POST .../scenes/:sceneId/correct` with `instruction` plus `script`, `title`, `language` in the body | PASS: 200; only the instruction changed (`the original instruction` -> `a corrected instruction`); script, title and language unchanged |
| 9.3 | Same route with a body of only `script` | PASS: 400 (see the note below) |
| 9.4 | Raw SQL `UPDATE runs SET script / title / language` on the running database | PASS: each refused with `locked: runs.<column> cannot be modified after registration`; values unchanged |
| 9.4 | Raw SQL `UPDATE runs SET paused = 0` | PASS: allowed (an unlocked column) |
| 9.4 | Raw SQL `UPDATE` of a stored voice-over row | PASS: refused, `locked: voice_overs cannot be modified once the narration is complete` |
| 9.4 | Raw SQL `DELETE` of the voice-over row | PASS: refused, `locked: voice_overs cannot be deleted once the narration is complete` |
| 9.4 | Raw SQL second `INSERT` for the same session | PASS: refused, `UNIQUE constraint failed: voice_overs.run_id`; one row remains, `voice-over.mp3` |
| 9.4 | `GET /health` after all of the above | PASS: server still healthy |
| 9.5 | Clean up through the test-only reset (`resetAll`) and compare | PASS: see Cleanup |

### Notes

- **The 400 is a validation error, not a lock message.** The body `{"script":"HACKED script"}` was rejected because the required `instruction` field is missing (`body/instruction Required` in the server log). A body that also carries `instruction` succeeds and simply ignores `script`, `title` and `language`, which is what matters for the lock. The API never reads those fields from a request body.
- **A scene had to be seeded.** No operation creates scenes yet (decomposition is not built), so one failed scene was inserted directly with `sqlite3` into the scratch database to exercise the correction route, and the session was paused so the retry was held and no provider timer ran.
- **The voice-over row was inserted with raw SQL** for the same reason: the voice launch (JOS-136) does not exist yet, so no API path stores one. The point of 9.4 is that the store refuses changes whatever wrote the row.
- **Server log:** 12 requests, 0 error-level and 0 warn-level lines. Statuses: 6 x 200, 2 x 201, 3 x 404, 1 x 400 (the validation error is logged twice by the framework, so a naive count of `"statusCode":400` shows more).
- The server started under real `node` in strip-only mode, which also confirms the fix from task 4.7 works in practice.

## Cleanup

- State left by the run: 2 runs, 1 scene, 1 voice-over, 0 stage attempts, 2 project folders, all five triggers.
- Server stopped (no response on `/health` afterwards).
- Cleaned through the test-only reset path: `resetAll()` against the scratch database printed `{"runs":0,"scenes":0,"providerRequests":0,"sceneResults":0,"voiceOvers":0,"stageAttempts":0}`.
- After the reset: 0 rows everywhere, **all five triggers present** (the reset drops and recreates the voice-over delete trigger inside one transaction), 0 project folders, which equals a fresh store.
- The default test store (`backend/data/skeleton.sqlite`) was never touched: 0 rows, all five triggers, 0 project folders before and after.
- The scratch folder was deleted after this report was written.

## Outcome

- Step 9 status: PASS
- Blocking issues: none

## Transcript

Commands and output as executed. Paths are shortened: `$SCRATCH` is the scratch folder, `$B` is the server URL.

```text
### 9.2 create a session
$ curl -s -i -X POST $B/sessions -H 'Content-Type: application/json' -d '{"title":"Curl lock test","script":"The original script, exactly as submitted.","language":"en"}' | sed -n '1p;/^{/p' | cut -c1-260
HTTP/1.1 201 Created
{"session":{"type":"session","sessionId":"01M3K2PPZP0E03184WKX2BZNDT","title":"Curl lock test","script":"The original script, exactly as submitted.","language":"en","state":"submitted","paused":false,"createdAt":"2026-09-28T03:59:56.406Z","updatedAt":"2026-09-

session used below: 01M3K2PQ0EQXZAQENE3TW1XJXN
### 9.2 PUT / PATCH / DELETE with a new script
$ curl -s -o /dev/null -w '%{http_code}
' -X PUT $B/sessions/01M3K2PQ0EQXZAQENE3TW1XJXN -H 'Content-Type: application/json' -d '{"script":"A REWRITTEN script."}'
404

$ curl -s -o /dev/null -w '%{http_code}
' -X PATCH $B/sessions/01M3K2PQ0EQXZAQENE3TW1XJXN -H 'Content-Type: application/json' -d '{"script":"A REWRITTEN script."}'
404

$ curl -s -o /dev/null -w '%{http_code}
' -X DELETE $B/sessions/01M3K2PQ0EQXZAQENE3TW1XJXN -H 'Content-Type: application/json' -d '{"script":"A REWRITTEN script."}'
404

### 9.2 read the session back
$ curl -s $B/sessions/01M3K2PQ0EQXZAQENE3TW1XJXN | python3 -c "import json,sys; s=json.load(sys.stdin)['session']; print({k:s[k] for k in ('title','script','language','state')})"
{'title': 'Curl lock test 2', 'script': 'The original script, exactly as submitted.', 'language': 'en', 'state': 'submitted'}

### 9.3 seed one failed scene (no API creates scenes yet), pause the session so the retry is held
$ sqlite3 $SCRATCH/curl.sqlite "INSERT INTO scenes (id, run_id, idx, status, attempts, last_error, instruction, provider, provider_mode, provider_latency_ms, updated_at) VALUES ('26764702-c7dc-484e-9970-6abe9f97373f', '01M3K2PQ0EQXZAQENE3TW1XJXN', 1, 'failed', 4, 'stub failure', 'the original instruction', 'stub-image-provider', 'success', 200, '2026-09-27T22:00:00.000Z');" && echo seeded
seeded

$ curl -s -X POST $B/sessions/01M3K2PQ0EQXZAQENE3TW1XJXN/pause
{"ok":true}
### 9.3 correct the instruction while naming script, title and language in the body
$ curl -s -i -X POST $B/sessions/01M3K2PQ0EQXZAQENE3TW1XJXN/scenes/26764702-c7dc-484e-9970-6abe9f97373f/correct -H 'Content-Type: application/json' -d '{"instruction":"a corrected instruction","script":"HACKED script","title":"HACKED title","language":"es"}' | sed -n '1p;$p'
HTTP/1.1 200 OK
{"ok":true}
### 9.3 a body with only locked fields
$ curl -s -o /dev/null -w '%{http_code}
' -X POST $B/sessions/01M3K2PQ0EQXZAQENE3TW1XJXN/scenes/26764702-c7dc-484e-9970-6abe9f97373f/correct -H 'Content-Type: application/json' -d '{"script":"HACKED script"}'
400

### 9.3 read back the session and the scene
$ curl -s $B/sessions/01M3K2PQ0EQXZAQENE3TW1XJXN | python3 -c "import json,sys; d=json.load(sys.stdin); s=d['session']; print({k:s[k] for k in ('title','script','language','state','paused')}); print([(x['state'], x['instruction']) for x in d['scenes']])"
{'title': 'Curl lock test 2', 'script': 'The original script, exactly as submitted.', 'language': 'en', 'state': 'chunks-processing', 'paused': True}
[('submitted', 'a corrected instruction')]

### 9.4 raw SQL against the running database: the locked session columns
$ sqlite3 $SCRATCH/curl.sqlite "UPDATE runs SET script = 'tampered' WHERE id = '01M3K2PQ0EQXZAQENE3TW1XJXN';"
Error: stepping, locked: runs.script cannot be modified after registration (19)

$ sqlite3 $SCRATCH/curl.sqlite "UPDATE runs SET title = 'tampered' WHERE id = '01M3K2PQ0EQXZAQENE3TW1XJXN';"
Error: stepping, locked: runs.title cannot be modified after registration (19)

$ sqlite3 $SCRATCH/curl.sqlite "UPDATE runs SET language = 'tampered' WHERE id = '01M3K2PQ0EQXZAQENE3TW1XJXN';"
Error: stepping, locked: runs.language cannot be modified after registration (19)

$ sqlite3 $SCRATCH/curl.sqlite "UPDATE runs SET paused = 0 WHERE id = '01M3K2PQ0EQXZAQENE3TW1XJXN'; select 'paused now:', paused from runs where id='01M3K2PQ0EQXZAQENE3TW1XJXN';"
paused now:|0

$ sqlite3 $SCRATCH/curl.sqlite "select 'script:', script, '| title:', title, '| language:', language from runs where id='01M3K2PQ0EQXZAQENE3TW1XJXN';"
script:|The original script, exactly as submitted.|| title:|Curl lock test 2|| language:|en

### 9.4 store a voice-over row, then try to change, delete and duplicate it
$ sqlite3 $SCRATCH/curl.sqlite "INSERT INTO voice_overs (run_id, audio_path, duration_seconds, size_bytes, native_timestamps_available, completed_at) VALUES ('01M3K2PQ0EQXZAQENE3TW1XJXN', 'voice-over.mp3', 12.5, 200000, 0, '2026-09-27T22:05:00.000Z'); select 'stored:', run_id, audio_path from voice_overs;"
stored:|01M3K2PQ0EQXZAQENE3TW1XJXN|voice-over.mp3

$ sqlite3 $SCRATCH/curl.sqlite "UPDATE voice_overs SET audio_path = 'replaced.mp3' WHERE run_id = '01M3K2PQ0EQXZAQENE3TW1XJXN';"
Error: stepping, locked: voice_overs cannot be modified once the narration is complete (19)

$ sqlite3 $SCRATCH/curl.sqlite "DELETE FROM voice_overs WHERE run_id = '01M3K2PQ0EQXZAQENE3TW1XJXN';"
Error: stepping, locked: voice_overs cannot be deleted once the narration is complete (19)

$ sqlite3 $SCRATCH/curl.sqlite "INSERT INTO voice_overs (run_id, audio_path, duration_seconds, size_bytes, native_timestamps_available, completed_at) VALUES ('01M3K2PQ0EQXZAQENE3TW1XJXN', 'second.mp3', 1, 1, 0, 'now');"
Error: stepping, UNIQUE constraint failed: voice_overs.run_id (19)

$ sqlite3 $SCRATCH/curl.sqlite "select 'voice_overs rows:', count(*), audio_path from voice_overs;"
voice_overs rows:|1|voice-over.mp3

### 9.4 the server is still healthy
$ curl -s $B/health
{"ok":true}
### 9.5 state left by the run
runs|2 scenes|1 voice_overs|1 stage_attempts|0 
triggers: runs_language_locked,runs_script_locked,runs_title_locked,voice_overs_no_delete,voice_overs_no_update
project folders: 2
### 9.5 stop the server
server stopped (no response)
### 9.5 clean up through the test-only reset path (resetAll), on the scratch database
after resetAll: {"runs":0,"scenes":0,"providerRequests":0,"sceneResults":0,"voiceOvers":0,"stageAttempts":0}
### 9.5 state after the reset (must equal a fresh store: empty, all 5 triggers, empty projects folder)
runs|0 scenes|0 voice_overs|0 stage_attempts|0 
triggers: runs_language_locked,runs_script_locked,runs_title_locked,voice_overs_no_delete,voice_overs_no_update
project folders: 0
### 9.5 the default test store was never touched
runs|0 scenes|0 voice_overs|0 stage_attempts|0 
triggers: runs_language_locked,runs_script_locked,runs_title_locked,voice_overs_no_delete,voice_overs_no_update
project folders: 0
```
