# Step 7 — Manual Endpoint Testing with curl

**Change:** consult-session (JOS-135)
**Date:** 2026-09-26
**Endpoint under test:** `GET /sessions/:sessionId`, `GET /sessions/:sessionId/scenes/:sceneId/download/:kind`

## Isolation

The real backend was started with its own isolated store and a non-default port, so this
step never touches the developer's own `data/skeleton.sqlite` / `data/projects/`:

```
DB_PATH=data/curl-test.sqlite PROJECTS_ROOT=data/curl-test-projects PORT=3101 npm start
```

## 7.1 — Backend reachable

```
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3101/
200
```

## 7.2 — Pre-test session count (isolated store)

`SELECT COUNT(*) FROM runs;` → `0`

## 7.3 — Two sessions, same title

```
POST /sessions {"title":"Curl Twin","script":"A wide shot of a harbor at dawn.","language":"en"}
→ 01M3FSM08333RSQGVT6BGW97P1

POST /sessions {"title":"Curl Twin","script":"A different script entirely, byte for byte.","language":"es"}
→ 01M3FSM0ACTMD19RVDWGEKKCNZ
```

## 7.4 — GET each by identifier

Both returned `200` with their own `title`/`script`/`language`, byte-identical to what was
posted, and no cross-contamination:

- Session A: `script: "A wide shot of a harbor at dawn."`, `language: "en"`
- Session B: `script: "A different script entirely, byte for byte."`, `language: "es"`

## 7.5 — Unknown and malformed identifiers (Decision 4)

```
GET /sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV  (valid ULID shape, no such session)
→ 404 {"error":"session not found"}

GET /sessions/not-a-valid-identifier-at-all  (malformed)
→ 404 {"error":"session not found"}
```

Identical status and body — malformed is indistinguishable from unknown, per Decision 4.

## 7.6 — No forbidden fields

`session` keys returned: `type, sessionId, title, script, language, state, paused,
createdAt, updatedAt`. None of `voiceOver, mp3, timestamps, generatedTexts, script_mp3,
narrationPath` present.

## 7.7 — No authentication required

Every request above was sent with no `Authorization` header of any kind; all succeeded
(or correctly 404'd) as expected. No auth layer intercepted any of them.

## 7.8 — Cleanup and store verification

```
DELETE FROM runs;  -- isolated curl-test.sqlite → 0 rows after
```

Server stopped (port 3101 freed); `data/curl-test.sqlite`(+`-shm`/`-wal`) and
`data/curl-test-projects/` removed.

Real store re-verified unchanged throughout this step:

| | Before | After |
|---|---|---|
| `runs` in `data/skeleton.sqlite` | 0 | 0 |
| `data/projects/` folders | 1 | 1 |

## Outcome

All curl scenarios from the spec passed against the real running backend. No product code
changes were needed as a result of this step — the fixes from groups 2–3 (scoped
`getSceneForRun`, loosened request-side identifier validation) already produce the correct
behaviour end to end.
