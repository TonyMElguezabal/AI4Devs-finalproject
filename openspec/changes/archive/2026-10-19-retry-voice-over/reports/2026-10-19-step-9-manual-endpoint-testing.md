# Step 9 — Manual endpoint testing (JOS-155, retry-voice-over)

Date: 2026-10-19. Real server (`node src/server.ts`, port 3199) on a scratch store and a scratch projects folder under the session scratchpad, with `USE_STUB_VOICE_PROVIDER` set per run and `RETRY_BASE_DELAY_SECONDS=1 RETRY_CAP_DELAY_SECONDS=1` so the four automatic attempts finish in seconds.

One deviation from the plan: `POST /sessions` calls the real content check (JOS-187), which has no stub switch and no credential here. The server was started with `node --import <preload>`, a throwaway file kept outside the repository that installs a moderator answering "clean". Nothing else was replaced, and the voice stub is the repository's own `USE_STUB_VOICE_PROVIDER`.

The stub cannot change mode while the server runs, so "fails first, then succeeds" was done by stopping the server and starting it again on the same store with another mode. The failure and the pause both survived the restart (restart recovery, JOS-160).

## Results (9.1 - 9.4)

| Check | Expected | Result |
|---|---|---|
| `GET /health` | `{"ok":true}` | pass |
| New session with the stub on `transient-failure` | `failed` in `voice-over` after four attempts | pass (about 6 s) |
| `POST /sessions/:id/voice-over/retry` with the stub on `success` | 200 `{ ok: true, held: false }` | pass |
| Session after the retry | voice-over `complete` | pass; then `failed` in `decomposition`, expected here because no reasoning or alignment credential exists (JOS-195 hand-off) |
| Project folder | gains one MP3, loses nothing | pass: `voice-over.mp3` and `voice-over-timestamps.json` added, `script.txt` unchanged |
| Retry again on that session | 409 | pass: `not-failed-in-voice-over` |
| Unknown id / malformed id | 404 | pass: `session-not-found` (both) |
| Body `{"script":"x"}` | 400 | pass: `Unrecognized key(s) in object: 'script'` |
| Paused failed session, retry | 200 `{ held: true }`, nothing sent | pass: session shows `voice-over-generating`, voice-over `in-progress`, `heldCount` 1, no MP3 yet |
| `POST /sessions/:id/continue` | the held retry is sent | pass: voice-over `complete`, MP3 added |
| `GET /docs/json` | documents the route | pass: responses 200, 404, 409 |

## Transcripts

### Session 1: failed, then retry

```
## Session 1: failed, then retry
state before: failed voice-over paused=False
files before:
projects/Manual retry 2026-10-19 16-39/script.txt
state after restart (failure survives): failed voice-over paused=False
POST retry:
{"ok":true,"held":false} [200]
poll 1: voice-over-generating None paused=False
poll 2: failed decomposition paused=False
poll 3: failed decomposition paused=False
poll 4: failed decomposition paused=False
poll 5: failed decomposition paused=False
poll 6: failed decomposition paused=False
files after:
projects/Manual retry 2026-10-19 16-39/voice-over-timestamps.json
projects/Manual retry 2026-10-19 16-39/voice-over.mp3
projects/Manual retry 2026-10-19 16-39/script.txt
second retry:
{"ok":false,"reason":"not-failed-in-voice-over"} [409]
unknown id:
{"ok":false,"reason":"session-not-found"} [404]
malformed id:
{"ok":false,"reason":"session-not-found"} [404]
body:
{"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"body/ Unrecognized key(s) in object: 'script'"} [400]
docs:
['200', '404', '409']
```

### Session 2: failed, paused, retry held, continue

```
## Session 2: failed, paused, retry held, continue
ID2=01M5B54X5EFMCD79MH099A699S
state: failed voice-over paused=False voiceOver=failed held=0
pause:
{"ok":true} [200]
after restart: failed voice-over paused=True voiceOver=failed held=0
retry while paused:
{"ok":true,"held":true} [200]
state (nothing sent while paused): voice-over-generating None paused=True voiceOver=in-progress held=1
files:
projects/Paused retry 2026-10-19 16-40/script.txt
continue:
{"ok":true} [200]
state after continue: failed decomposition paused=False voiceOver=complete held=0
projects/Paused retry 2026-10-19 16-40/voice-over-timestamps.json
projects/Paused retry 2026-10-19 16-40/voice-over.mp3
projects/Paused retry 2026-10-19 16-40/script.txt
```

## 9.5 — Clean-up

The server was stopped (no `src/server.ts` process remains). The scratch store and folder live under the session scratchpad, outside the repository, and `backend/data/` was never created.
