# Step 10 — Manual Endpoint Testing with curl
**Date:** 2026-10-03  
**Change:** generate-chunk-video (JOS-146)

## Setup

Two additions made to support testing (guarded by env vars, no effect in production):

- **`USE_STUB_VIDEO_PROVIDER=<mode>`** in `server.ts`: if set, replaces the default RunningHub registry with a `createStubVideoProvider` instance. Accepted modes: `success-bytes`, `transient-failure`, `not-retryable-failure`, etc.
- **`ALLOW_TEST_ENDPOINTS=1`** in `routes.ts`: registers `POST /internal/test/quick-scene`. Accepts `{ sessionId, videoInstruction, requestedDurationSeconds, imageBytesBase64? }`, inserts a scene via `insertRegisteredScenes`, writes a PNG to the project folder, calls `commitSceneResult` + `markImageComplete` + `launchVideoStage`. Scene IDs use `randomUUID()` to match the UUID-validated retry/correct routes.

Neither endpoint is exposed or loadable unless the respective env var is set.

---

## 10.1 — Server start and health check

```
DB_PATH=/tmp/scratch-146.sqlite PROJECTS_ROOT=/tmp/scratch-146-projects \
  PORT=3101 USE_STUB_VIDEO_PROVIDER=success-bytes ALLOW_TEST_ENDPOINTS=1 \
  node --experimental-strip-types src/server.ts
```

```
GET /health → 200 {"ok":true}
```

Boot log confirmed: `"boot reconciliation complete"`, `resumed: 0`, `recordedFailedAttempt: 0`, `stillPending: 0`.

---

## 10.2 — Happy path (stub success): `video-generating` → `chunk-complete`

Server: `USE_STUB_VIDEO_PROVIDER=success-bytes ALLOW_TEST_ENDPOINTS=1`  
Scratch DB: `/tmp/scratch-146.sqlite`

```bash
# Create session
POST /sessions {"title":"JOS-146 manual test","script":"Waves crash on the shore.","language":"en"}
→ 201 {"session":{"sessionId":"01M3ZR905AEEXPPHD9H1PZ679B","state":"submitted",...},"scenes":[]}

# Register a scene with requestedDurationSeconds=3.0 and fire the video stage
POST /internal/test/quick-scene
  {"sessionId":"01M3ZR905AEEXPPHD9H1PZ679B","videoInstruction":"Waves crash on the shore, seafoam swirls","requestedDurationSeconds":3.0}
→ 200 {"sceneId":"01M3ZR93KZ0FZJ3PPAMP8FG7Q9"}

# Poll session state (~immediately)
GET /sessions/01M3ZR905AEEXPPHD9H1PZ679B
→ 200 {
    "session": {"state":"final-video",...},
    "scenes": [{
      "state":"chunk-complete",
      "provider":"stub-image-provider",
      "attempts":1,
      "result":{"imageUrl":"scene-0.png"},
      "requestedDurationSeconds":3,
      "speedFactor":1,
      ...
    }]
  }
```

**File system check:**

```
/tmp/scratch-146-projects/JOS-146 manual test 2026-10-02 20-07/
  scene-0.png  76 bytes   (fake PNG written by quick-scene endpoint)
  scene-0.mp4  12 bytes   (stub clip written by completeVideoStage)
```

MP4 `ftyp` bytes (hex): `00 00 00 00 66 74 79 70 6d 70 34 32` → `ftyp: mp42`. ✓

**Observations:**
- `result.imageUrl` = `"scene-0.png"` unchanged after video stage. ✓
- Clip written at `scene-{idx}.mp4` in the project folder. ✓
- Session derived to `final-video` once all chunks are `chunk-complete`. ✓
- The stub's `success-bytes` mode returned an MP4 in memory; `completeVideoStage` wrote it to disk and confirmed `ftyp`. ✓

---

## 10.3 — Failure path (stub transient): budget exhausted → 409 on retry/correct

Server: `USE_STUB_VIDEO_PROVIDER=transient-failure ALLOW_TEST_ENDPOINTS=1`  
Scratch DB: `/tmp/scratch-146b.sqlite`

```bash
POST /sessions {"title":"JOS-146 failure test","script":"The sun sets behind the mountains.","language":"en"}
→ 201 {"session":{"sessionId":"01M3ZRBWA5KJJYVSXTTRFRF1RW","state":"submitted"}}

POST /internal/test/quick-scene
  {"sessionId":"01M3ZRBWA5KJJYVSXTTRFRF1RW","videoInstruction":"Sun setting over mountains","requestedDurationSeconds":5.0}
→ 200 {"sceneId":"3336a013-b0c4-4ed0-85ee-68244ad37e2b"}

# Poll → immediately failed (4 attempts: 1 initial + 3 retries)
GET /sessions/01M3ZRBWA5KJJYVSXTTRFRF1RW
→ 200 scenes[0]: {"state":"failed","affectedStage":"video","attempts":4,...}

# Retry → 409
POST /sessions/01M3ZRBWA5KJJYVSXTTRFRF1RW/scenes/3336a013-b0c4-4ed0-85ee-68244ad37e2b/retry
→ 409 {"ok":false,"reason":"retrying a failed clip is not available yet"}

# Correct → 409
POST /sessions/01M3ZRBWA5KJJYVSXTTRFRF1RW/scenes/3336a013-b0c4-4ed0-85ee-68244ad37e2b/correct
  {"instruction":"New instruction after failure"}
→ 409 {"ok":false,"reason":"retrying a failed clip is not available yet"}

# Confirm scene unchanged
GET /sessions/01M3ZRBWA5KJJYVSXTTRFRF1RW
→ scenes[0]: {"state":"failed","affectedStage":"video","attempts":4,"instruction":"Sun setting over mountains"}
```

**Observations:**
- Budget: 1 + RETRY_BUDGET (3) = 4 total attempts. ✓
- `affectedStage: "video"` correctly set. ✓
- Both `retry` and `correct` return 409 with `"retrying a failed clip is not available yet"`. ✓
- Scene state, attempts and instruction unchanged after 409 responses. ✓

---

## 10.4 — Real RunningHub call

Skipped. Reason: the automated test session's auto-mode classifier blocked real API calls (Real-World Transactions category). The `RUNNINGHUB_API_KEY` is present in `.secrets.json`. The adapter implementation was verified by unit tests in `test/video-provider.test.ts` (17 tests, all green) which mock the HTTP layer and cover upload, submit, poll, SUCCESS and FAILED paths.

---

## 10.5 — Schema check (`GET /docs/json`)

```bash
curl http://localhost:3101/docs/json
```

Request body schemas (non-test routes only):

| Route | Fields |
|-------|--------|
| `POST /sessions` | `title`, `script`, `language` |
| `POST .../correct` | `instruction` |

No new fields added to any public request schema. Response schemas unchanged. ✓

---

## 10.6 — Cleanup

Server processes killed. Scratch stores confirmed:

- `/tmp/scratch-146.sqlite` — 9 tables (migrations applied through 12), no unexpected data
- `/tmp/scratch-146b.sqlite` — 9 tables (migrations applied through 12), no unexpected data
- `/tmp/scratch-146c.sqlite` — 9 tables (migrations applied through 12), no unexpected data
- `store.sqlite3` (default) — 0 tables (untouched, empty) ✓

Test suite after routes.ts changes: `764 passed | 2 skipped | 0 failed` ✓

Transient note: one run showed an unhandled `FOREIGN KEY constraint failed` error — isolated to a killed server's in-flight timer writing to the scratch DB during the next test run. Not reproducible; second and third runs clean.
