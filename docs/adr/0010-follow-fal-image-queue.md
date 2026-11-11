# ADR 0010 — Follow fal.ai's image queue instead of resending (JOS-239)

- Status: Accepted (2026-10-30); the PRD text (v1.30) was approved by the product owner on 2026-11-11
- Date: 2026-10-30
- Change: `follow-fal-image-queue` (archived `2026-10-30-follow-fal-image-queue`; full design in its `design.md`)

## Context

The image adapter called `fal.run` synchronously. A request that outlived the time limit was abandoned but still billed, and queue time counted against the limit. The retry then sent a duplicate, so one scene could cost several images.

## Decision

- **Use fal.ai's queue API.** Submit to `queue.fal.run`, then poll the `status_url` and fetch the `response_url` the submission returns (building them from the model id answers 405). The adapter checks every returned URL belongs to `https://queue.fal.run` before sending the key.
- **`ImageProvider` mirrors `VideoProvider`**: `submit`, `poll`, `cancel`. The poll loop lives in the orchestrator beside the video one, every 5 s; the concurrency slot is held until the request ends, so the cap bounds requests open at fal.ai.
- **Time limits**: submit with `X-Fal-Request-Start-Timeout` (1800 s, a constant) so a request that never started is dropped unbilled; the limit counts from `IN_PROGRESS`; at twice the limit the request is cancelled once (a result that arrived first is accepted).
- **Delayed automatic retries** reuse the bounded retry policy, honouring `Retry-After` on 429. The default image request cap is 6.
- **One end-of-session sweep** retries scenes whose image failed for a retryable reason, once per session. Whether a failure is sweepable is derived from the attempt history; the sweep marker is a column (`runs.image_sweep_at`, migration 27) because it cannot be derived.
- Assembly now runs ffmpeg's mux step with absolute paths, so a relative `PROJECTS_ROOT` works.

## Alternatives considered

- **Keep `fal.run` with a longer timeout.** Rejected: it still abandons and pays for what passes the limit, and still counts queue time.
- **Webhooks.** Rejected: they need a public URL, and the app is local.
- **A `scenes.image_failure_sweepable` column.** Rejected: redundant with the attempt history.

## Consequences

- One scene costs one image request unless a retry is genuinely needed; the real 46-scene run and the comparison with the old behaviour are in the change's reports.
- The image time limit (300 s) is not re-measured against the new flow (JOS-268).
