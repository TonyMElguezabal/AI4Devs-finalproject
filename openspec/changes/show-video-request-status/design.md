## Context

The video stage (`orchestrator.ts`, `launchVideoStage` and `pollVideoRequestOnce`) submits a clip through the bound adapter (`videoProvider.ts`: upload the image, submit `{ prompt, duration, resolution, firstFrameUrl }`, then poll), marks the scene `video-generating` with the task id (`markVideoGenerating`), and keeps the send instant only in memory (`sentAtMs`). It writes its `provider_requests` row when the poll ends (success, failure, timeout), so the scene's clip diagnostic (`sceneStageDiagnostics`, counting `provider_requests` by stage) is absent while the first request is in flight. That contradicts the `stage-diagnostics` requirement, which counts "one still in flight".

The `stage-diagnostics` spec also forbids provider endpoint paths or URLs, external request ids, headers and credentials in the session read and snapshots. `firstFrameUrl` is a URL on the provider's storage, and the task id is an external request id.

## Goals / Non-Goals

**Goals:**

- Show, while a clip generates: provider, attempt, sent at, elapsed, estimate; and the request body as sent.
- Persist what is shown, so a restart shows the same.
- Make the clip diagnostic count the in-flight request.

**Non-Goals:**

- Image stage (a request takes seconds), cancel or resend, per-attempt history, any provider URL, endpoint, task id or header.

## Decisions

### Decision 1: Two nullable columns on `scenes`

`video_request_sent_at TEXT` and `video_request TEXT` (JSON), written by `markVideoGenerating` together with the task id, overwritten by each new attempt. The current request is what the User asks about; the history of attempts stays in `provider_requests`. No trigger locks them (they change per attempt).

*Alternative:* a `scene_video_requests` table, one row per attempt (history nobody asked for; the extra join on every snapshot).

### Decision 2: The adapter reports the body it sent

`VideoSubmitResult`'s `submitted` variant gains `sentBody: Record<string, unknown>`, the JSON body exactly as the adapter sent it. The orchestrator, not the adapter, reduces it to the allow-list `{ prompt, duration, resolution }` and adds `firstFrame: "scene {index} image"`, so an adapter cannot leak a field by adding it (the same allow-list idea as the stage diagnostics). The stub adapter returns the same shape.

### Decision 3: The in-flight request counts from the send

`sceneStageDiagnostics` adds 1 to the video count while the scene is `video-generating` with a `current_request_id` whose `provider_requests` row does not exist yet. The row is still written at the end, as today, so usage and cost reports are unchanged.

*Alternative:* insert the `provider_requests` row at submit and update it at the end (touches the reports' semantics and every `insertProviderRequest` call site).

### Decision 4: The estimate is computed on read

`videoRequest.estimate = { seconds, basedOn } | null`, computed when the scene is read: the median of `latency_ms` over `provider_requests` with `stage = 'video'`, `mode = 'success'`, the same `provider_id`, joined to scenes with the same `requested_duration_seconds` (at least 3), else the same provider any duration (at least 1), else `null`. Nearest-rank median, reusing `nearestRankPercentile` from `providerUsageReport.ts`. One query per session read, grouped by provider and duration, then looked up per scene.

### Decision 5: The page derives the clock

The representation carries `sentAt` (ISO) and `estimate.seconds`; the page computes elapsed, expected arrival and "taking longer than estimated" from the browser clock with a 1 s interval while the block is visible, so no snapshot is needed per second.

### Decision 6: A strict representation

`videoRequest: { provider: { name, model }, attempt, sentAt, estimate: { seconds, basedOn } | null, body: { prompt, duration, resolution, firstFrame } }`, `.strict()` at each level. The `stage-diagnostics` sentinel test gains a sentinel in the stored request JSON (an extra field and a URL) and asserts neither reaches the read or the snapshot.

## Risks / Trade-offs

- [The estimate is wrong for the first clips of a session or a new provider] → It says how many clips it is based on, and "no estimate yet" when there are none; it is labelled an estimate.
- [The stored prompt duplicates the scene's VIDEO instruction] → It records what was actually sent (the instruction may be edited after a failure), at a few hundred bytes per scene.
- [Restart: polling restarts with a fresh in-memory send time today] → Out of scope to change the poll deadline here; the stored `video_request_sent_at` makes that fix possible later, and is noted in `video-stage-time-limit`'s follow-ups.

## Open Questions

- None blocking. The model label for RunningHub stays the fixed `minimax/hailuo-h3` of `stageDiagnostics.ts`.
