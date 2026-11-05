## Why

While a scene's clip is generating, its expanded details show "Generating clip" but nothing about the request: not that it was sent, when, to which provider, or how long it may take (JOS-200). The clip line (`Clip: RunningHub …, N attempts`) only appears once the clip has finished, because the video stage records its request when the provider answers, and the send time lives only in memory. A clip takes 5 to 20 minutes, so the User watches a spinner with no way to tell a slow clip from a stuck one.

## What Changes

- Record each clip request when it is sent: its send time and the request body as sent, on the scene.
- While the clip is generating, the expanded scene details show: the provider and model, the attempt number, when the request was sent, the elapsed time, and an estimated time of arrival calculated from earlier clips of the same provider (or "no estimate yet").
- Below it, the User can open the request JSON as sent: prompt, duration and resolution, with the first-frame image named as the scene image instead of the provider's upload URL.
- Fix the clip diagnostics line so it appears as soon as the request is sent, counting the attempt in flight, as the `stage-diagnostics` spec already requires.

Non-goals: the same panel for the image stage (seconds, not minutes), cancelling or resending a request, a request history per attempt (the latest request is shown), showing the provider's URL, endpoint, task id or headers.

## Capabilities

### New Capabilities

- `video-request-status`: the status of a scene's in-flight clip request (send time, attempt, elapsed, estimate) and its request body, shown in the scene details.

### Modified Capabilities

None. `stage-diagnostics` already requires the clip line to count an attempt in flight; this change makes the implementation meet it.

## Impact

- Backend: a migration adding two nullable columns to `scenes`; the video adapter port returns the body it sent; the orchestrator stores it at submit; the scene representation gains a strict `videoRequest` object; the clip attempt count includes the in-flight request.
- Frontend: a status block and a collapsible JSON view in `SceneRow.tsx`, with a live elapsed time.
- Docs: `docs/data-model.md`, `docs/api-spec.yml`, PRD §3 (scene details).
- No new dependency. No change to what is sent to the provider.
