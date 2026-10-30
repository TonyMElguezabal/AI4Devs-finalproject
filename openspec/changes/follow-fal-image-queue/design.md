## Context

The image stage calls fal.ai through `createFalAiImageProvider` (`backend/src/imageProvider.ts`): one attempt is one synchronous `POST https://fal.run/<model>` held open with `AbortSignal.timeout(phaseTimeoutMs("image"))` (300 s). `runImageAttempt` (`backend/src/orchestrator.ts`) takes an image slot, calls `generate`, records one `provider_requests` row, releases the slot, and on a transient failure `applyFailureOutcome` calls `launchImageStage` again straight away.

JOS-239 evidence (proposal, and the JOS-239 Linear comment "Analysis of the Windows run"): fal.ai queues requests on its side (account limit 20), our clock counts that queue time, and on timeout we hang up while fal.ai still runs and bills the job. ~72% of the image spend in the measured run was wasted.

The video stage already solves the same shape: `VideoProvider` is `submit` / `poll`, `pollVideoRequestOnce` follows one task on a timer, and JOS-204 keeps following it past the limit up to twice the limit.

Constraints: backend is Node strip-only TypeScript (no enums, no parameter properties); no test calls a real provider (`test/setup.ts` stubs; contract tests opt in with `RUN_PROVIDER_CONTRACT_TESTS=1`); tests use a scratch `DB_PATH` and `PROJECTS_ROOT`.

## Goals / Non-Goals

**Goals:**
- One fal.ai request per attempt, followed until it ends; no resubmission while it can still finish.
- Queue time at fal.ai is not execution time; the 300 s limit counts from `IN_PROGRESS`.
- No paid duplicates caused by our own timeouts; delayed automatic retries; image cap 6.
- A one-time end-of-session sweep of image failures a retry can fix.

**Non-Goals:**
- Resuming an in-flight image request after a restart (it stays a lost attempt, as today).
- Showing fal.ai's `queue_position` in the UI.
- Changing `maxTimeSeconds.image`, the retry budget, the video stage, or the provider connection check.
- Webhooks (the app runs locally and cannot receive them).

## Decisions

### 1. fal.ai queue API, not a longer synchronous call

Submit with `POST https://queue.fal.run/<model>`, then use the `status_url`, `response_url` and `cancel_url` the submission returns. For models with a sub-path (`bytedance/seedream/v5/pro/edit`, `fal-ai/flux/dev`) those URLs use only `owner/app`; building them ourselves from the model id answers 405, so the returned URLs are the source of truth.

Alternatives: keep `fal.run` with a longer timeout (still abandons and pays for any request past the limit, and still counts queue time); webhooks (need a public URL).

### 2. Adapter interface mirrors `VideoProvider`

`ImageProvider` becomes:

```ts
submit(instruction, referenceImage?): Promise<ImageSubmitResult>   // { kind: "submitted"; handle } | failure
poll(handle): Promise<ImagePollResult>                            // queued | in-progress | success{image} | failure
cancel(handle): Promise<"cancelled" | "already-completed" | "unknown">
```

`handle` is `{ requestId, statusUrl, responseUrl, cancelUrl }`. Failures keep the existing `failed_transient` / `failed_not_retryable` kinds and gain an optional `retryAfterSeconds` (parsed from `Retry-After` on HTTP 429). The adapter checks every returned URL with `new URL(u).origin === "https://queue.fal.run"` before sending the key; otherwise the submission is a transient failure whose reason does not echo the URL.

`poll` maps: `IN_QUEUE` → queued; `IN_PROGRESS` → in-progress; `COMPLETED` without `error` → fetch `response_url` and parse `images[0].url` with the existing `falResponseSchema`; `COMPLETED` with `error` → transient, unless `error_type` names invalid input → not retryable. A network error or HTTP 5xx on a status call returns a distinct `check-failed` result that the orchestrator treats as "still pending" (no attempt used).

The stub adapter (`createStubImageProvider`) gains a scripted sequence of poll results, so tests can drive `queued → in-progress → success` and every failure path without timers on the provider side.

### 3. The poll loop lives in the orchestrator, beside the video one

`runImageAttempt` submits, stores `requestId` as `scenes.current_request_id` (as video does with the RunningHub task id), keeps the handle in an in-memory `Map<sceneId, handle>`, and schedules `pollImageRequestOnce(sceneId, requestId, attemptNumber, submittedAtMs, inProgressAtMs?)` every `imagePollIntervalMs` (5000, with a test setter like `setVideoPollIntervalMs`; timer `unref`'d). Each tick re-reads the scene and stops if it is no longer generating that request. The handle is not persisted because restart recovery of image requests is out of scope; `current_request_id` is enough for diagnostics.

The slot is released only when the request ends (success, failure, ceiling), not when the submit returns, so the cap bounds requests open at fal.ai.

One `provider_requests` row per attempt is still written at the end, with latency from submit to end, so reports and the JOS-239 comparison stay comparable.

### 4. Time limits: start window, clock from `IN_PROGRESS`, 2× ceiling

- The submit sends `X-Fal-Request-Start-Timeout: 1800` (`IMAGE_QUEUE_START_WINDOW_SECONDS` in `backend/src/config/providers.ts`, a constant: it does not vary per installation). fal.ai enforces it server-side, so a request that never started is dropped unbilled. The status/result of such a request is classified as transient (Decision 2).
- `inProgressAtMs` is set on the first poll that reports `IN_PROGRESS` (resolution: one poll interval, ≤ 5 s).
- Nothing happens at the limit itself. At `2 × phaseTimeoutMs("image")` after `inProgressAtMs` the orchestrator calls `cancel(handle)` once: `already-completed` → poll once more and accept the result; otherwise mark the scene `failed` with the ceiling reason via `markSceneFailed`, record the attempt as `transient_failure` (so it stays sweepable, Decision 6) and do not schedule a retry.
- `phaseTimeoutMs("image")` undefined (limit not set) → no ceiling, consistent with "a stage without a defined maximum time is not timed".

Alternative considered: keep counting from submit (JOS-185 Decision 9). Rejected: that is the bug.

### 5. Delayed automatic retries reuse the bounded retry policy

`applyFailureOutcome` for the image stage keeps its budget rule but, instead of calling `launchImageStage` at once, waits `retryDelaySeconds({ failedSequence: attemptNumber, config, retryAfterSeconds })` with the delay config already used by `stageAttemptRecorder` (exported through a small getter; `bootstrap.ts`'s `RETRY_BASE_DELAY_SECONDS` / `RETRY_CAP_DELAY_SECONDS` keep working for manual testing). The scene is `submitted` (via the existing `markScenePendingRetry`) while it waits, so a restart relaunches it at boot as any submitted scene, and a pause holds it through `admitLaunch` as today. The clip stage's retry path is unchanged.

### 6. Whether an image failure can be swept is derived, not stored

A scene failed at the image stage (`status = 'failed'`, `result IS NULL`) is sweepable when its latest image `provider_requests` row has mode `transient_failure`. Every not-retryable path already records `not_retryable_failure` (rejected reference, missing key, no adapter, invalid input); exhausted cycles, the ceiling (Decision 4) and a passed start window record `transient_failure`. This follows the project's preference for derived state over status columns. Task 1.x verifies that every image failure path writes a row before relying on it.

Alternative: a `scenes.image_failure_sweepable` column — redundant with the attempt history.

### 7. The sweep marker is a column; the sweep runs where every state change is published

`runs.image_sweep_at TEXT NULL` records that the session was swept. It cannot be derived: a swept retry and a manual retry leave the same rows.

`sweepIdleImageFailures(runId)` runs at the start of `broadcast(runId)`, the one function every scene settle, resume and manual action already calls before publishing. Its checks, in order: marker is null; `admitLaunch(runId).admitted` (not paused); `assemblyGate(scenes).processingSceneIndexes` is empty; at least one sweepable scene. Then it claims the marker with `UPDATE runs SET image_sweep_at = ? WHERE id = ? AND image_sweep_at IS NULL` and proceeds only if one row changed (two concurrent broadcasts cannot both sweep), and calls `manualRetry(runId, sceneId)` for each sweepable scene. Because this happens before `toSnapshot`, the session is never published as `failed` while the sweep is due. Boot calls it once per run after the settle, for a session that went idle just before a shutdown.

Alternatives: call it from each failure/success site (many call sites, easy to miss one); derive the sweep inside `deriveSessionState` (that function is pure and must stay so).

### 8. Pause and restart

A submitted request is not cancelled by a pause; it keeps being followed and its result is kept. On restart, an in-flight image scene is still settled as "interrupted by a restart" (transient), and the fal.ai job may still finish and be billed: recorded as a risk.

## Risks / Trade-offs

- [The exact shape fal.ai uses for a passed start window or an `error` on `COMPLETED` is documented loosely] → classify unknown errors as transient; the opt-in contract test records the real responses in the change report.
- [A request cancelled at the ceiling may still be billed if fal.ai finishes it] → the ceiling is twice the limit from `IN_PROGRESS`, which the measured run never reached for a running job; accepted.
- [An app restart abandons in-flight fal.ai jobs, which may be billed] → unchanged from today; follow-up story to resume by `request_id`.
- [Sweep logic in `broadcast` adds a DB read per publish] → the marker check short-circuits after the first sweep; the gate check reuses the scenes already loaded for the snapshot.
- [A cap of 6 lowers peak throughput] → owner decision (safety over speed); installations can raise it in `settings.json`.

## Migration Plan

- One DB migration: `ALTER TABLE runs ADD COLUMN image_sweep_at TEXT` (null for existing runs, so old sessions can still be swept once if they go idle with fixable failures).
- `settings.default.json`: `maxSimultaneousRequests.image` 200 → 6. Installations with their own `settings.json` keep their value.
- Rollback: revert the release; the extra nullable column is ignored by older builds.

## Open Questions

None. Owner decisions (2026-10-30, JOS-239): start window 1800 s, cap 6, ceiling failures swept once at the end of the session, clip failures not swept.
