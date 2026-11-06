# Step 1: live vendor confirmation

- Date: 2026-11-06
- Change: configurable-video-connector (JOS-219)
- Agent: Claude Code
- Key: a Runway key the owner supplied for this test. It is stored only in the ignored `backend/.secrets.json`, read inside curl, and never printed. The owner will revoke it after the test.

All requests went to `https://api.dev.runwayml.com` with `Authorization: Bearer <key>` and `X-Runway-Version: 2024-11-06`. Signed query strings of output links are removed below.

## 1.3: free key check

| Request | Key | Answer |
|---|---|---|
| `GET /v1/organization` | valid | 200, `{ tier: { maxMonthlyCreditSpend, models: { <model>: { maxConcurrentGenerations, maxDailyGenerations } } }, creditBalance, usage }` |
| `GET /v1/organization` | malformed | 401, `{ error: "...not the correct length..." }` |

`GET /v1/organization` is free (the balance did not move), so it is the definition's check step with `connectedStatus` 200.

Tier on this account: `wan3`, `wan3_prime` and `kling_4` each allow 1 concurrent generation and 50 per day. Starting balance: 5000 credits.

## 1.2: image-to-video, Wan 3.0 and Kling 4.0

The body was the same for both except `model`:

```json
{ "model": "wan3 | kling_4", "promptText": "A slow cinematic camera push-in on the scene, gentle natural motion.",
  "promptImage": "data:image/png;base64,<scene-3 image, 1920×1088 PNG, 3.3 MB; data URI 4,422,858 chars>",
  "duration": 5, "ratio": "auto_720p" }
```

| | Wan 3.0 | Kling 4.0 |
|---|---|---|
| Submit answer | 200 in 1.4 s, `{ "id": "63ef7987-…", "estimatedCost": { "credits": 50 } }` | 200 in 1.2 s, `{ "id": "f1df356e-…", "estimatedCost": { "credits": 64 } }` |
| Poll while running | `{ id, createdAt, status: "RUNNING", progress: 0.03, estimatedCost }` | same shape |
| Final poll | `{ id, createdAt, status: "SUCCEEDED", output: ["https://dnznrvs05pmza.cloudfront.net/wan_3_0/…mp4?<signed>"], cost: { credits: 50 } }` | `{ …, status: "SUCCEEDED", output: ["https://dnznrvs05pmza.cloudfront.net/kling-4/…mp4?<signed>"], cost: { credits: 64 } }` |
| Time to succeed | about 4 min | about 5 min |
| Downloaded clip | 200, 7.5 MB, H.264 1274×722 at 30 fps plus AAC, 5.04 s | 200, 3.5 MB, H.264 1284×728 at 24 fps plus AAC, 5.04 s |

Findings:
- The task id is the top-level `id` (`taskIdAt: "id"`).
- The status is at `status`, and the video link at `output[0]`.
- A data URI of a real scene image (4.4 MB) is accepted.
- `auto_720p` keeps the image's shape: 1920×1088 gives about 1274×722. The assembly already scales clips to the output frame, as it does for RunningHub's 1344×768.
- Billed cost: 50 + 64 = 114 credits ($1.14). Balance after: 4886. Kling bills less than its learn page says (64 credits for 5 s at 720p, not 78.5).

## Unknown task

| Request | Answer |
|---|---|
| `GET /v1/tasks/00000000-0000-0000-0000-000000000000` | 400, `Validation of params failed` (not a version-4 UUID) |
| `GET /v1/tasks/<random v4 UUID>` | 404, `{ "error": "Could not find Task" }` |

A task id the application stores always comes from Runway, so `notFoundStatus: 404` holds.

## 1.4: refused requests (not billed; balance still 4886)

| Case | Answer |
|---|---|
| Kling with `ratio: "1920:1080"` | 400, `issues[0]`: `invalid_value` on `ratio`, expected `auto_720p` or `auto_1080p` |
| Kling with an extra `audio: false` | 400, `issues[0]`: `unrecognized_keys`, `audio` |
| Kling with `duration: 2` | 400, `issues[0]`: `too_small` on `duration`, minimum 3 |
| Submit with an inactive key | 401, `{ error: "…doesn't represent an active key… The last 3 characters of the key we received are \"000\"…" }` |

**Security finding:** Runway's 401 body repeats the last 3 characters of the key. The connector must not copy the body of a non-2xx answer into a failure reason; it uses the HTTP status only, as the coded adapters do. `design.md` Decision 4 is updated to say so.

A task failure (`FAILED`) could not be triggered without spending. The failure field `failureCode` comes from Runway's documentation and is not confirmed live. A wrong `errorAt` path only loses the vendor's code from the reason. The failure is still classified by `failedWhen`.

## RunningHub

No live call was made in this step. The RunningHub definition reproduces the requests the coded adapter sends, which were verified live in JOS-196 (shapes) and JOS-165 (768P: 1344×768 at 24 fps, $0.385 for 5 s). It runs live in task 8 next to the coded adapter.

## Changes to the design from this step

- Decision 1 values are confirmed: `taskIdAt: "id"`, check `GET /v1/organization`, unknown task 404.
- Decision 4: a non-2xx reason uses the HTTP status only.
- Risk added: Runway's tier runs one clip per model at a time.
- The definitions are in `docs/video-connector-definitions.md`.
