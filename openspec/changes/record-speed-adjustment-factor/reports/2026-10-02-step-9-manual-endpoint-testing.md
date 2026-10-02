# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-10-02
- Change: record-speed-adjustment-factor (JOS-148)
- Agent: Claude Sonnet 5

## Setup

Started the real server against a scratch store, isolated from the default one:

```bash
DB_PATH=/tmp/jos148-curl/scratch.sqlite PROJECTS_ROOT=/tmp/jos148-curl/projects PORT=3148 node src/server.ts
curl -s http://127.0.0.1:3148/health
# {"ok":true}
```

`runDecompositionPhase`/`registerDecomposition` are not yet wired to any route or to voice-over completion (`sceneRegistration.ts`'s own top comment: "Nothing in the running app calls this yet"). Following `request-admitted-clip-duration` (JOS-147)'s own precedent, chunks were registered by calling `registerDecomposition` directly (a small script, `register.mjs`, setting the same `DB_PATH`/`PROJECTS_ROOT` the live server reads) against a stub instruction generator, then every read/write/lock check below went through the real HTTP routes.

## 9.2 — GET /sessions/:id, hand-verified against the group-2 formula

```bash
curl -s -X POST http://127.0.0.1:3148/sessions -H "Content-Type: application/json" \
  -d '{"title":"JOS-148 curl test","script":"The harbor is quiet at dusk. Fishing boats return with the tide. Gulls circle overhead.","language":"en"}'
# -> sessionId 01M3YMTC93SJXJ6TQK3YFZ7GCN
node register.mjs 01M3YMTC93SJXJ6TQK3YFZ7GCN ordinary
# {"ok":true,"sceneIds":[...3 ids...]}
curl -s http://127.0.0.1:3148/sessions/01M3YMTC93SJXJ6TQK3YFZ7GCN
```

Result (3 scenes, intervals 0-6/6-15.5/15.5-20.5):

| Scene | Interval (s) | requestedDurationSeconds | speedFactor | Hand check |
|---|---|---|---|---|
| 1 | 6.0 | 6 | 1 | 6/6 = 1 ✓ |
| 2 | 9.5 | 10 | 1.0526315789473684 | 10/9.5 = 1.05263... ✓ |
| 3 | 5.0 | 5 | 1 | 5/5 = 1 ✓ |

No `durationWarning` or `speedFactorWarning` on any scene — all factors well under the 2.0 limit, matching expectation.

## 9.3 / 9.4 — Factor over the limit, combined with the unsplittable-sentence duration warning

A second session, scripted as a single long sentence, registered with `exception: "unsplittable-sentence"` at 35s narrated (admitted maximum 15s, factor 35/15 ≈ 2.333, over the 2.0 limit):

```bash
curl -s -X POST http://127.0.0.1:3148/sessions -H "Content-Type: application/json" \
  -d '{"title":"JOS-148 curl test over-limit","script":"A single very long unsplittable sentence that exceeds the maximum admitted duration by a wide margin.","language":"en"}'
# -> sessionId 01M3YMWBABEMDA476E6REPAFEC
node register.mjs 01M3YMWBABEMDA476E6REPAFEC over-limit
curl -s http://127.0.0.1:3148/sessions/01M3YMWBABEMDA476E6REPAFEC
```

Result:

```
session.state: chunks-processing
scene 1: state=submitted requestedDurationSeconds=15 durationWarning=exceeds-maximum speedFactor=2.3333333333333335 speedFactorWarning=exceeds-limit
```

Confirms both tasks at once: the factor over the limit records `speedFactorWarning: "exceeds-limit"` without failing the chunk (`submitted`, not `failed`) or the session (`chunks-processing`, not `failed`); and `durationWarning`/`speedFactorWarning` coexist independently on the same scene, as the spec requires.

## 9.5 — Attempts to change the values are refused

**Via the correction route**, with the extra fields in the body (the scene is `submitted`, so the route refuses before any write — body schema strips/ignores unknown fields regardless):

```bash
curl -s -X POST http://127.0.0.1:3148/sessions/01M3YMWBABEMDA476E6REPAFEC/scenes/43b8e77a-7dd1-45a6-a26f-c759231e5d07/correct \
  -H "Content-Type: application/json" \
  -d '{"instruction":"a corrected image instruction","speedFactor":999,"speedFactorWarning":"exceeds-limit"}'
# {"ok":false,"reason":"correction is only offered on a failed stage, not 'submitted'"}  (409)
```

Re-read confirmed `speedFactor`/`speedFactorWarning` unchanged (`2.3333333333333335`/`exceeds-limit`) after the attempt.

**Via a direct database `UPDATE`** against the live scratch store:

```
speed_factor refused: locked: scenes.speed_factor cannot be modified once the chunk is established
speed_factor_warning refused: locked: scenes.speed_factor_warning cannot be modified once the chunk is established
still: { speed_factor: 2.3333333333333335, speed_factor_warning: 'exceeds-limit' }
```

Both refused with the expected trigger message; values unchanged.

## 9.6 — OpenAPI documentation

```bash
curl -s http://127.0.0.1:3148/docs/json
```

`speedFactor` appears 4 times, `speedFactorWarning` 2 times, all inside scene response schemas; zero occurrences inside any operation's `requestBody`.

## 9.7 — Cleanup

```js
process.env.DB_PATH = "/tmp/jos148-curl/scratch.sqlite";
process.env.PROJECTS_ROOT = "/tmp/jos148-curl/projects";
// resetAll() from db.ts
```

Scratch store's `runs`/`scenes` back to 0 rows. Server stopped. Default store (`backend/data/skeleton.sqlite`) re-checked and confirmed untouched (`runs`: 0, `scenes`: 0, no project folders) — a different `DB_PATH`/`PROJECTS_ROOT` the whole time, so this was a sanity check, not a restoration. The scratch directory (`/tmp/jos148-curl/`) itself was deleted.

## Outcome

- Step 9 status: PASS
- Blocking issues: none
