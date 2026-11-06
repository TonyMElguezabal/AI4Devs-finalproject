## Context

The video stage talks to its vendor through the `VideoProvider` port in `backend/src/videoProvider.ts`: `submit({ imageBytes, instruction, durationSeconds })` returns a request id, and `poll(requestId)` returns pending, success (bytes or a temporary link), not found, or a classified failure. The orchestrator stores the request id, so a clip in progress at a restart is polled again, not requested again (`chunk-video-generation`, "An interrupted clip resumes after a restart"). The stage time limits, the request cap and the clip request status (JOS-200) are built on that port.

One adapter ships: `runninghub-video`. It uploads the image to RunningHub's storage, submits the task with the uploaded URL and polls it. RunningHub already runs `minimax/hailuo-h3`.

The per-adapter-type tables are keyed by `AdapterTypeId` (JOS-262): parameter rules and vendor (`providerTypes.ts`), the `/admin` form, the connection check (`providerConnectionCheck.ts`) and the contract fixtures (`adapter-contract.test.ts`). Adding an adapter type makes each of them fail to compile until it has an entry. Two places are not covered by that rule and assume one video type:

- `defaultRegistry()` in `videoProvider.ts` builds every video profile with `createRunningHubVideoProvider`, whatever its `adapterType`.
- `videoCrossCheck()` in `providerAdmin.ts` applies the segmentation bound only when `adapterType === "runninghub-video"`.

What Cloudflare documents for `minimax/h3` (model page and its input and output schemas, read 2026-11-05):

| Topic | Documented | Not documented |
|---|---|---|
| Endpoint | `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run`, `Authorization: Bearer <token>`, body `{ "model": "minimax/h3", "input": {...} }` | Whether an AI Gateway id header is needed |
| Input | `content[]` with a `text` item (1 to 7000 characters) and `image_url` items with role `first_frame`, `last_frame` or `reference_image`; `duration` 4 to 15 (required); `resolution` `768P` or `2K` (required); `ratio` optional | Whether `image_url.url` accepts a `data:` URI; image size and format limits |
| Output | `{ task: { id, status, content.url, error{code,message}, usage, ... } }`, status `queued`, `running`, `succeeded`, `failed`, `cancelled` | Whether the call blocks until `succeeded`; how to read a task by id later; how long `content.url` lives |
| Async | Gateway-wide `options.background: true` with a one-shot webhook; a `callback_url` input | A polling endpoint for this model |
| Errors | HTTP 401 with code `10000` for a token without Workers AI permission | The model's own error codes; rate limits |
| Price | $0.08 per second at 768P, $0.13 per second at 2K; Unified Billing credits needed | Whether the second is the output second |

The application runs on the Administrator's computer. It has no public URL, so it cannot receive a webhook and cannot host the image for Cloudflare to fetch.

## Goals / Non-Goals

**Goals:**

- A `cloudflare-video` profile can be added, tested and made active on `/admin`, and its clips go through the same port as RunningHub's, with the same binding, retries, time limits, restart recovery, request status and reports.
- Only facts checked against the live vendor go into the adapter.
- The video stage picks the adapter by the profile's type, so the next video vendor is one entry per table and nothing else.

**Non-Goals:**

- A generic adapter described on `/admin` (rejected in JOS-218, Decision 2).
- MiniMax's last frame, reference images, video and audio inputs, the aspect ratio, and a per-profile resolution. The assembly expects the 2K frame (`VIDEO_GENERATION_SETTING`), which both vendors produce.
- Webhooks, and AI Gateway caching or retries. The application keeps its own retry policy, one request per call.
- Cloudflare for any other stage.

## Decisions

### Decision 1: Verify against the live vendor first, with a stop rule

The first task is a spike with a script under the change folder, the owner's token, and `minimax/h3`. It sends one 768P 4-second text-only request, then image-to-video requests, and records each request and answer (token removed) in `reports/<date>-step-1-cloudflare-spike.md`. It answers:

1. **Blocking or task.** Does `ai/run` answer at once with `queued` or `running`, or hold the connection until `succeeded`? How long does a 2K clip take?
2. **Following a task.** Is there a request that reads a task by `task.id` (or by an id from `options.background: true`) and answers its status, with no webhook? Does it still answer after several minutes, and what does it answer for an unknown id?
3. **The first frame.** Is a `data:image/png;base64,...` URI accepted as `image_url.url` for a 2560×1440 PNG of our size? What is the largest accepted body?
4. **Failures.** The HTTP status and body for a bad token, a token without Workers AI permission, a bad model, a duration of 3, an oversized prompt, and a content refusal if one can be triggered with a harmless prompt.
5. **Limits and cost.** Rate-limit headers or 429 behaviour, how long `content.url` can be downloaded, and the `usage` and charge of one 2K clip.

**Stop rule.** The change continues only if (2) gives a way to follow a task by an id the application can store and (3) gives a way to send a local image. If either is missing, the spike report says so, the change stops before any production code, and the owner chooses how to re-plan (for example a public image upload, which needs its own storage and key). A blocking call alone is not enough: holding one HTTP request open for several minutes per clip breaks restart recovery, which would then request a second, billed clip.

*Alternative:* write the adapter from the documented schema and fix it in review. Rejected: the open points decide the adapter's shape, and the cost of a wrong guess is billed clips.

### Decision 2: The adapter keeps the port's submit and poll

`createCloudflareVideoProvider({ fetchFn, loadKey, parameters })` implements `VideoProvider`:

- `submit` encodes the image as the spike confirms, sends one `ai/run` request, and returns `{ kind: "submitted", requestId: task.id }`. When the first answer is already `succeeded`, it still returns the id: the next `poll` sees `succeeded` and returns the link, so success always takes one path.
- `poll` sends the one request that reads the task (Decision 1, question 2) and maps the status: `queued` and `running` are pending; `succeeded` with `content.url` is a temporary-link success; `succeeded` without a URL, `failed` and `cancelled` are transient failures that carry `error.code`. An unknown id is `not_found`.
- HTTP answers are classified with the shared rule (`classifyHttpStatus`: 4xx other than 408 and 429 not retryable, otherwise transient). A failed `fetch` is transient and unresponsive. Cloudflare's `{ success: false, errors: [{ code, message }] }` envelope gives the reason: the step, the first error code and up to 120 characters of the message, never the token.
- `failed` stays transient because the application has no confirmed not-retryable signal (`NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED = false`). If the spike finds a distinguishable content refusal, it is recorded and left for a follow-up, as for RunningHub.

The task id is a vendor request id, stored and handled as RunningHub's is: never shown to the User.

### Decision 3: The recorded request body stays flat and small

`submit` returns `sentBody: { prompt, duration, resolution }`, the keys `allowListVideoRequest` reads. The page shows the first frame as "scene N image" as today. The base64 image and the token never enter `sentBody`, a log or a stored row.

### Decision 4: Parameters, key and host

`PARAMETER_SHAPES["cloudflare-video"] = { accountId, model, admittedDurationSeconds }`:

- `accountId`: `/^[0-9a-f]{32}$/`. It sits in the URL path, so the strict pattern keeps it from changing the host or the path.
- `model`: the existing `modelId` rule. The form's help text gives `minimax/h3`.
- `admittedDurationSeconds`: the existing `{ min, max }` shape. The help text says Cloudflare documents 4 to 15. The schema does not fix those numbers, because they belong to the model and a later model can differ.

The host `api.cloudflare.com` is a constant in the adapter and in the connection check. The key is the API token, read with `keyFor(profile.id)`. `cloudflare-video` is never seeded, so it has no legacy environment name, and `keyStore.ts` does not change. The vendor is `"Cloudflare"` in `ADAPTER_VENDORS`.

### Decision 5: The video registry picks the adapter by type

A table in `videoProvider.ts`:

```ts
const VIDEO_ADAPTERS: Record<VideoAdapterTypeId, (profile: ProviderProfile) => VideoProvider> = { "runninghub-video": ..., "cloudflare-video": ... };
```

`VideoAdapterTypeId` is the adapter types whose stage is `video`. `defaultRegistry()` calls `VIDEO_ADAPTERS[profile.adapterType]`. A shipped video type without an entry fails the type check, as JOS-262 does for the other tables. Image, voice, alignment and reasoning keep their single factory: they have one type each, and a table for them is the next vendor's change to make.

*Alternative:* a generic `Record<AdapterTypeId, factory>` over all stages. Rejected for now: the ports differ per stage, so one table would need a union of adapter types and casts.

### Decision 6: The duration rule and diagnostics follow the stage, not the vendor

`videoCrossCheck` runs for every adapter type whose stage is `video`. That is what the requirement already says, and the code catches up. `stageDiagnostics.ts` shows a video profile's `parameters.model` when it has one, and keeps `minimax/hailuo-h3` for the seeded RunningHub profile, which has no model parameter.

### Decision 7: A free token check

`CONNECTION_CHECKS["cloudflare-video"]` sends `GET https://api.cloudflare.com/client/v4/user/tokens/verify` with the bearer token. An answer of `success: true` and `result.status === "active"` is connected. HTTP 401 or 403, or a token that is not active, is key rejected. A failed request is unreachable. Anything else is unexpected, with its status. `covers` is "Only the token was checked. The account, the model and the Workers AI permission were not." If the spike shows that account-owned tokens need `/accounts/{accountId}/tokens/verify` instead, the check uses that path, still free.

## Risks / Trade-offs

- [Cloudflare offers no task read without a webhook] → Stop rule (Decision 1). No production code is written on a guess.
- [A base64 2K PNG makes a large request body] → The spike measures the accepted size. If a PNG of our size is refused, the spike tries JPEG at the same size. Any conversion is recorded in the design before code, because the image stage stores PNG.
- [`content.url` expires before the download] → The clip is downloaded the moment `poll` sees success, as for RunningHub (§12.2). The spike records the lifetime.
- [Cloudflare's rate limit is lower than the video request cap] → The spike records it. The cap is per stage, not per vendor. If Cloudflare's limit is lower, the report says so and the owner decides whether the cap needs to follow the active vendor (a separate ticket).
- [The billed second is not the output second] → The spike reads `usage` and the account charge for one clip. The price the Administrator enters stays per clip second, and the report states the conversion if one is needed.
- [The same MiniMax model behind two vendors gives different results] → Out of scope. The spike keeps one clip from each vendor for the same scene, for the owner to compare.

## Migration Plan

No database change. Existing profiles are untouched. RunningHub stays seeded and active. A Cloudflare profile does nothing until the Administrator adds it with a token and makes it active. Rollback: make RunningHub active again on `/admin`. Work already bound to the Cloudflare profile keeps retrying on it, or the Administrator moves its failed stages (JOS-172).

## Open Questions

- Decision 1, questions 1 to 5, answered by the spike. The specs say "in the way the verification spike confirms" where an answer changes the request, and those lines are replaced by the confirmed request before the code tasks start.
- Whether the AI Gateway path or the plain Workers AI path is the one to use, if they differ for third-party models: the spike tries the documented `ai/run` path first.
