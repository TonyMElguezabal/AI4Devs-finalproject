# Step 1.3 Report - fal.ai queue response shapes

- Date: 2026-10-30
- Change: follow-fal-image-queue
- Agent: Claude
- Cost: one `fal-ai/flux/dev` image (the key was read from `backend/.secrets.json` and never printed; request ids are redacted below)

## What was run

One request through `https://queue.fal.run/fal-ai/flux/dev` with `X-Fal-Request-Start-Timeout: 1800`, polled every 2 s until `COMPLETED`, then the result, then a cancel after completion.

## Shapes observed (ids and image URL redacted)

| Call | HTTP | Body (relevant fields) |
| -- | -- | -- |
| `POST` submit | 200 | `status: "IN_QUEUE"`, `request_id`, `response_url`, `status_url`, `cancel_url`, `queue_position`, `user_queue_position`, `user_queued_count` |
| `GET` status (running) | **202** | `status: "IN_PROGRESS"`, same URLs, `metrics: {}` |
| `GET` status (done) | 200 | `status: "COMPLETED"`, `metrics.inference_time` (2.29 s) |
| `GET` result | 200 | `images[0]: { url, width, height, content_type }`, `timings`, `seed`, `prompt` |
| `PUT` cancel after completion | 400 | `{"status":"ALREADY_COMPLETED"}` |

Returned URLs: `https://queue.fal.run/fal-ai/flux/requests/<id>[/status|/cancel]`, with `owner/app` only (no `/dev`), as the docs say.

## Consequences for the design

- Design Decision 2 holds as written. One addition for the adapter and its tests: **the status call answers 202 while `IN_PROGRESS`, so the adapter treats any 2xx status answer as a valid status** and reads `status` from the body.
- The cancel answer for a finished request is HTTP 400 `ALREADY_COMPLETED`, matching the "already-completed" mapping.

## Not observed

- The `IN_QUEUE` status body (the job started before the first poll; the submit body carried `IN_QUEUE`).
- A passed start window, `COMPLETED` with `error`, HTTP 429 with `Retry-After`, and a cancel of a queued or running request. They stay covered by stubbed tests and are unknown against the real service.
- The reference model (`bytedance/seedream/v5/pro/edit`), to avoid a larger image charge; its URLs follow the same rule per the docs (`bytedance/seedream/requests/<id>`).
