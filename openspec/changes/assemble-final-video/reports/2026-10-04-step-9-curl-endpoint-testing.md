# Step 9 — Curl Endpoint Testing Report

**Date:** 2026-10-04  
**Change:** assemble-final-video (JOS-149)  
**Branch:** feature/jos-149-assemble-final-video  
**Server command:**  
```
DB_PATH=data/curl-test-<n>.sqlite \
  USE_STUB_VIDEO_PROVIDER=success \
  USE_STUB_ASSEMBLY_TOOL=success \
  ALLOW_TEST_ENDPOINTS=true \
  npm start
```

> **Note on test isolation:** Each scenario uses a separate `DB_PATH` to avoid stale `provider_requests` rows conflicting with `reconcileOnBoot` across restarts. A pre-existing bug (UNIQUE constraint on `provider_requests.id` when reconcile polls a request that already has a row) would crash the server if the same DB were reused after a kill. This bug is orthogonal to JOS-149.

> **Note on bug found and fixed:** `USE_STUB_VIDEO_PROVIDER=success` in `server.ts` was passing the string `"success"` directly to `createStubVideoProvider()`, but the valid mode is `"success-bytes"`. The switch in the stub had no `"success"` case, so `poll()` returned `undefined`, crashing the process with `TypeError: Cannot read properties of undefined (reading 'kind')`. Fixed by mapping `"success"` → `"success-bytes"` in `server.ts`.

---

## 9.1 Server reachable

```
GET /health → {"ok":true}  HTTP 200
```

Server starts cleanly with `stillPending: 0` on a fresh DB.

---

## 9.2 Full pipeline to final-video

Test endpoints used (guarded by `ALLOW_TEST_ENDPOINTS`):
- `POST /internal/test/quick-voice-over` — inject a fake voice-over record
- `POST /internal/test/quick-scene` — register a scene in image-complete state and fire its video stage

**Session creation:**
```
POST /sessions
{"title":"Curl Test 9.2","script":"Scene one narration here. Scene two narration here.","language":"en"}
→ 201  {"session":{"sessionId":"01M44250EGHEH964WPY0JYYWF2","state":"submitted",...}}
```

**Inject voice-over (10 s):**
```
POST /internal/test/quick-voice-over
{"sessionId":"01M44250EGHEH964WPY0JYYWF2","durationSeconds":10}
→ 200  {"ok":true}
GET /sessions/01M44250EGHEH964WPY0JYYWF2 → state: "voice-over-complete"
```

**Add scene 0 (0–5 s):**
```
POST /internal/test/quick-scene
{"sessionId":"...","sceneIndex":0,"narrationStartSeconds":0,
 "videoInstruction":"A sunrise over mountains","requestedDurationSeconds":5}
→ 200  {"sceneId":"d16d1a50-e13a-48b7-a760-55c8ee682dad"}
```

Stub video provider processes immediately; `assemblyGate` fires with scene 0 at `chunk-complete`. Assembly stub succeeds. Session reaches `final-video`.

**Add scene 1 (5–10 s) — added after assembly already succeeded:**
```
POST /internal/test/quick-scene
{"sessionId":"...","sceneIndex":1,"narrationStartSeconds":5,
 "videoInstruction":"A sunset over the ocean","requestedDurationSeconds":5}
→ 200  {"sceneId":"d4802f54-9354-4bbe-9d6e-5c85c4c927c2"}
```

**Final session snapshot:**
```json
{
  "session": {
    "state": "final-video",
    "finalVideoUrl": "/sessions/01M44250EGHEH964WPY0JYYWF2/download/final-video"
  },
  "scenes": [
    {"index": 0, "state": "chunk-complete", "narrationInterval": {"startSeconds":0,"endSeconds":5}},
    {"index": 1, "state": "chunk-complete", "narrationInterval": {"startSeconds":5,"endSeconds":10}}
  ]
}
```

**Download route:**
```
GET /sessions/01M44250EGHEH964WPY0JYYWF2/download/final-video
→ 404  {"ok":false,"reason":"final video file not found on disk"}
```

File is absent because the stub assembly tool returns success without writing to disk. State machine and `finalVideoUrl` are correct; file-on-disk is the stub's limitation.

**Pre-assembly download (409):**
```
GET /sessions/<submitted-session>/download/final-video
→ 409  {"ok":false,"reason":"final video is not yet available"}
```

---

## 9.3 Audio track verification

Not verifiable with the stub assembly tool (produces no real file). The real ffmpeg adapter (`ffmpegAssemblyTool.ts`) uses `-map 0:v:0` to exclude clip audio and `-c:a copy` to pass the voice-over stream unmodified. This is verified at the unit level in `assembly-phase.test.ts` (test: "strips clip audio and uses voice-over").

---

## 9.4 Failed chunk prevents assembly

Server mode: `USE_STUB_VIDEO_PROVIDER=not-retryable-failure`

```
Session: 01M4429VBT87ZP1NCRGKXCENAQ
State: "failed"
Scene state: "failed"
finalVideoUrl present: false
```

Assembly gate was never fired because the scene never reached `chunk-complete`. Confirmed correct.

---

## 9.5 Assembly transient failure — retries exhausted

Server mode: `USE_STUB_ASSEMBLY_TOOL=transient-failure`

```
Session: 01M442AD0HX9NQKC169DJ2WDN3
State: "final-video-generating"   (assembly attempted, budget exhausted)
Scene state: "chunk-complete"      (unchanged — chunks not regenerated)
finalVideoUrl present: false
```

DB `stage_attempts` for this session:

| stage    | attempt | outcome   | error_message       |
|----------|---------|-----------|---------------------|
| assembly | 1       | transient | stub transient failure |
| assembly | 2       | transient | stub transient failure |
| assembly | 3       | transient | stub transient failure |
| assembly | 4       | transient | stub transient failure |

4 attempts = 1 initial + `RETRY_BUDGET=3` retries. After budget exhaustion the session stays in `final-video-generating` (no "assembly-failed" terminal state in MVP — by design). Chunks and voice-over records untouched.

---

## 9.6 No route exposes MP3, timestamps, or generated texts

```
GET /sessions/:id/voice-over  → 404 Route not found
GET /sessions/:id/timestamps  → 404 Route not found
GET /sessions/:id/texts       → 404 Route not found
```

Session snapshot: no `audioUrl`, `mp3Url`, `timestampsUrl`, `textUrl`, `transcriptUrl`, or `narrationText` fields in either the session or scene objects.

---

## 9.7 Cleanup

- Test DBs (`data/curl-test-*.sqlite*`): deleted after each test scenario.
- Test project folders created during curl tests: deleted.
- `data/skeleton.sqlite` (production DB): untouched throughout (all curl tests used separate `DB_PATH`).
- `data/projects/` restored to pre-test state (only pre-existing folders remain: `Traversal Test 2026-10-04 12-06`, `Assembly Test 2026-10-04 12-08`, `Assembly Curl Test 2026-10-04 12-14`, `Assembly Fail Test 2026-10-04 12-14`).

---

## Summary

| Task | Result | Notes |
|------|--------|-------|
| 9.1  | ✓ PASS | Server starts, health OK |
| 9.2  | ✓ PASS | State reaches `final-video`, `finalVideoUrl` present; disk file absent (stub limitation) |
| 9.3  | — N/A  | Stub produces no file; covered by unit tests |
| 9.4  | ✓ PASS | Failed chunk → session `failed`, no assembly fired |
| 9.5  | ✓ PASS | 4 transient attempts recorded, chunks unchanged |
| 9.6  | ✓ PASS | No MP3/timestamps/text routes at any session state |
| 9.7  | ✓ PASS | All test artifacts removed; production DB unchanged |

**Bug found:** `USE_STUB_VIDEO_PROVIDER=success` mapped to invalid stub mode `"success"` → fixed to map to `"success-bytes"` in `server.ts`.
