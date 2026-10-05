# Step 7: curl endpoint testing (JOS-185, stage-execution-time-limit)

Date: 2026-10-05. Branch `feature/jos-185-stage-execution-time-limit`, HEAD `9222544`.

All runs used a scratch store and project folder (`DB_PATH` and `PROJECTS_ROOT` in a scratchpad directory), port 3185, `ALLOW_TEST_ENDPOINTS=1`, and the voice stage's real 10 s maximum time (no injected limit was needed; the retry delay was shortened with the existing `RETRY_BASE_DELAY_SECONDS` and `RETRY_CAP_DELAY_SECONDS`). Server start: `USE_STUB_VOICE_PROVIDER=<mode> RETRY_BASE_DELAY_SECONDS=<n> RETRY_CAP_DELAY_SECONDS=<n> node src/server.ts`. Attempts were read from the scratch store after each run. The default store of this worktree was snapshotted before and after (7.2 and 7.7) and was identical.

Task 7.1a added two stub voice modes for this: `hang-once-then-success` (the first call never answers) and `success-after-limit` (every call answers after the voice limit plus 2 s, 12 s).

Every scenario starts with `POST /sessions` with `{"title": ..., "script": "The sun rose slowly over the quiet hills. Birds began to sing.", "language": "en"}`, which returns 201, and then reads `GET /sessions/:id`. The boot log lines `boot reconciliation complete`, `scheduled retries re-armed` and `Server listening` appear on every start (7.1).

## 7.3 The first attempt hangs, the retry answers (`hang-once-then-success`, retry delay 1 s)

`GET` over time: `voice-over-generating` until t+10 s, then `voice-over-complete` at t+12 s. Attempts:

```
seq 1 initial   timed-out  sent 19:47:08.013  finished 19:47:18.751  "the attempt had no result after 10 s"
seq 2 automatic success    sent 19:47:19.754  finished 19:47:19.821
voice_overs: 1
```

The first attempt was timed out 10.7 s after it was sent (the watcher's one-second interval), and the retry succeeded. The log carries `voice-over.attempt.timed-out` with `sentAt`, `latencyMs` 10738, cycle and sequence.

## 7.4 The answer arrives late, before the retry's delay (`success-after-limit`, retry delay 10 s)

```
seq 1 initial   late-success  sent 19:47:36.880  finished 19:47:47.326  late_result_at 19:47:48.884
seq 2 automatic cancelled     (never sent)
voice_overs: 1
```

The attempt timed out at 10.4 s, its answer arrived at 12.0 s and was accepted as the voice-over, and the scheduled retry was cancelled and never sent. The log shows `voice-over.attempt.timed-out` followed by `voice-over.attempt.late-result` (`late-success`). The session ended `voice-over-complete`.

## 7.5 The provider always hangs (`hang`, retry delay 1 s)

Four attempts, each `timed-out` after about 10 s (sent 19:48:31, 19:48:42, 19:48:53, 19:49:04). At t+45 s:

```
state=failed failure={"retryable": true, "manualRetryAvailable": true, "cycle": 1, "attemptsInCycle": 4}
"cause": "The voice-over could not be generated: the voice provider had no result after 10 s. The script is unchanged."
```

No fifth attempt appeared in the following six seconds, and `voice_overs` is 0.

## 7.6 Time held before sending is not timed (`hang-once-then-success`, retry delay 3 s)

The voice stage has no request cap to queue behind (its cap is undetermined), so the held time is shown with a pause instead. The cap-queue case belongs to the image stage and is covered by `test/image-time-limit.test.ts`. After attempt 1 timed out (t+11 s), `POST /sessions/:id/pause` returned 200 and the session was held for 14 s, longer than the 10 s limit: attempt 2 stayed `scheduled`, nothing timed out, `paused=True`. `POST /sessions/:id/continue` returned 200 and attempt 2 was sent at that moment and succeeded:

```
seq 2 automatic success  sent 19:50:24.115  finished 19:50:24.177     (continue at 19:50:24)
voice_overs: 1
```

## Not shown over HTTP, and why

- A manual retry after an exhausted cycle of timeouts: the voice-over retry route belongs to JOS-155 and is not on this base (only `/decomposition/retry` is). It is covered by `stage-attempt-recorder.test.ts` and `attempt-timeout.test.ts` ("a timed-out attempt counts as a failure").
- Late results for the image and video stages: those calls are aborted at the limit, so no result can arrive late; the design records this (Decision 9).

## Finding outside this change

Between a failed or timed-out attempt and the retry being sent, `GET /sessions/:id` reads `submitted` for up to the retry delay (seen at t+11 s in 7.4). `toSnapshot` marks the voice attempt "in flight" only for `in-flight` attempts, not for a `scheduled` retry. The same window exists after any transient failure, so it predates this change; `bounded-retry-policy` says the session should stay in its in-progress state during retries. To be raised on JOS-184.

## 7.7 Clean-up

The scratch store and project folder were deleted. A snapshot of the default store of this worktree is identical to the one taken before the runs.

## 8.1 E2E

Not applicable: this change has no user-facing behaviour beyond the failure fields already covered by `bounded-retry-policy`, and no API or frontend change.
