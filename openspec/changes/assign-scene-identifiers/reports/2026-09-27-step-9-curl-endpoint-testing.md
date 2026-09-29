# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-09-27
- Change: assign-scene-identifiers (JOS-144)
- Agent: Claude Opus 5.5
- Branch: `feature/jos-144-assign-scene-identifiers` at `31bba6d`
- Runtime: Node v26.4.0, the real server started as `node src/server.ts` on port 3199, against a **scratch** database and project folder

## How registration was exercised

By product-owner decision no route triggers a decomposition yet. Registration was therefore run by a small script that calls `registerDecomposition` against the same scratch database the running server uses, with a stub instruction generator (no provider cost). Everything else went through the real API or `sqlite3`. The real reasoning provider was called once, through the opt-in contract test (9.5).

## Results

| # | Check | Result |
|---|---|---|
| 9.1 | Start the server; `GET /health` | PASS |
| 9.2 | Session before registration | PASS: `submitted`, 0 scenes |
| 9.2 | Register three valid fragments | PASS: `ok: true`, three scene ids |
| 9.2 | `GET /sessions/:id` | PASS: `chunks-processing`; scenes 1, 2, 3 in order, each `submitted` with its `prompt` (the fragment text), `imageInstruction` and `videoInstruction` |
| 9.2 | Register again on the same session | PASS: `already-registered` |
| 9.3 | Register an invalid decomposition (a 2.5 s fragment, no exception) on another session | PASS: `decomposition-failed`, retryable; the cause reads "The system's scene decomposition was invalid: scene 1 lasts 2.5 s, below the 5 s lower bound. This is not an error in your script, which is unchanged." |
| 9.3 | `GET` that session | PASS: `failed`, failed phase `decomposition`, 0 scenes |
| 9.4 | `DELETE`, `PUT`, `PATCH` a scene; `POST` to `split`, `merge`, `reorder`, `move` | PASS: all 404 |
| 9.4 | Correction whose body names `idx`, `index` and `prompt` (scene set to failed, session paused) | PASS: 200; number and prompt unchanged, only the instruction changed |
| 9.4 | Raw SQL: update `idx`, `prompt`, `run_id`; delete a scene | PASS: each refused by its trigger, naming the field |
| 9.4 | Raw SQL: a second scene numbered 1 in the same session | PASS: refused, `UNIQUE constraint failed: scenes.run_id, scenes.idx` |
| 9.4 | Raw SQL: update `video_instruction` | PASS: allowed (correctable, PRD §10.3) |
| 9.4 | Scene list afterwards; `GET /health` | PASS: still 1, 2, 3 with their original prompts; server healthy |
| 9.5 | Opt-in contract test against the real reasoning provider | PASS: two non-empty instruction pairs for two fragments, 10.5 s |
| 9.6 | Cleanup | PASS: see below |

### Notes

- **The two image instructions diverge after a correction, as recorded in design Decision 3.** The correction route (skeleton, owned by JOS-157) wrote the new text to `instruction` only; `image_instruction` kept the generated text. This is the known hand-off to JOS-145 (move the image stage to `image_instruction`) and JOS-157 (correct it), not a regression.
- **Real provider latency:** the contract test took 10.5 s for one short request. That is within the 20 s phase limit, but above the 6.4-8.5 s range JOS-165 observed. One sample only; worth watching once real scripts run.
- **Cost:** one short chat-completions request (two one-sentence fragments). The exact cost was not measured.
- **Server log:** 16 requests; 7 x 200, 2 x 201, 7 x 404; 0 warn-level and 0 error-level lines.

## Cleanup

- Left by the run: 2 sessions, 3 scenes, 9 triggers, 2 project folders.
- Server stopped (no response afterwards).
- Cleaned through the test-only reset: `resetAll()` printed all counts at 0; afterwards 0 rows, **all 9 triggers present**, 0 project folders.
- The default test store was not touched: 0 rows, 9 triggers, 0 project folders.
- The scratch folder was deleted after this report was written.

## Outcome

- Step 9 status: PASS
- Blocking issues: none

## Transcript

Paths shortened: `$SCRATCH` is the scratch folder, `$B` the server URL.

```text
### 9.2 create a session, register a valid decomposition, read it back
session: 01M3K9FS21JPE2C9YVESCRAJM5
$ curl -s $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5 | python3 -c "import json,sys; d=json.load(sys.stdin); print('state before:', d['session']['state'], '| scenes:', len(d['scenes']))"
state before: submitted | scenes: 0

$ DB_PATH=$SCRATCH/curl.sqlite PROJECTS_ROOT=$SCRATCH/projects node $SCRATCH/register.ts 01M3K9FS21JPE2C9YVESCRAJM5 valid 2>&1 | grep -v Warning | sed -E 's/[0-9a-f-]{36}/<uuid>/g'
{"ok":true,"sceneIds":["<uuid>","<uuid>","<uuid>"]}

$ curl -s $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5 | python3 -c "import json,sys; d=json.load(sys.stdin); print('state after:', d['session']['state']); [print(' ', s['index'], s['state'], '|', s['prompt'], '|', s['imageInstruction'][:40], '|', s['videoInstruction']) for s in d['scenes']]"
state after: chunks-processing
  1 submitted | The harbor is quiet at dusk. | Still image for scene 1: The harbor is q | Slow camera push for scene 1
  2 submitted | Fishing boats return with the evening tide. | Still image for scene 2: Fishing boats r | Slow camera push for scene 2
  3 submitted | Gulls circle above the masts. | Still image for scene 3: Gulls circle ab | Slow camera push for scene 3

### 9.3 another session, an invalid decomposition (a 2.5 s fragment, no exception)
$ DB_PATH=$SCRATCH/curl.sqlite PROJECTS_ROOT=$SCRATCH/projects node $SCRATCH/register.ts 01M3K9FSA5ATV1YVAVXAFJT1Q9 invalid 2>&1 | grep -v Warning | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['ok'], r['reason']); print('cause:', r['failure']['cause']); print('retryable:', r['failure']['retryable'])"
False decomposition-failed
cause: The system's scene decomposition was invalid: scene 1 lasts 2.5 s, below the 5 s lower bound. This is not an error in your script, which is unchanged.
retryable: True

$ curl -s $B/sessions/01M3K9FSA5ATV1YVAVXAFJT1Q9 | python3 -c "import json,sys; d=json.load(sys.stdin); print('state:', d['session']['state'], '| failedPhase:', d['session'].get('failedPhase'), '| scenes:', len(d['scenes']))"
state: failed | failedPhase: decomposition | scenes: 0

### a second registration on the first session is refused
$ DB_PATH=$SCRATCH/curl.sqlite PROJECTS_ROOT=$SCRATCH/projects node $SCRATCH/register.ts 01M3K9FS21JPE2C9YVESCRAJM5 valid 2>&1 | grep -v Warning
{"ok":false,"reason":"already-registered"}

scene 1: e6c75601-84c0-487c-8a0c-e5930a825fc4
### 9.4 split / merge / delete / reorder through the API
$ curl -s -o /dev/null -w 'DELETE scene -> %{http_code}
' -X DELETE $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/scenes/e6c75601-84c0-487c-8a0c-e5930a825fc4 -H 'Content-Type: application/json' -d '{"index":2}'
DELETE scene -> 404

$ curl -s -o /dev/null -w 'PUT scene -> %{http_code}
' -X PUT $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/scenes/e6c75601-84c0-487c-8a0c-e5930a825fc4 -H 'Content-Type: application/json' -d '{"index":2}'
PUT scene -> 404

$ curl -s -o /dev/null -w 'PATCH scene -> %{http_code}
' -X PATCH $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/scenes/e6c75601-84c0-487c-8a0c-e5930a825fc4 -H 'Content-Type: application/json' -d '{"index":2}'
PATCH scene -> 404

$ curl -s -o /dev/null -w 'POST split -> %{http_code}
' -X POST $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/scenes/e6c75601-84c0-487c-8a0c-e5930a825fc4/split -H 'Content-Type: application/json' -d '{}'
POST split -> 404

$ curl -s -o /dev/null -w 'POST merge -> %{http_code}
' -X POST $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/scenes/e6c75601-84c0-487c-8a0c-e5930a825fc4/merge -H 'Content-Type: application/json' -d '{}'
POST merge -> 404

$ curl -s -o /dev/null -w 'POST reorder -> %{http_code}
' -X POST $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/scenes/e6c75601-84c0-487c-8a0c-e5930a825fc4/reorder -H 'Content-Type: application/json' -d '{}'
POST reorder -> 404

$ curl -s -o /dev/null -w 'POST move -> %{http_code}
' -X POST $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/scenes/e6c75601-84c0-487c-8a0c-e5930a825fc4/move -H 'Content-Type: application/json' -d '{}'
POST move -> 404

### 9.4 a correction whose body names idx and prompt (scene marked failed first, session paused so the retry is held)
$ curl -s -X POST $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/pause
{"ok":true}
$ sqlite3 $SCRATCH/curl.sqlite "UPDATE scenes SET status='failed', last_error='stub failure' WHERE id='e6c75601-84c0-487c-8a0c-e5930a825fc4'; select 'status now:', status from scenes where id='e6c75601-84c0-487c-8a0c-e5930a825fc4';"
status now:|failed

$ curl -s -X POST $B/sessions/01M3K9FS21JPE2C9YVESCRAJM5/scenes/e6c75601-84c0-487c-8a0c-e5930a825fc4/correct -H 'Content-Type: application/json' -d '{"instruction":"a corrected image instruction","idx":3,"index":3,"prompt":"HACKED"}'
{"ok":true}
$ sqlite3 $SCRATCH/curl.sqlite "select 'scene:', idx, prompt, '| instruction:', instruction from scenes where id='e6c75601-84c0-487c-8a0c-e5930a825fc4';"
scene:|1|The harbor is quiet at dusk.|| instruction:|a corrected image instruction

### 9.4 raw SQL against the running database
$ sqlite3 $SCRATCH/curl.sqlite "UPDATE scenes SET idx = 9 WHERE id='e6c75601-84c0-487c-8a0c-e5930a825fc4';"
Error: stepping, locked: scenes.idx cannot be modified once the chunk is established (19)

$ sqlite3 $SCRATCH/curl.sqlite "UPDATE scenes SET prompt = 'tampered' WHERE id='e6c75601-84c0-487c-8a0c-e5930a825fc4';"
Error: stepping, locked: scenes.prompt cannot be modified once the chunk is established (19)

$ sqlite3 $SCRATCH/curl.sqlite "UPDATE scenes SET run_id = '01M3K9FSA5ATV1YVAVXAFJT1Q9' WHERE id='e6c75601-84c0-487c-8a0c-e5930a825fc4';"
Error: stepping, locked: scenes.run_id cannot be modified once the chunk is established (19)

$ sqlite3 $SCRATCH/curl.sqlite "DELETE FROM scenes WHERE id='e6c75601-84c0-487c-8a0c-e5930a825fc4';"
Error: stepping, locked: scenes cannot be deleted once the chunk is established (19)

$ sqlite3 $SCRATCH/curl.sqlite "INSERT INTO scenes (id, run_id, idx, status, updated_at) VALUES ('dup', '01M3K9FS21JPE2C9YVESCRAJM5', 1, 'submitted', 'now');"
Error: stepping, UNIQUE constraint failed: scenes.run_id, scenes.idx (19)

$ sqlite3 $SCRATCH/curl.sqlite "UPDATE scenes SET video_instruction = 'a corrected video instruction' WHERE id='e6c75601-84c0-487c-8a0c-e5930a825fc4'; select 'video now:', video_instruction from scenes where id='e6c75601-84c0-487c-8a0c-e5930a825fc4';"
video now:|a corrected video instruction

$ sqlite3 $SCRATCH/curl.sqlite "select 'scenes of S1:', group_concat(idx || '=' || prompt, ' | ') from (select idx, prompt from scenes where run_id='01M3K9FS21JPE2C9YVESCRAJM5' order by idx);"
scenes of S1:|1=The harbor is quiet at dusk. | 2=Fishing boats return with the evening tide. | 3=Gulls circle above the masts.

$ curl -s $B/health
{"ok":true}
### 9.5 opt-in contract test against the real reasoning provider (one request)
 ✓ test/visual-instructions.contract.test.ts (1 test) 10494ms
   ✓ The real reasoning provider returns one instruction pair per fragment > answers a two-fragment English request with two non-empty pairs  10493ms
      Tests  1 passed (1)
   Duration  10.71s (transform 35ms, setup 0ms, collect 41ms, tests 10.49s, environment 0ms, prepare 50ms)
wall time: 11 s
### 9.6 cleanup
left by the run: runs 2, scenes 3, triggers 9, project folders 2
server after stop: no response
after resetAll: {"runs":0,"scenes":0,"providerRequests":0,"sceneResults":0,"voiceOvers":0,"stageAttempts":0}
after reset: runs 0, scenes 0, triggers 9, project folders 0
default store: runs 0, scenes 0, triggers 9, project folders 0
```
