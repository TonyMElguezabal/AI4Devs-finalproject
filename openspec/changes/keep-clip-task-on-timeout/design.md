## Context

The clip stage is submit-then-poll (`orchestrator.ts`):

- `runVideoAttempt` submits once, stores the provider task id in `scenes.current_request_id`, records the send time and body (`recordVideoRequestSent` → `scenes.video_request_sent_at`, JOS-200), then calls `pollVideoRequestOnce`.
- `pollVideoRequestOnce(sceneId, requestId, attemptNumber, sentAtMs)` first checks the limit. If `Date.now() - sentAtMs` is past `phaseTimeoutMs("video")` (1200 s), it records a `transient_failure` provider request, releases the slot and calls `applyVideoFailureOutcome`. That marks a retry and `launchVideoStage` submits a **new** task. Otherwise it polls: `pending` re-arms a timer; success, failure or not-found are applied.
- On boot, `settleVideoInFlight` resumes `pollVideoRequestOnce` for each `video-generating` scene with `sentAtMs = Date.now()`, which gives a fresh window after every restart.

The stage-attempt timeout watcher (`attemptTimeoutWatcher.ts`) covers the session-level stages only; clips do not use stage attempts. The 1200 s value comes from `PER_PHASE_MAX_TIME_SECONDS.video` and is pinned to PRD §11.3 by `providerConfig.test.ts`.

The voice stage's late-result rule (JOS-185) accepts a result that arrives after its attempt timed out. The clip stage needs nothing like it: with this change, the attempt is no longer ended at the limit, so there is no second attempt for a late result to race.

## Goals / Non-Goals

**Goals:**

- One automatic provider task per scene while the provider still runs it (AC1–AC3).
- A bounded wait: a task the provider never closes cannot hold a scene and a video slot forever.
- Restarts neither resubmit (AC4) nor extend the wait.

**Non-Goals:**

- No change to the image, voice or decomposition stages, or to the 1200 s limit itself.
- No new UI. The scene's request status already shows the elapsed time (JOS-200). A "past the limit" note is left for later.
- No schema change and no provider-side cancel (RunningHub has none in the adapter).

## Decisions

### Decision 1: Past the limit, keep polling the same task

Drop the limit check that runs before the poll. The poll happens first. Only a `pending` answer is compared with the ceiling (Decision 2), and a `pending` answer below it simply re-arms the timer, as inside the limit. Nothing is recorded at the limit and the slot is not released.

*Alternative:* record a "timed out" provider request at the limit and accept a late result, as the voice stage does. Rejected: `provider_requests.id` is the task id and is written once, when the request resolves, so recording the timeout would collide with the late success. The ticket asks for one task, not two records of it.

### Decision 2: A ceiling at twice the limit, then a not-retryable failure

`videoTaskCeilingMs()` in `config/providers.ts` returns `2 × phaseTimeoutMs("video")`, which is 2400 s, or `undefined` when the stage has no limit. When a poll answers `pending` past the ceiling, the stage:

1. records a `not_retryable_failure` provider request;
2. releases the slot;
3. calls `applyVideoFailureOutcome` with `failed_not_retryable` and the reason "the clip task did not finish within 2400 s (twice the 1200 s phase limit); the provider task may still be running and billed. Retry to send a new task."

The scene fails; nothing is sent automatically, and the existing manual retry sends a new task (product owner, 2026-10-27).

*Alternatives:* no ceiling (a never-closed task holds one of the three video slots forever), or a transient failure at the ceiling (the retry policy would send a second billed task, which is what the ticket removes). The ceiling is derived from the limit rather than set separately, so raising the limit raises it too. Its value is recorded in PRD §11.3 and pinned there by the same test as the limits.

### Decision 3: The wait counts from the original send, across restarts

`settleVideoInFlight` passes `Date.parse(scene.videoRequestSentAt)` instead of `Date.now()`. It falls back to `Date.now()` only when no send time is stored: a scene submitted before JOS-200, or by an adapter that returns no body. Because the poll runs before the ceiling check (Decision 1), a task that finished while the application was down is accepted on boot even past the ceiling. A task still pending past it fails straight away.

The reported latency of a resumed request is then measured from the real send, which corrects today's figure (it restarted from the boot).

## Risks / Trade-offs

- [A task past the ceiling may still finish and be billed] → The reason says so. The User decides whether to retry, which spends one more task deliberately; this is the trade the product owner chose.
- [A slot stays held up to 2400 s instead of 1200 s] → Same slot, same task: the provider is still working on it, so a fourth parallel request would not start sooner at RunningHub either. Other scenes wait at most one more limit.
- [The 2× factor is a guess] → Recorded and provisional like the limit (§11.3). The 14 s clips measured 661–730 s, well inside 1200 s; the ceiling only matters for a task the provider stalls.
- [Fake-timer tests depend on the poll order] → The existing `video-time-limit.test.ts` harness drives `pending` polls with fake timers. The changed scenario and the new ones are written there before the code changes.
