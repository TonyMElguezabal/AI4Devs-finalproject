# Design — Generate the clip of each scene (JOS-146)

## Context

What exists on `feature/entrega-2-JAME` (the base of this branch), and what this story adds to it:

- **The scene pipeline is a single-stage skeleton.** `orchestrator.ts`'s `launchScene` runs one generic stage (`STAGE = "image"` in `types.ts`). It takes a slot from `concurrency.ts`, respects the session pause, inserts an append-only `provider_requests` row, and sends the request to a deterministic stub (`provider.ts`). On success, `applyOutcome` writes an artefact, commits it in `scene_results`, and sets the scene to `chunk-complete`. `scene_results` has `scene_id` as its primary key, so a scene can commit exactly one result.
- **Failures always say `image`.** `sceneToPayload` sets `affectedStage: "image"` for every failed scene. `manualRetry` and `correctAndRetry` send a failed scene back to `submitted`, and `correctAndRetry` overwrites `instruction`, the image stage's input.
- **Restart safety** comes from `reconcileOnBoot`: every in-flight scene's current request is polled, and a resolved, lost or still-pending request is applied, counted or re-armed.
- **JOS-145 (US-12)**, designed but not implemented, turns the skeleton stage into the real image stage (Fal.ai). It ends in `image-complete`, stores the image path in `scenes.result`, binds the image provider in `scenes.provider` on the first attempt, and removes the shortcut to `chunk-complete`. JOS-145's own Decision 4 says JOS-146 adds `image-complete → video-generating`.
- **JOS-147 (US-14)**, not started, chooses the requested duration. It builds on `closestAdmittedDuration` (`admittedDurations.ts`, JOS-140), which already implements §7.2's "smallest speed change, tie to the longer". It also depends on JOS-143's narration interval.
- **The video provider** (JOS-165, ADR 0005) is RunningHub's `/openapi/v2/minimax/hailuo-h3/image-to-video` at the `2K` setting. A call is asynchronous:
  1. upload the image (`POST /openapi/v2/media/upload/binary`) to get a URL;
  2. submit `prompt`, `resolution`, `duration` and `firstFrameUrl` to get a `taskId`;
  3. poll `POST /openapi/v2/query` until `SUCCESS`, which returns `results[0].url`, a link to the MP4.

  Observed: 141-160 s per clip, 5 s requested gave 5.17 s. The phase limit is 240 s (`PER_PHASE_MAX_TIME_SECONDS.video`). The concurrency cap is `undetermined`: probing stopped at 3 simultaneous requests without degradation.

## Goals / Non-Goals

**Goals:**
- `image-complete → video-generating → chunk-complete | failed` per chunk, launched automatically, never without a readable image (AC1-AC3).
- The video provider bound to the chunk's video stage, separately from the image stage's provider (AC4).
- Clip failures attributed to the video stage, and retried within the video stage only, never regenerating the image (§8.2, §11.2).
- Clips that never depend on an expiring link (§12.2) and survive a restart (§12.1).

**Non-Goals:**
- Choosing the duration (JOS-147), recording the speed factor (JOS-148), manual retry and correction after a clip failure (JOS-158), clip downloads (JOS-163), diagnostics in the UI (JOS-166).
- The real retry, time-limit and concurrency policies (JOS-184/154, JOS-185, JOS-167).
- Deriving `final-video` only when a final MP4 exists (JOS-149, JOS-150).
- Any frontend change. `video-generating` is already in the frontend's `SceneState`, and the scene list renders states from the snapshot.

## Decisions

**Decision 1 — The launcher checks the precondition itself, and a missing image is a not-retryable video failure.**
`launchVideoStage(sceneId)` returns without sending anything unless the chunk is `image-complete`. It then reads the stored image file (`scenes.result`, resolved inside the project folder) before any provider call. If the file cannot be read, the chunk fails its video stage with a not-retryable cause naming the file, and no request is sent (AC1).
- *Why not retryable:* retrying cannot bring the file back, and §11.2 forbids regenerating a completed image.
- *Alternative rejected:* trusting `image-complete` alone. JOS-145's Decision 2 makes the state imply the file existed when it was set, but the project folder is the User's local folder (§12.2), so a file can go missing afterwards. The file has to be read to upload it anyway, so the check costs nothing.

**Decision 2 — The video stage launches when the image result is committed, through its own concurrency key.**
The call to `launchVideoStage` happens right after the store accepts the image stage's commit, where the skeleton already counts `nextStageLaunches`, so a duplicate image delivery cannot launch the clip twice. `continueSession` also launches the session's held `image-complete` chunks, just as it launches `submitted` ones.
- The slot is taken from `concurrency.ts` under the key `video`, not `image`, so a slow clip (about 150 s) never holds an image slot.
- The video cap is `undetermined` (JOS-165). Until JOS-167 decides it, the key gets a provisional limit of 3, the highest concurrency actually observed without degradation, recorded as a named constant marked provisional.
- *Alternative rejected:* no limit (the gate's default when none is set). That would send every chunk of a long session to an unmeasured provider at once.

**Decision 3 — A `VideoProvider` port with an asynchronous shape: submit, then poll.**
- `submit({ imageBytes, instruction, durationSeconds })` returns `{ requestId }` or a classified failure.
- `poll(requestId)` returns one of `pending`, `not_found`, `success` (clip bytes or a temporary URL), `failed_transient` or `failed_not_retryable`.

The RunningHub adapter uploads the image, submits the task with `resolution: "2K"`, and uses the `taskId` as the request id. It polls the query endpoint, reads the credential through `config/credentials.ts`, and validates every response with Zod. The stub adapter covers every outcome for tests.
- *Polling:* every 10 s from the persisted `sent_at`, so a restart resumes the same schedule. An attempt unfinished at `PER_PHASE_MAX_TIME_SECONDS.video` (240 s) counts as a failed transient attempt. JOS-185 owns the real time-limit mechanism and replaces this check when it lands.
- *Classification:* HTTP 4xx except 408 and 429 is not retryable; other HTTP failures, network errors and a task that ends in `FAILED` are transient. JOS-165 found no distinguishable not-retryable signal for content (`NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED = false`), so task failures are treated as transient, as JOS-145 does for Fal.ai. The classification lives in the adapter alone.
- *Alternative rejected:* forcing the video stage into the skeleton's `send(..., onDeliver)` shape. That shape assumes the provider pushes its result, but RunningHub only answers when polled.

**Decision 4 — The requested duration comes from JOS-147 through one function.**
`launchVideoStage` asks JOS-147's selection function for the chunk's requested duration and passes it to `submit`, unchanged. This story neither chooses nor records it (JOS-148 records it). A chunk with no narration interval (the pre-decomposition skeleton path) cannot be given a duration. It fails its video stage with a not-retryable cause and sends no request.
- *Alternative rejected:* calling `closestAdmittedDuration` directly here. It would duplicate JOS-147's rules (the maximum, the unsplittable-sentence case) in a second place.

**Decision 5 — The video stage gets its own columns, its own commit record and per-stage attempts, in one additive migration.**
- `scenes.video_provider TEXT`: the video stage's binding, written once on the first attempt if still null (AC4). This is the same pattern as JOS-145's `scenes.provider` for the image stage.
- `scenes.video_result TEXT`: the clip's relative path. `scenes.result` stays the image path, so the image is visibly untouched by anything the video stage does.
- `scene_video_results (scene_id PRIMARY KEY, result, committed_at)`: the clip's commit record, so a duplicate success delivery stores nothing twice. It mirrors `scene_results`.
- `provider_requests.stage TEXT NOT NULL DEFAULT 'image'`: which stage each attempt belongs to. Existing rows are image attempts.
- `scenes.attempts` counts the **current** stage's attempts: it is reset to 0 when the video stage starts, so the image stage's attempts never spend the clip's retry budget (§10.1: the budget belongs to each stage). The per-stage history stays in `provider_requests`.

The migration number is **10** (task 1.4, checked 2026-09-30): `feature/entrega-2-JAME` tops out at 8, and 9 is taken by JOS-143's unmerged branch. Re-check before implementing, since JOS-143 or another branch may land first.
- *Alternative rejected:* changing `scene_results`' primary key to `(scene_id, stage)`. SQLite would need a table rebuild of a table that already holds data, for no gain over an additive table.
- *Alternative rejected:* resolving the attempt's stage from the scene's status alone. After a failure the status is `failed`, and the attempts' history would lose which stage each attempt belonged to.

**Decision 6 — `affectedStage` is derived, not stored.**
A `failed` chunk with a stored image path (`scenes.result` not null) failed at the video stage. A failed chunk without one failed at the image stage. Only a completed image stage writes that path (JOS-145 Decision 2), so the rule has no ambiguous case. `sceneToPayload` uses it, replacing today's constant `"image"`.
- *Alternative rejected:* a `failed_stage` column. The project derives state from records rather than storing it (the same choice as JOS-136 and JOS-139), and a column could disagree with the paths.

**Decision 7 — Manual retry and correction of a clip failure are refused until JOS-158.**
`manualRetry` and `correctAndRetry` return `{ ok: false }` (HTTP 409) for a chunk whose derived affected stage is `video`, with the reason "retrying a failed clip is not available yet". They change nothing. Image-stage failures keep today's behaviour.
- *Alternative rejected:* leaving them as they are. A retry would send the chunk to `submitted` and regenerate its completed image (§11.2 forbids it), and a correction would overwrite the image instruction for a clip failure.
- *Alternative rejected:* implementing video retry here. It is JOS-158's scope, together with `VIDEO` correction.

**Decision 8 — The clip is stored before success, and checked to be an MP4.**
The flow on a `success` poll is:
1. The orchestrator writes the clip (downloading it first when the adapter returns a URL) with `writeArtefactOnce` as `scene-<idx>.mp4` in the project folder.
2. It checks that the file is an MP4: a non-empty file whose first box is `ftyp` (bytes 4-8).
3. Only then does it commit `scene_video_results`, set `video_result` and move the chunk to `chunk-complete`.

A failed download or write, or a file that is not an MP4, counts as a failed transient attempt.
- *Alternative rejected:* probing the clip with `ffprobe`. The measured duration is assembly's input (JOS-149), not this story's, and spawning a process per clip adds a dependency for no requirement here.

**Decision 9 — Reconciliation covers `video-generating` through the bound adapter.**
`reconcileOnBoot` includes chunks in `video-generating`. It resolves the adapter from `scenes.video_provider`, polls the current request, and applies the same three outcomes the skeleton uses for the image stage (applied, lost = one failed attempt, pending = keep polling).

## Risks / Trade-offs

- **JOS-145 and JOS-147 have not landed.** → The task gate stops implementation until the image stage, its binding and the duration function exist on the base branch. This design names what it needs from them, so a changed shape shows up at the gate, not halfway through.
- **The shared `orchestrator.ts` changes under three stories at once** (JOS-145, JOS-146, JOS-136's `deriveSessionState` work). → Implement on top of JOS-145 once it merges. Whichever lands later merges the others' rules and re-runs all suites.
- **Real calls are slow and cost money** (about $0.60 and 2.5 minutes per clip). → Automated tests use the stub adapter only. Manual verification makes at most one real call, recorded in the report.
- **A session whose chunks are all `chunk-complete` derives to `final-video` today**, although no final MP4 exists yet. This is existing skeleton behaviour, which this story makes reachable with real clips. → It is recorded as a hand-off to JOS-150 and JOS-149, which own the final-video state, not changed here.
- **The concurrency cap of 3 is provisional.** → It is a named constant. JOS-167 replaces it.
- **The shared local database leaks migrations across branches** (project note). → Manual tests run on a scratch database only.

## Migration Plan

- One additive migration (Decision 5). Existing scenes get null `video_provider` and `video_result`, and existing `provider_requests` rows become `stage = 'image'`.
- Existing skeleton rows in `chunk-complete` stay as they are; nothing is rewritten.
- Rollback: revert the commits. The added columns and table are harmless if left in a development database.

## Open Questions

None blocking. The provisional concurrency cap (Decision 2) and the 10 s poll interval (Decision 3) are values the product owner can change without changing the design.
