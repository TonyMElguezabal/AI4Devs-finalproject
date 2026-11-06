# Video connector definitions

A video provider of type **Configured connector** (`configured-video`) describes, on `/admin`, how the application calls a vendor's API. This page holds the definitions verified against the live vendors, as worked examples to copy. The backend tests load the JSON blocks below as fixtures, so a definition here is one that passes.

Each definition has two parts:

- the plain fields: base URL, model, resolution and admitted durations;
- `requests`: the JSON pasted into the Requests field.

Placeholders: `{instruction}`, `{duration}`, `{model}`, `{resolution}`, `{image_data_uri}`, `{image_base64}`, `{image_url}` (only after an upload step), `{task_id}` (poll only), `{key}` (headers only). A JSON string that is exactly one placeholder is sent typed, so `"{duration}"` is sent as a number. Paths into an answer use dots and `[n]`, for example `results[0].url`.

Resolution: at most 1080p. A value naming 2K, 4K, 1440, 2160, 2560 or 3840 is refused.

## Runway: Wan 3.0, Kling 4.0

Verified on 2026-11-06 (`openspec/changes/configurable-video-connector/reports/2026-11-06-step-1-live-vendors.md`).

| Field | Wan 3.0 | Kling 4.0 |
|---|---|---|
| Base URL | `https://api.dev.runwayml.com` | `https://api.dev.runwayml.com` |
| Model | `wan3` (or `wan3_prime`) | `kling_4` |
| Resolution | `auto_720p` or `auto_1080p` | `auto_720p` or `auto_1080p` (pixel sizes are refused) |
| Admitted durations | 5 to 15 (Runway allows 2 to 30) | 5 to 15 (Runway allows 3 to 30) |
| Price, 720p | 10 credits ($0.10) per second | about 12.8 credits ($0.128) per second, as billed |

Use "Duplicate" to add the second model with the same requests and key.

<!-- fixture: runway -->
```json
{
  "headers": { "Authorization": "Bearer {key}", "X-Runway-Version": "2024-11-06" },
  "submit": {
    "method": "POST",
    "path": "/v1/image_to_video",
    "body": {
      "model": "{model}",
      "promptText": "{instruction}",
      "promptImage": "{image_data_uri}",
      "duration": "{duration}",
      "ratio": "{resolution}"
    },
    "taskIdAt": "id"
  },
  "poll": {
    "method": "GET",
    "path": "/v1/tasks/{task_id}",
    "statusAt": "status",
    "doneWhen": ["SUCCEEDED"],
    "failedWhen": ["FAILED", "CANCELLED"],
    "videoUrlAt": "output[0]",
    "errorAt": "failureCode",
    "notFoundStatus": 404
  },
  "check": { "method": "GET", "path": "/v1/organization", "connectedStatus": 200, "charged": false }
}
```

Notes:
- `PENDING`, `RUNNING` and `THROTTLED` are still running.
- Runway runs one clip at a time per model on this account's tier, and queues the rest as `THROTTLED`.
- Output links expire within 24 to 48 hours. The application downloads them as soon as the clip is ready.

## RunningHub: MiniMax Hailuo H3

The same calls the coded `runninghub-video` adapter makes (verified in JOS-196 and JOS-165), written as a definition.

| Field | Value |
|---|---|
| Base URL | `https://www.runninghub.ai` |
| Model | `minimax/hailuo-h3` (shown in diagnostics; the endpoint names the model) |
| Resolution | `768P` |
| Admitted durations | 5 to 15 |

<!-- fixture: runninghub -->
```json
{
  "headers": { "Authorization": "Bearer {key}" },
  "upload": {
    "path": "/openapi/v2/media/upload/binary",
    "multipartField": "file",
    "urlAt": "data.download_url",
    "errorAt": "errorCode",
    "okErrorValues": ["", null]
  },
  "submit": {
    "method": "POST",
    "path": "/openapi/v2/minimax/hailuo-h3/image-to-video",
    "body": {
      "prompt": "{instruction}",
      "duration": "{duration}",
      "resolution": "{resolution}",
      "firstFrameUrl": "{image_url}"
    },
    "taskIdAt": "taskId",
    "errorAt": "errorCode",
    "okErrorValues": ["", null]
  },
  "poll": {
    "method": "POST",
    "path": "/openapi/v2/query",
    "body": { "taskId": "{task_id}" },
    "statusAt": "status",
    "doneWhen": ["SUCCESS"],
    "failedWhen": ["FAILED"],
    "videoUrlAt": "results[0].url",
    "errorAt": "errorCode",
    "okErrorValues": ["", null]
  }
}
```

RunningHub's free key check sends the key in the request body (`/uc/openapi/accountStatus`). The connector puts the key only in headers, so this definition has no check step, and its connection test says so.

## MiniMax: H3, called directly

Verified on 2026-11-06 with a five-scene session: 57 clip seconds, one attempt each, a 1080p final video, USD 4.56 on the MiniMax balance (USD 0.08 per second). Source: MiniMax's [create](https://platform.minimax.io/docs/api-reference/video-generation-v2-create) and query pages. The same model through RunningHub at 2K was USD 0.12 per second.

| Field | Value |
|---|---|
| Base URL | `https://api.minimax.io` |
| Model | `MiniMax-H3` |
| Resolution | `768P` (the only H3 value within the 1080p limit; MiniMax also offers `2K`, which is refused) |
| Admitted durations | 5 to 15 (MiniMax allows 4 to 15) |
| Price | USD 0.08 per clip second at 768P |

<!-- fixture: minimax -->
```json
{
  "headers": { "Authorization": "Bearer {key}" },
  "submit": {
    "method": "POST",
    "path": "/v2/video_generation",
    "body": {
      "model": "{model}",
      "content": [
        { "type": "text", "text": "{instruction}" },
        { "type": "image_url", "image_url": { "url": "{image_data_uri}" }, "role": "first_frame" }
      ],
      "resolution": "{resolution}",
      "duration": "{duration}"
    },
    "taskIdAt": "task_id"
  },
  "poll": {
    "method": "GET",
    "path": "/v2/query/video_generation/{task_id}",
    "statusAt": "task.status",
    "doneWhen": ["succeeded"],
    "failedWhen": ["failed", "cancelled"],
    "videoUrlAt": "task.content.url"
  }
}
```

Notes:
- The image goes inline as a base64 data URI (JPEG, PNG and others up to 30 MB). MiniMax prefers URLs for large files; a scene image is far below the limit.
- `queued` and `running` are still running. Errors arrive as the HTTP status (402 is an empty balance, 401 a wrong key), so no `errorAt` is needed.
- There is no `check` step: MiniMax documents no free call to check a key, so the connection test says nothing was sent. The first clip is the first proof.
- `ratio` is left out: a first-frame request is always `adaptive`.
- Output links are time-limited. The application downloads each clip as soon as it is ready.
- Clips came back slightly longer than requested (13 s asked, 13.7 s received), and billing followed the requested seconds. The final video cuts each clip to its scene.
- **MiniMax-H3-Highspeed, -Lite and -Max:** use "Duplicate" and change the model and price. They accept only `480P` or `768P`, and `-Max` starts at 5 s. `-Lite` does not support `adaptive`, so it likely needs a `ratio` such as `16:9` in the body (not tried). Reference video and audio (`reference_video`, `reference_audio`) are a different mode that cannot be mixed with a first frame, and the connector has nothing to send for them.

## What does not fit

These need a coded adapter:
- logins that are not a fixed key (OAuth, service-account tokens, signed requests);
- an image the vendor must fetch from a public URL;
- webhooks;
- calls that block until the clip is ready;
- a clip returned as bytes;
- more than upload, submit and poll.
