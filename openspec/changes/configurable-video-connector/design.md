## Context

The video stage talks to its vendor through the `VideoProvider` port in `backend/src/videoProvider.ts`: `submit({ imageBytes, instruction, durationSeconds })` returns a request id, and `poll(requestId)` returns pending, success (bytes or a temporary link), not found, or a classified failure. The orchestrator stores the request id, so a clip in progress at a restart is polled again and not requested twice. Binding, retries, moves (JOS-172), the stage time limits, the request cap, the clip request status (JOS-200) and the reports are built on that port and do not know the vendor.

One adapter ships: `runninghub-video`, coded for RunningHub's upload, submit and poll.

Per-adapter-type tables are keyed by `AdapterTypeId` (JOS-262): the parameter rules, the vendor name and form (`providerTypes.ts`), the connection check (`providerConnectionCheck.ts`) and the contract fixtures. Three places assume one video type and are not covered by that rule:
- `defaultRegistry()` builds every video profile as RunningHub;
- `videoCrossCheck()` checks the segmentation bound only for `runninghub-video`;
- `vendorFor()` in `db.ts` names the telemetry vendor from a fixed table.

JOS-218 rejected "a generic or declarative HTTP adapter described on `/admin`", for two reasons: a key could be sent to any host typed on the page, and error classification would be guessed. The owner has now asked for exactly that connector for video. This design answers both reasons (Decisions 4 and 5).

The two vendors that prove the design:

| | Runway (Wan 3.0, Kling 4.0) | RunningHub (MiniMax Hailuo H3) |
|---|---|---|
| Host | `api.dev.runwayml.com` | `www.runninghub.ai` |
| Auth | `Authorization: Bearer <key>`, `X-Runway-Version: 2024-11-06` | `Authorization: Bearer <key>` |
| Image | `promptImage` accepts a data URI | multipart upload first → `data.download_url` |
| Submit | `POST /v1/image_to_video` `{ model, promptText, promptImage, duration, ratio }` → task id | `POST <endpoint>` `{ prompt, duration, resolution, firstFrameUrl }` → `taskId` |
| Poll | `GET /v1/tasks/{id}` → `status` `SUCCEEDED`/`FAILED`/`CANCELLED`/other, `output[0]` | `POST /openapi/v2/query` `{ taskId }` → `status` `SUCCESS`/`FAILED`, `results[0].url` |
| Errors in a 200 answer | none | `errorCode` non-empty, or `code` ≠ 0 |
| Limits | Wan 2–30 s, Kling 3–30 s; Kling image-to-video needs `ratio` `auto_720p` or `auto_1080p`; Kling refuses unknown fields | 5–15 s |
| Output | up to 1080p, links kept 24–48 h | 2K |

The final video is 1920×1080 (the `output` setting), and the assembly scales every clip (`ffmpegAssemblyTool.ts`, `scale=`). The clip check accepts any MP4. RunningHub is hard-coded to `2K` (`VIDEO_GENERATION_SETTING`), which is downscaled at assembly. Its other tier is `768P` (1344×768): $0.385 against $0.60 per 5-second clip (JOS-165 spike).

## Goals / Non-Goals

**Goals:**

- A new video vendor that fits the pattern (optional upload, then submit, then poll) is added on `/admin` with no code and no release.
- A connector profile behaves like a coded one in binding, retries, moves, time limits, restart recovery, request status, diagnostics, telemetry and reports.
- The key can only reach the host it was entered for.
- Proof with two real vendors (Runway with two models, RunningHub through the connector), with no vendor-specific code.

**Non-Goals:**

- Logins that are not a fixed key (OAuth, service-account tokens, signed requests), images hosted by the app, webhooks, calls that block until the clip is ready, a clip returned as bytes, more than three steps.
- Connectors for the other stages.
- A library of ready-made definitions in the app. The worked examples live in the docs.
- Retiring the coded `runninghub-video` adapter (follow-up once parity is shown).

## Decisions

### Decision 1: A definition is the profile's parameters

Adapter type `configured-video`, stage `video`. Its parameters:

```jsonc
{
  "baseUrl": "https://api.dev.runwayml.com",          // https, host only (no path, query or credentials)
  "model": "wan3",                                     // fills {model}
  "resolution": "auto_1080p",                          // fills {resolution}; shown in the clip request status
  "admittedDurationSeconds": { "min": 5, "max": 15 },
  "requests": {
    "headers": { "Authorization": "Bearer {key}", "X-Runway-Version": "2024-11-06" },
    "upload": null,                                    // optional, see the RunningHub example
    "submit": {
      "method": "POST", "path": "/v1/image_to_video",
      "body": { "model": "{model}", "promptText": "{instruction}", "promptImage": "{image_data_uri}",
                "duration": "{duration}", "ratio": "{resolution}" },
      "taskIdAt": "id"
    },
    "poll": {
      "method": "GET", "path": "/v1/tasks/{task_id}",
      "statusAt": "status", "doneWhen": ["SUCCEEDED"], "failedWhen": ["FAILED", "CANCELLED"],
      "videoUrlAt": "output[0]", "errorAt": "failureCode", "notFoundStatus": 404
    },
    "check": { "method": "GET", "path": "/v1/organization", "connectedStatus": 200, "charged": false }
  }
}
```

RunningHub through the connector differs only in `requests`:

```jsonc
"upload": { "path": "/openapi/v2/media/upload/binary", "multipartField": "file", "urlAt": "data.download_url",
            "errorAt": "errorCode", "okErrorValues": ["", null] },
"submit": { "method": "POST", "path": "/openapi/v2/minimax/hailuo-h3/image-to-video",
            "body": { "prompt": "{instruction}", "duration": "{duration}", "resolution": "{resolution}", "firstFrameUrl": "{image_url}" },
            "taskIdAt": "taskId", "errorAt": "errorCode", "okErrorValues": ["", null] },
"poll":   { "method": "POST", "path": "/openapi/v2/query", "body": { "taskId": "{task_id}" },
            "statusAt": "status", "doneWhen": ["SUCCESS"], "failedWhen": ["FAILED"],
            "videoUrlAt": "results[0].url", "errorAt": "errorCode", "okErrorValues": ["", null] }
```

The exact values (the Runway task-id field, the check path, the RunningHub submit path) are confirmed live in task 1. Both definitions are kept in `docs/video-connector-definitions.md` and used as the test fixtures, so the docs cannot drift from what passes.

One profile is one definition plus one model. A second model on the same vendor is a duplicated profile (Decision 6).

*Alternative:* a separate "connector" table that several profiles point to. Rejected for now: it needs a migration, a second admin list and its own delete rules, and the only gain is not copying a definition. The definition is copied with "Duplicate".

### Decision 2: Templates and paths stay small

- **Placeholders.** A JSON string value that is exactly one placeholder (`"{duration}"`) is replaced by the typed value, so `duration` is sent as a number. A placeholder inside a longer string (`"Bearer {key}"`, `"/v1/tasks/{task_id}"`) is replaced as text, and in a path it is URL-encoded. The placeholders are `{instruction}`, `{duration}`, `{model}`, `{resolution}`, `{image_data_uri}` (`data:image/png;base64,...`), `{image_base64}`, `{image_url}` (only with an upload step), `{task_id}` (poll only) and `{key}` (headers only). An unknown placeholder, `{image_url}` without an upload step, or `{key}` outside the headers is refused at save time.
- **Paths into an answer** use dots and `[n]` (`results[0].url`), read with the same reducer `providerConnectionCheck.ts` already uses (`bodyField`). This is not JSONPath. Nothing is evaluated.
- **The connector sends only what the template names.** It adds no fields of its own, so vendors that refuse unknown fields work.

### Decision 3: The connector runs the port, one request per call

`createConfiguredVideoProvider({ fetchFn, loadKey, parameters })` in `videoConnector.ts`:

- `submit`: runs the upload step if there is one, then the submit step, and returns `{ kind: "submitted", requestId: <value at taskIdAt>, sentBody: { prompt, duration, resolution } }`. `sentBody` has the keys `allowListVideoRequest` reads, so the clip request status shows the prompt, duration and resolution, and never the image data or the key. The upload and the submit are one attempt, as in the coded RunningHub adapter.
- `poll`: runs the poll step. A status in `doneWhen` with a URL at `videoUrlAt` is a temporary-link success, downloaded before the chunk completes (§12.2). A status in `doneWhen` without a URL, or in `failedWhen`, is a transient failure. A `notFoundStatus` answer is `not_found`. Any other status is pending.
- Every request goes to `baseUrl` + the step's path, with the definition's headers, and has no retry of its own (the `adapters-no-hidden-retries` rule).

### Decision 4: Classification is the shared rule, plus the vendor's error field

- HTTP answers use the shared rule: a 4xx other than 408 and 429 is not retryable; a 408, a 429 or a 5xx is transient.
- A failed `fetch` is transient and marked unresponsive (JOS-257).
- An answer that does not parse, or lacks the value at `taskIdAt`, `urlAt` or `statusAt`, is a transient failure naming the step and the missing path.
- A 2xx answer whose `errorAt` value is not in `okErrorValues` (default `["", null]`, and a missing value is ok) is a transient failure. Its reason names the step and carries the vendor's code and up to 120 characters of the message, never the key.
- A task in `failedWhen` stays transient, because the app has no confirmed not-retryable signal (`NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED`). Runway's `SAFETY.*` codes are recorded in the reason, and treating them as not retryable is a follow-up.

The connector passes the shared adapter contract (JOS-262) with each example definition as a fixture.

### Decision 5: The key is bound to the host

- `baseUrl` must be `https://<host>` with an optional port, and no path, query, user info or fragment. Every step has a path, never a URL.
- `{key}` may appear only in header values. A key is never put in a URL, a body or a query.
- Saving a profile whose `baseUrl` host differs from the stored one clears its stored key, and the response says so. The page warns before saving.
- The video download follows the URL the vendor returns, as today. That request carries no key.

With this, a typed definition can send the key only to the host it was entered for. The page shows that host next to the key field. This answers JOS-218's first reason. The second reason, guessed classification, is answered by the shared rule plus the vendor's declared error field (Decision 4), and by the live proof (task 1).

### Decision 6: Duplicate a profile for another model

"Duplicate" opens the add form filled from a profile: definition, durations and resolution, with the label suffixed " (copy)". It is a form prefill, with no new endpoint. `POST /admin/provider-profiles` accepts `copyKeyFrom: <profile id>`. The server copies that profile's encrypted key only when both profiles are `configured-video` with the same `baseUrl` host, and otherwise refuses with a problem on `copyKeyFrom`. The key never travels to the page.

### Decision 7: The other per-type tables

- `VIDEO_ADAPTERS: Record<VideoAdapterTypeId, (profile) => VideoProvider>` in `videoProvider.ts`. `defaultRegistry()` uses it, and a video type without an entry fails the type check.
- `videoCrossCheck` runs for every video adapter type.
- The connection check for `configured-video` runs the definition's `check` step. `connected` is the `connectedStatus`; a 401 or 403 is key rejected; a failed request is unreachable; anything else is unexpected, with its status. `covers` is "Only the key was checked. The model and the requests were not." A definition without a `check` step makes the test answer that no check is defined, and sends nothing. A `charged: true` check uses the existing disclosure and confirmation.
- Telemetry: `vendorFor()` returns the `baseUrl` host for a `configured-video` profile. `ADAPTER_VENDORS["configured-video"]` is "Configured connector", used where no profile is at hand.
- Diagnostics show a video profile's `parameters.model` when it has one, and `minimax/hailuo-h3` for the seeded RunningHub profile.

### Decision 8: The form gets a JSON field kind

`ParameterField.kind` gains `json`: a text area holding the JSON of `requests`. It is parsed on the page before saving, and every problem is listed by the server, with the path inside `requests` (for example `requests.poll.statusAt`). `baseUrl`, `model`, `resolution`, the durations and the price stay plain fields. The help text links to `docs/video-connector-definitions.md`.

*Alternative:* one form field per step value. Rejected: about twenty fields, nested lists for statuses, and a body template still needs a JSON editor.

### Decision 9: Video quality is capped at 1080p

The owner decided this on 2026-11-06 to keep cost down.

- **Final video.** `output` in `config/settings.ts` accepts exactly `{ width: 1280, height: 720 }` or `{ width: 1920, height: 1080 }`, with `fps` unchanged. Anything else fails at start-up with a problem on `output`. The shipped default stays 1080p. Subtitles keep their 1920×1080 frame (`PlayResX`/`PlayResY` in `subtitles.ts`). libass scales that frame to the video, so position and size relative to the frame stay the same at 720p. A 720p render in the manual tests confirms this. If it does not hold, `SUBTITLE_STYLE` takes its frame from the output setting.
- **RunningHub.** `PARAMETER_SHAPES["runninghub-video"]` gains `resolution: z.literal("768P").default("768P")`. A profile stored without it, which includes the seeded one, gets the default and requests `768P`. `VIDEO_GENERATION_SETTING` (fixed `2K`, 2560×1440) is removed. The adapter reads the profile's value and puts it in `sentBody`, so the clip request status shows `768P`.
- **Connector.** `resolution` is a vendor string, because each vendor names its tiers in its own way (`auto_720p`, `720p`, `768P`). It is refused when it matches `/2k|4k|1440|2160|2560|3840/i`. `// ponytail: a name check, not a measurement; a vendor that calls a tier above 1080p something else gets through. If that happens, check the downloaded clip's height (JOS-265 inspects generated clips).`
- **Upscaling is allowed.** RunningHub's 768P (1344×768) into a 1080p video is scaled by the existing `scale=` filter, so no rule ties the clip size to the final size.

*Alternatives:* 
- Keep 2K for RunningHub. Rejected by the owner: the assembly downscales it anyway, and it costs about 56% more than 768P.
- Put the final size on `/admin`. Rejected: operational settings stay in files (PRD §11.2).

## Risks / Trade-offs

- [Existing RunningHub price is the 2K price] → The cost report keeps using it until the Administrator updates the price on `/admin`. The release note and PRD §11.3 say so, and the change does not edit stored prices.
- [768P clips look softer in a 1080p video] → The owner accepted this for cost. 2K is not offered.

- [A vendor needs something the definition cannot express] → It is listed as a non-goal. That vendor gets a coded adapter, as RunningHub has today. The table per video type keeps that open.
- [The Administrator writes a wrong definition and pays for failed clips] → Save-time validation catches structure, placeholders and paths. The connection check catches the host and key. A submit that fails with a 4xx is not retried, and the first failing clip shows the step and the vendor's message in the scene details.
- [Runway's concurrency is per tier and queues extra tasks as `THROTTLED`] → `THROTTLED` is not in `failedWhen`, so it is pending. The video time limit still bounds it.
- [A data URI of a 2K PNG makes a large body] → The live proof measures it on Runway. The image stage's PNG is about 1920×1088, under 5 MB.
- [Runway links expire in 24–48 h] → The clip is downloaded as soon as `poll` sees success, as today.
- [Telemetry now carries a host that the Administrator typed] → The host is constrained to a hostname (Decision 5) and is the vendor's public API host. Labels are still never sent.

## Migration Plan

No database change. Existing profiles are untouched, and RunningHub stays seeded and active. A connector profile does nothing until the Administrator adds it, enters its key and makes it active. Rollback: make RunningHub active again; work bound to a connector profile keeps retrying on it, or the Administrator moves its failed stages (JOS-172).

## Open Questions

- Confirmed live in task 1: the field that holds Runway's task id, a free Runway request for the check, RunningHub's submit path as a connector path, and whether Runway answers an unknown task with 404.
- Whether to retire the coded `runninghub-video` adapter once its connector definition has run a full session (follow-up ticket).
