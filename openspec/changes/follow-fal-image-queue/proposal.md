## Why

On long scripts (≥ 50 scenes) many scenes fail at the image stage with "did not answer within the time limit", and we pay for images we never receive. JOS-239 evidence (Windows run `01M64DEGFHWJEEDJB3MWZ527E0`, fal.ai usage CSV, fal.ai dashboard):

- fal.ai allows **20 requests at once** per account. The first burst of 49 got 29 HTTP 429 refusals, and we retried them immediately.
- 273 of 374 image requests hit our 300 s limit. Even with only 4–10 requests in flight, images took 80–300+ s.
- fal.ai **finishes and bills the requests we abandon**. On Oct 30 it billed 96 of 97 accepted requests, while only 24 answered within 300 s. About 282 images were wasted, ≈ $19 of $26.26 (72%).

The cause is in our adapter: one attempt is one synchronous `https://fal.run/<model>` call, and its clock includes the time spent in fal.ai's queue. On timeout we hang up and send a new, billed request at once, so every retry adds to the queue it is waiting in.

## What Changes

- The fal.ai image adapter submits each attempt **once** to `https://queue.fal.run/<model>` and follows that request (status, result, cancel) until it ends, instead of holding a synchronous call open.
- **Waiting in fal.ai's queue is not execution time.** Each request carries a 1800 s start window that fal.ai enforces before it starts the job (a request that never started is not billed). The image stage's maximum time (300 s) counts from when fal.ai starts the job.
- **Past the maximum time, the same request keeps being followed** up to a ceiling of twice the limit, as clips already do (JOS-204). At the ceiling the request is cancelled and the scene fails with no further automatic retry in that cycle.
- **Automatic image retries wait** the existing retry delay, honouring `Retry-After` on HTTP 429. Today they are sent immediately.
- **The default image cap goes from 200 to 6**, well under fal.ai's limit of 20. A slot is held until the request ends, not until the submit returns.
- **New: a one-time end-of-session sweep.** When a session's scene work goes idle with scenes failed at the image stage for a reason a retry can fix, each such scene gets one new retry cycle automatically, at most once per session. Clip failures are not swept.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chunk-image-generation`: an image request is submitted once to the provider's queue and followed until it ends; returned follow-up URLs are validated before the key is sent; automatic image retries wait the retry delay.
- `stage-execution-time-limit`: the image request's clock starts when the provider starts the job, not at the call; the queue wait has its own start window; past the limit the same request is followed up to twice the limit, then cancelled.
- `provider-request-limit`: the image cap becomes 6 and must stay under fal.ai's account limit (20).
- `image-failure-recovery`: adds the one-time end-of-session sweep of image failures a retry can fix.
- `scene-completion-gate`: a session derives `failed` (`failedPhase: "scenes"`) only once the sweep has run or has nothing to retry.

## Impact

- **Code:** `backend/src/imageProvider.ts` (adapter interface becomes submit / poll / cancel; fal.ai queue API; stub adapter), `backend/src/orchestrator.ts` (image attempt and poll loop, ceiling, delayed retry, sweep), `backend/src/db.ts` (migration: whether a scene's image failure can be swept; the session's sweep marker), `backend/config/settings.default.json` and `backend/src/config/providers.ts` (image cap 6; queue start window constant).
- **Provider calls:** status checks every 5 s per open request (≤ 6 open by default, ≈ 1.2 calls/s). Fewer image calls overall, because timeouts no longer resend.
- **Cost:** no duplicate billed images caused by our own timeouts. A request cancelled at the ceiling may still be billed if fal.ai finishes it.
- **Docs:** `docs/PRD.md` §10.1 and §11 (v1.30), `docs/data-model.md` (new columns), README caps table.
- **Not affected:** the video stage (RunningHub), the provider connection check, the API contract (`docs/api-spec.yml`), restart recovery of an in-flight image request (still treated as a lost attempt; resuming by request id is a follow-up).
