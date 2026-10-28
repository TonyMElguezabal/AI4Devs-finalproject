## Context

A scene moves `submitted` → `image-generating` → `image-complete` → `video-generating` → `chunk-complete` (or `failed`).

The existing commands that act on a scene only accept a `failed` one:
- `manualRetry` and `correctAndRetry` (`backend/src/orchestrator.ts`);
- their conditional writes `markSceneForManualRetry`, `correctImageInstruction`, `markSceneForManualVideoRetry` and `correctVideoInstruction` (`backend/src/db.ts`).

Each one is a single conditional `UPDATE … WHERE status = 'failed' AND …`, so a lost race reads as a refusal.

Results are guarded once per scene:
- `commitSceneResult` and `commitSceneVideoResult` insert into `scene_results` and `scene_video_results`, both keyed by `scene_id`, so a second result for the same scene is refused.
- Images are written once as `scene-N-attempt-A.ext` and clips once as `scene-N.mp4`, both with `writeArtefactOnce`, which fails with `ArtefactAlreadyExistsError` if the file exists.

Assembly:
- `triggerAssemblyIfReady(runId)` runs after every clip commit. It launches the assembly when `assemblyGate` is open, meaning every scene is `chunk-complete`.
- `runAssemblyAttempt` returns at once for a session that already has a final video, unless `runs.rebuild_requested_at` is set. That rebuild path (JOS-190) writes `final-video-<version>.mp4`, records `final_video_builds`, swaps `final_video_path` and clears the request. A failed rebuild leaves the previous final video current and never sets the session's failure.
- `rebuildFinalVideo` (`finalVideoRebuild.ts`) refuses with `nothing-to-rebuild` unless the pause edits are pending. It does **not** check the gate today.
- At boot, an interrupted rebuild is not relaunched (JOS-190 Decision 8).

On the page, scene actions are derived from the scene's state in `frontend/src/sceneActions.ts`, never from a stored flag. Image URLs are fixed per scene (`/sessions/{id}/scenes/{sceneId}/image`).

## Goals / Non-Goals

**Goals:**
- A User-seen defect in a generated scene is fixed by regenerating that scene's image and clip, optionally with edited instructions, as soon as the image exists.
- The final video follows automatically, built from the rebuilt scene and the unchanged others.
- Nothing already produced is overwritten or deleted.

**Non-Goals:**
- A clip-only rebuild. A rebuild always redoes image and clip (product owner: the image is the defect in about 90 % of cases).
- Listing or downloading earlier versions on the page.
- Changing the narration, timestamps, decomposition, requested duration or speed factor.
- Cancelling a request already sent (PRD §2.3).
- Marking rebuild attempts specially in the reports. They are ordinary image, video and assembly attempts and are counted, and costed, as such.
- Relaunching an interrupted automatic rebuild at boot.

## Decisions

### 1. One conditional write resets the scene: `markSceneForRebuild`
In one `db.transaction`:
- an `UPDATE scenes … WHERE id = ? AND run_id = ? AND status IN ('image-complete','chunk-complete')`. It sets:
  - `status = 'submitted'`;
  - `result`, `video_result`, `last_error`, `current_request_id`, `video_request_sent_at` and `video_request` to `NULL`;
  - `attempts = 0`;
  - `rebuild_count = rebuild_count + 1`;
  - `image_instruction = COALESCE(?, image_instruction)` and the same for `video_instruction`;
- `DELETE FROM scene_results` and `scene_video_results` for the scene;
- `UPDATE runs SET final_video_stale = 1 WHERE id = ? AND final_video_path IS NOT NULL`.

It returns whether the scene row changed. Zero changes means `scene-not-ready`, which covers two quick clicks as well. The bound providers (`provider`, `video_provider`), `requested_duration_seconds` and the narration interval are not in the column list, so they cannot change. A changed instruction is also recorded with `recordCorrectedInstruction`, as corrections are. A skeleton scene (no `IMAGE`) applies `imageInstruction` to its legacy `instruction`, using the same `hasImageInstruction` rule as `correctAndRetry`.

- **Why delete the guard rows:** they mean "this scene has its result". A rebuild is the one place that result is deliberately withdrawn. Old requests cannot race the delete, because a rebuild is only accepted when nothing for the scene is in flight. `image-complete` is accepted only before the clip request: `launchVideoStage` and `runVideoAttempt` re-read `status === 'image-complete'` with no `await` before `markVideoGenerating`, so a rebuild in between makes the queued clip release its slot and send nothing.
- **Alternative:** key the guard tables by `(scene_id, rebuild_count)`. Rejected: SQLite cannot alter a primary key without rebuilding the table, for no behavioural gain.

### 2. `sceneRebuild.ts` decides, then launches
`rebuildScene(sessionId, sceneId, { imageInstruction?, videoInstruction? })`:
1. Looks the scene up with `getSceneForRun`; if missing, returns `unknown-scene`.
2. Refuses with `assembly-in-progress` if an assembly attempt is in flight or `rebuild_requested_at` is set.
3. Calls `markSceneForRebuild`; on false, returns `scene-not-ready`.
4. Calls `launchSceneStage(sceneId)` and `broadcast(sessionId)`.

There is no `await`, so nothing interleaves (the same argument as `rebuildFinalVideo`). A paused session holds the launch like any other.

The route answers 202, 404 or 409. The Zod body is `{ imageInstruction?: string().trim().min(1), videoInstruction?: … }`, and an empty instruction gives 400.

### 3. Versioned file names from `rebuild_count`
A new helper `sceneFileStem(scene)` returns `scene-N` when `rebuild_count` is 0 and `scene-N-r{k}` otherwise. The image becomes `${stem}-attempt-${A}.${ext}` and the clip `${stem}.mp4`. First generations keep their names, so no fixture changes. `writeArtefactOnce` stays the guard.

### 4. Displayed URLs carry the rebuild number
When `rebuild_count > 0`, the scene payload's `imageUrl` and both download URLs (`downloads.imageUrl`, `downloads.clipUrl`) get `?r={k}`. The routes ignore the query, and the browser loads the new file instead of keeping the old `<img>`/`<video>`. A first generation keeps its URLs unchanged.

### 5. `runs.final_video_stale` marks a final video older than a rebuilt scene
- **Set by:** the rebuild transition (Decision 1), only when a final video exists.
- **Cleared by:** a successful rebuild, in the same branch that calls `replaceFinalVideoPath`.
- **Exposed as:** `finalVideo.staleScenes` (boolean) in the snapshot.

- **Why a column:** the alternative is deriving staleness by comparing clip commit times with the latest build. That needs the creation time of version 1, which has no row, and it breaks with clock skew. A flag written in the same transaction as the cause is exact.

### 6. Automatic reassembly lives in `triggerAssemblyIfReady`
When the gate is open:
- If `final_video_path` is set and `final_video_stale = 1`, it calls `requestFinalVideoRebuild(runId)`, and on `true` calls `launchAssemblyPhase(runId)`. That is the JOS-190 rebuild path, so it opens a fresh cycle, applies the stored pause edits and leaves the previous version current on failure.
- Otherwise it behaves as today. A first assembly runs, and a session failed at assembly assembles again, because `runAssemblyAttempt` does not look at the failure and clears it on success.

Several scenes lead to one assembly. The gate stays closed until the last one completes, and `requestFinalVideoRebuild` only succeeds once. `continueSession` goes through the same launcher, so a paused session rebuilds when it is continued.

### 7. `rebuildFinalVideo` checks the gate and accepts a stale video
The new order of checks is:
1. `session-not-found`;
2. `no-final-video`;
3. `assembly-in-progress`;
4. **`scenes-not-complete`** (new: the gate is closed);
5. `nothing-to-rebuild`, now only when there are no pending pause edits **and** the final video is not stale.

Without step 4, pressing "Rebuild final video" with pending pause edits while a scene is regenerating would assemble a scene whose `video_result` is `NULL`. That bug becomes reachable with this change, so the check is part of it.

### 8. No relaunch at boot
An interrupted automatic rebuild has its request cleared by the existing boot settle, which leaves `final_video_stale = 1`. The page then offers "Rebuild final video". This matches JOS-190 Decision 8 and avoids relaunching a rebuild that fails on every start.

### 9. Page: derived action, inline confirmation
- `sceneActions(scene, sessionState)` gains `rebuild`: true when the scene is `image-complete` or `chunk-complete` and the session is not `final-video-generating`.
- `SceneRow` shows a "Rebuild scene" button that opens an inline form: two textareas prefilled with `IMAGE` and `VIDEO`, a sentence saying the image and clip will be generated again and the final video rebuilt, and "Rebuild image and clip". There is no browser `confirm()`.
- Unchanged instructions are omitted from the body.
- Refusal sentences are added to `sceneRecoveryRefusals.ts`.
- `FinalVideoDownload` offers Rebuild when `pendingPauseEdits || staleScenes`.

### 10. A stub image provider for manual testing
`USE_STUB_IMAGE_PROVIDER=success|transient-failure|not-retryable-failure` registers `createStubImageProvider` as the only image provider, exactly as `USE_STUB_VIDEO_PROVIDER` and `USE_STUB_VOICE_PROVIDER` do for their stages. Without it, no image can be generated in the curl and browser checks without a paid provider key. Manual testing only, like the other stubs.

## Risks / Trade-offs

- [Paid calls the User did not intend] → An explicit inline confirmation that names the image, the clip and the rebuild.
- [Reports show more attempts for a rebuilt scene] → They are real provider calls, so counting them is correct. Time reports measure per attempt.
- [Deleting the guard rows hides the first `committed_at`] → The files and `stage_attempts` keep the history. Nothing reads `committed_at` for display.
- [An automatic rebuild that keeps failing] → It is never retried at boot, the cause is shown, and the User decides with "Rebuild final video".
- [A scene rebuilt while the session is paused] → It is accepted and held. Continue launches it, then the reassembly.

## Migration Plan

One additive migration, with no backfill:
- `ALTER TABLE scenes ADD COLUMN rebuild_count INTEGER NOT NULL DEFAULT 0`;
- `ALTER TABLE runs ADD COLUMN final_video_stale INTEGER NOT NULL DEFAULT 0`.

Rollback is reverting the commit. The extra columns are ignored by older code, and rebuilt files remain on disk unreferenced.

The PRD clarification (v1.25) ships in the same PR.

## Open Questions

None.
