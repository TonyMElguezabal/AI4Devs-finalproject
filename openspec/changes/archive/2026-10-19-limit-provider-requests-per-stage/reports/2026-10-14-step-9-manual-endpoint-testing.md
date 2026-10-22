# Step 9 — Manual endpoint testing (JOS-167)

Date: 2026-10-14. Real server (`node src/server.ts`) on a scratch store and scratch projects folder, port 3199.

Environment: `USE_STUB_VOICE_PROVIDER=success-after-limit`, `VOICE_STUB_DELAY_MS=6000` (each voice call takes 6 s, inside the 10 s maximum), `ALLOW_TEST_ENDPOINTS=1`. `VOICE_STUB_DELAY_MS` is a new manual-testing knob in `server.ts` (the existing slow mode answered after the maximum time, which tests timeouts, not the cap). Decomposition ran against the real providers with no credentials, so sessions end `failed` at decomposition after their voice-over completes. That is outside this change.

## 9.1 Health and boot log

`GET /health` answered `{"ok":true}`. The boot log's `concurrency` block listed decomposition 50, image 200, voice 3, alignment 2, video 3.

## 9.2 Five sessions at once

`POST /sessions` five times in a row (voice cap 3). Read from `stage_attempts` (time of day, UTC):

| t | cap 1 | cap 2 | cap 3 | cap 4 | cap 5 |
|---|---|---|---|---|---|
| +1 s | in-flight, sent 43.925 | in-flight, sent 43.976 | in-flight, sent 44.011 | scheduled, no `sent_at` | scheduled, no `sent_at` |
| +7 s | success | success | success | in-flight, sent 49.931 | in-flight, sent 49.977 |
| +14 s | success | success | success | success | success |

Exactly 3 voice attempts were in flight, the other 2 were `scheduled` and none failed. The waiting ones were sent in creation order (cap 4, then cap 5) as the first calls returned. Each waiting attempt's `queued_at` stayed at its ready time (44.048, 44.086) and its `sent_at` was stamped when it took its slot. No `transient` or `timed-out` outcome appeared.

## 9.3 Pause while waiting

Four sessions; the fourth was waiting. `POST /sessions/:id/pause` answered 200. When the three slots freed, the paused session's attempt stayed `scheduled` with no `sent_at`, and no failed attempt was recorded. `POST /sessions/:id/continue` answered 200 and the attempt was sent and succeeded 8 s later.

## 9.4 Cleanup

Server stopped. Scratch store and projects folder removed. The worktree's default store `backend/data/skeleton.sqlite*` has the same SHA-1 before and after.
