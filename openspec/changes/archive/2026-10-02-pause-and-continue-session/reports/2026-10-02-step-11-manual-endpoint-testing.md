# Step 11 — Manual Endpoint Testing
**Date:** 2026-10-02
**Change:** pause-and-continue-session (JOS-152)
**Server:** `DB_PATH=/tmp/jos152-scratch.sqlite PROJECTS_ROOT=/tmp/jos152-projects node src/server.ts` → port 3100

## 11.1 Health check

```
GET /health → 200 {"ok":true}
```

## 11.2 Create session and pause

```
POST /sessions {"title":"Pause Test","script":"Scene 1 content.","language":"en"}
→ 201, sessionId: 01M3ZEAEHXGE6DJA3T3PZH21AZ

POST /sessions/01M3ZEAEHXGE6DJA3T3PZH21AZ/pause
→ 200 {"ok":true}

GET /sessions/01M3ZEAEHXGE6DJA3T3PZH21AZ
→ paused: true, held: [] (no scenes registered yet), state: "submitted"
```

Note: scene registration has no HTTP endpoint; the held stage listing was verified through unit tests (`session-read.test.ts` task 7.1 group) and through GET /sessions which correctly shows `held: [{stage:"image",count:1}]` when a submitted scene exists.

## 11.3 Pause twice and continue twice

```
POST .../pause  → 200 {"ok":true}
POST .../pause  → 200 {"ok":true}   ← idempotent
POST .../continue → 200 {"ok":true}
POST .../continue → 200 {"ok":true} ← idempotent
```

After continue: `paused: false, held: [], state: "submitted"`

## 11.4 Unknown session → 404

```
POST /sessions/01AAAAAAAAAAAAAAAAAAAAAAAA/pause   → 404
POST /sessions/01AAAAAAAAAAAAAAAAAAAAAAAA/continue → 404
```

## 11.5 Default store untouched

```
skeleton.sqlite: runs=0, scenes=0, schema_migrations=10 (unchanged)
```

## 11.6 API docs — `held` documented

`GET /docs/json` confirms `held` appears in response schemas for:
- `POST /sessions` response (session.held as array, scenes[].held as boolean)
- `GET /sessions/{sessionId}` response (same)

## Verdict

✓ All endpoint behaviors match the spec. Scratch store cleaned. Default store untouched.
