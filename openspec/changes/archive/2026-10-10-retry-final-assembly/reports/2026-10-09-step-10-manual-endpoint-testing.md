# Step 10 — Manual endpoint testing with curl (JOS-159, retry-final-assembly)

All testing used a scratch store (`DB_PATH`/`PROJECTS_ROOT` under `/tmp`, removed afterwards) and the existing
`ALLOW_TEST_ENDPOINTS=1` test-only routes (`POST /internal/test/quick-voice-over`, `POST /internal/test/quick-scene`,
from `generate-chunk-video`/JOS-146) to drive a session to `chunk-complete` without real provider credentials.

## 10.1 — Server start and health check

```
DB_PATH=/tmp/jos159-scratch/skeleton.sqlite PROJECTS_ROOT=/tmp/jos159-scratch/projects PORT=3177 \
  ALLOW_TEST_ENDPOINTS=1 USE_STUB_VIDEO_PROVIDER=success-bytes USE_STUB_ASSEMBLY_TOOL=not-retryable-failure \
  node --experimental-strip-types src/server.ts
```
`GET /health` → `200 {"ok":true}`. Boot log confirmed `"boot recovery complete"`.

## 10.2 — A session fails in assembly; nothing generated is touched

Created a session, called `quick-voice-over` and `quick-scene`, polled `GET /sessions/:id`:

```json
{
  "state": "failed", "failedPhase": "assembly",
  "failure": { "phase": "assembly", "cause": "The final video could not be assembled: stub not-retryable failure. Your narration, images and clips are kept.", "retryable": false, "manualRetryAvailable": true, "cycle": 1, "attemptsInCycle": 1 }
}
```

Project folder: exactly `scene-0.mp4`, `scene-0.png`, `voice-over.mp3` — no `final-video.mp4`, no partial file. Hashes recorded. Restarted the server (same scratch store) before retrying: state and failure were byte-identical after the restart — confirms the boot migration step correctly leaves an already-recorded failure alone.

## 10.3 — Retry succeeds; folder gains only final-video.mp4; download

Restarted with `USE_STUB_ASSEMBLY_TOOL=success`. `POST /sessions/:id/assembly/retry` → `200 {"ok":true,"held":false}`. Session reached `final-video`.

**Caveat found**: the plain stub tool (`createStubAssemblyTool`'s `"success"` mode, the same one the unit test suite uses) never writes real bytes to `outputPath` — by design, matching `moveAssemblyOutput`'s own "nothing to move" early return. So with the stub, the project folder correctly stays unchanged (no `final-video.mp4` ever appears) and `GET /sessions/:id/download/final-video` correctly answers 404 ("final video file not found on disk") — there genuinely is nothing to serve. This is expected stub behaviour, not a gap in this change.

To actually exercise the write-a-real-file path (and task 9.3's "opt-in ffmpeg adapter test... with real files", which has no automated test to run — see the step 9 report), the real adapter was exercised directly, bypassing HTTP (ffmpeg and ffprobe are installed on this machine):

1. Generated a real 1-second video clip and a real 1-second silent MP3 with `ffmpeg -f lavfi`.
2. Called `createFfmpegAssemblyTool().assemble(...)` directly with those real files → `{"kind":"success","outputPath":".../final-video.mp4"}`, an 11790-byte real MP4, `ffprobe`-confirmed duration ≈1.02s.
3. Called `moveAssemblyOutput` on the real temp output → `true`; `isReadableMp4` on the moved file → `true`; the temp file was gone afterward (the `finally` cleanup ran); a **second** `assemble` + `moveAssemblyOutput` into the same target → `false` (the `EEXIST` guard), and the second temp copy was still cleaned up.

This fully exercises Decision 2's temp-then-move path with real bytes end to end, independent of the stub's limitation. (The real adapter is not wired into `server.ts` by default — a pre-existing, out-of-scope gap already flagged in the step 9 report — so it could not be exercised through the HTTP API without a throwaway, uncommitted hook in a disposable worktree, which was discarded, not shipped.)

## 10.4 — Error cases

| curl | Result |
|---|---|
| Retry again on the now-`final-video` session | `409 {"ok":false,"reason":"not-failed-in-assembly"}` — correct: a succeeded retry clears the failure, so "not failed" is the accurate reason, not a separate "already generated" one (matches design.md Decision 3's documented check order) |
| Retry an unknown session id | `404 {"ok":false,"reason":"session-not-found"}` |
| Retry with a JSON body | `400` (Fastify/Zod: `"Unrecognized key(s) in object: 'anything'"`) |
| `GET /docs/json` | `paths` includes `/sessions/{sessionId}/assembly/retry` |

**Paused session → held:true → continue runs it once** (restarted the server with `USE_STUB_ASSEMBLY_TOOL=not-retryable-failure`, same scratch store, so a session genuinely failed then paused before retrying):

```
POST /sessions/:id/assembly/retry (paused) → 200 {"ok":true,"held":true}
```

**Bug found and fixed here, not by any unit test**: restarting the server at this exact point (retry accepted and held, before continue) caused `recordMissingAssemblyFailuresOnBoot` to re-record the *old* failure, silently undoing the accepted retry — `GET /sessions/:id` after the restart showed `state: failed` again instead of the expected `final-video-generating`. Root cause: `beginAssemblyRetry` clears `run.failure` but leaves no other trace, so a paused session with a not-retryable latest attempt and no failure is indistinguishable, from attempt-row state alone, from a genuinely stuck pre-JOS-159 legacy session — exactly the case the boot migration step exists to fix. Fixed by having the boot migration step skip any **paused** session entirely (committed separately, `d8f548d`, with a new regression test in `restart-assembly.test.ts`): an unpaused stuck session is unambiguous and still gets fixed (`pendingAtBoot`'s own guard means nothing else will ever relaunch it), while a paused one is safe to leave alone either way — `continueSession` resumes a genuine held retry correctly, and a genuinely stuck paused legacy session just gets one fresh attempt on continue, which now records its failure correctly through the ordinary path if it fails again.

Re-verified after the fix, restarting the server between acceptance and continue:
```
GET /sessions/:id (after restart) → state: "final-video-generating", failure: undefined, still held
POST /sessions/:id/continue → 200
GET /sessions/:id → state: "final-video", finalVideoUrl set
```

## 10.5 — Cleanup

All three scratch stores and project folders (`/tmp/jos159-scratch*`, `/tmp/jos159-ffmpeg-check`) removed. The default store in the testing worktree (`/tmp/jos159-manual-test/backend/data/`) was never pointed at by any of these runs (`DB_PATH`/`PROJECTS_ROOT` always overridden) and confirmed at 0 rows / empty `data/projects/` throughout.
