## Context

After JOS-171 and JOS-218:

- Every stage instance binds once, at its first attempt, to the provider `activeProviderId(stage)` returns, and keeps it for its automatic and manual retries. Where the binding lives: `runs.voice_provider_id` (voice), `runs.alignment_provider_id` (alignment, bound only when the alignment provider is actually called; native timestamps bind nothing), `runs.decomposition_provider_id` (reasoning), `scenes.provider` (image) and `scenes.video_provider` (video). Assembly has no provider.
- A session-level failure (`runs.failure`, with `phase` `voice-over` or `decomposition` and `manualRetryAvailable`) is retried by `retryVoiceOver` and `retryDecomposition`, which call `startNewCycle`. `startNewCycle` records the first attempt of the new cycle with **the provider of the latest attempt** (`stageAttemptRecorder.ts`), and the attempt senders use `attempt.providerId`. The decomposition retry picks the failed step from the store: the alignment step (`timestamps`) while no narration timestamps are stored, else the reasoning step (`decomposition`).
- A failed scene is `status = 'failed'`; its failed stage is image when `result` is null and video when an image result is stored and `video_result` is null. `manualRetry` (orchestrator) retries it through `launchSceneStage` or `launchVideoStage`, which read `scenes.provider` / `scenes.video_provider`.
- A chunk's `requested_duration_seconds`, `duration_warning`, `speed_factor` and `speed_factor_warning` are refused by store triggers (`scenes_<column>_locked`), created from `SCENE_DURATION_REQUEST_LOCK_TRIGGERS_DDL` and `SCENE_SPEED_FACTOR_LOCK_TRIGGERS_DDL`. `resetAll` is the one place the delete locks are lifted, inside a single transaction.
- Registration computes the four values from the chunk's narration interval, the admitted durations and `SPEED_FACTOR_LIMIT` (`requestedClipDuration`, `sceneRegistration.ts`). Since JOS-218 the admitted durations are the active video provider's (`activeVideoDurations()`).
- `/admin` is the child plugin behind `registerAdminGate`; `providerProfiles.ts`, `profileProblems` and the registry labels give a provider's display name and whether it is usable.

Product owner decisions (2026-09-15 clarification session, ticket US-36): the move is an explicit Administrator action on `/admin`; completed results are kept; a moved video stage re-chooses its duration from the new provider's admitted durations while the chunk and its interval stay unchanged.

## Goals / Non-Goals

**Goals:**

- The Administrator sees the failed stages that sit on a provider other than the active one, and moves one to the active provider.
- The retry that follows uses the new provider, for every stage kind.
- A moved clip asks for a duration the new provider admits, with its speed factor and warnings derived again from the unchanged interval.
- Nothing already produced is regenerated, and nothing moves by itself.

**Non-Goals:**

- Retrying the stage from `/admin`. The User retries with the existing controls (open question).
- Moving a stage that did not fail, a stage already on the active provider, or assembly (no provider).
- Moving a session-level failure that offers no manual retry (Decision 3).
- Any automatic switch, and detecting that a provider is "unavailable": a failed stage on a non-active provider is listed whatever the cause.
- A history of moves (the earlier attempts keep the provider they ran on; open question).

## Decisions

### Decision 1 — A move rebinds to the provider that is active now

A move sets the stage instance's binding to `activeProviderId(stage)` at that moment, not to "unbound". Rebinding explicitly keeps "move to the current active provider" exact: if the Administrator changes the active provider again between the move and the retry, the retry still goes where the move put it. The move writes the binding and nothing else (except the clip values of Decision 4); it sends no request and starts no attempt.

Guards, all in one transaction with conditional updates, so a stale page or a race changes nothing:

- the stage is still failed (session failure present with its phase, or the scene is `failed`), and no retry is scheduled or in flight for it;
- its binding still equals the one the page listed (`WHERE … = <bound>`), and differs from the active provider;
- the active provider's profile is usable (`profileProblems` empty), otherwise the move would only trade one failure for another.

**Alternative:** unbind and let the next first attempt bind to whatever is active then. Rejected: it makes the outcome depend on later changes and would reuse the first-attempt branch (`isFirstAttempt`) with attempt counters it was not written for.

### Decision 2 — Which failed stages are listed, and where each binding lives

One finder (`failedStages.ts`) reads the store and returns the stage instances to list:

| Stage | Failed when | Binding read and rewritten |
|---|---|---|
| voice | session failed in phase `voice-over` and its failure offers a manual retry | `runs.voice_provider_id` |
| alignment | session failed in phase `decomposition`, no narration timestamps stored, no scenes, manual retry offered | `runs.alignment_provider_id` (not bound → not listed: native timestamps call no provider) |
| reasoning | session failed in phase `decomposition`, narration timestamps stored, no scenes, manual retry offered | `runs.decomposition_provider_id` |
| image | scene `failed`, no image result | `scenes.provider` |
| video | scene `failed`, image result stored, no clip result | `scenes.video_provider` |

A stage is listed only when its binding is set and, after resolving a legacy alias (`resolveProfileId`), differs from the active provider's id. The row carries the session id and title, the stage, the scene id and its number for image and video, the bound and the active provider ids and display names, and the failure's cause as the page already shows it.

### Decision 3 — A failure with no manual retry is not listed

A session-level failure with `manualRetryAvailable = false` (a not-retryable cause, such as a rejected input) has no retry in the product: `startNewCycle` refuses it. Moving it would change a binding that nothing can use. Such a stage is neither listed nor movable (`not-retryable`). Scenes always have a manual retry, so every failed scene is eligible. Allowing a move to reopen a retry for a not-retryable session failure would change the retry policy (JOS-154) and is an open question.

### Decision 4 — A clip's duration is chosen again, in one transaction that lifts the locks

Moving a video stage replaces `requested_duration_seconds`, `duration_warning`, `speed_factor` and `speed_factor_warning` with the values `requestedClipDuration(interval, activeVideoDurations().durations)` and `SPEED_FACTOR_LIMIT` give for the chunk's stored narration interval, as registration computed them. The interval, the chunk, its instructions and its image are untouched.

The store keeps refusing every other update. A single function in `db.ts` (`rebindFailedClip`) is the only code allowed to change those four columns: in one transaction it drops the four lock triggers, updates the row, recreates them from the same DDL constants, and commits (SQLite DDL is transactional, so a failure rolls the triggers back too). It updates only a scene that is `failed`, has an image result and no clip result, and whose `video_provider` still equals the expected one. A test pins that no other source file lifts these triggers.

**Alternative:** migrate the triggers to read an "unlock" flag. Rejected: an applied migration's behaviour is never edited, and a flag is a second way to bypass a lock.

### Decision 5 — A manual retry takes the stage's binding

`startNewCycle` records the new cycle's first attempt with the provider of the stage instance's current binding when it has one, else the latest attempt's provider (today's behaviour). For the alignment step, a latest attempt recorded as `elevenlabs-native` keeps that provider (the native path binds nothing). Automatic retries inside a cycle still copy the previous attempt's provider, which already equals the binding. Without this change, a moved session-level stage would retry on the provider it failed on, because the new attempt copies the old attempt.

The scene stages need no change: `launchSceneStage` and `launchVideoStage` already read the scene's binding. Because a move leaves the clip with a non-null `video_provider`, the video stage's "before binding" duration check of JOS-218 does not run for it; the duration was chosen from the new provider's range at the move.

### Decision 6 — API

Both routes live in the `/admin` child plugin, so the Administrator gate answers 401 before any body is parsed. The surface test lists `admin/failed-stages` among the deliberate app-level routes (a `POST`, so the "no PUT, PATCH or DELETE" guard is untouched).

- **`GET /admin/failed-stages`** → `{ failedStages: [{ sessionId, sessionTitle, stage, sceneId, sceneNumber, boundProviderId, boundProviderLabel, activeProviderId, activeProviderLabel, cause }] }`; `sceneId` and `sceneNumber` are null for session-level stages.
- **`POST /admin/failed-stages/move`** with `{ sessionId, stage, sceneId? }`: `stage` is the enum of the five stages; `sceneId` is required for image and video and refused otherwise (400, the validation error). `200 { moved: { sessionId, stage, sceneId, providerId, providerLabel, requestedDurationSeconds } }` (the last only for video, else null); `404 { ok: false, reason: "not-found" }` for an unknown session or scene; `409 { ok: false, reason }` with `not-failed`, `already-on-active`, `retry-in-progress`, `not-retryable` or `not-usable`.

### Decision 7 — `/admin` section "Failed stages"

Below "Providers": a list of the rows with the session title, the stage (and "scene N"), "bound to {label}, active provider {label}", the cause, and a button "Move {stage} of {session} to {active label}" (with "scene N" for scenes). A successful move shows "Moved. Retry it from the session page." with a link to `/?sessionId=…`, and the list reloads; a 409 shows its reason in words and reloads (the stage may no longer be failed). An empty list says "No failed stage is on a provider other than the active one." A 401 locks the page again.

## Risks / Trade-offs

- **A second code path changes locked values.** → One function, one transaction, a test that no other file lifts the triggers, and the unchanged refusal of every other update.
- **The cause shown may not be about the provider** (a bad script, a content-policy refusal). → The list does not claim the provider is at fault; it lists failed stages on a non-active provider and the Administrator decides.
- **A clip re-chosen under a shorter range gets a larger speed factor and may warn.** → Registration's own rules and warnings apply; the factor warning shows as it does for any chunk.
- **Moving is silent in the history.** → The earlier attempts keep their provider, and the new attempts record the new one; a separate move log is deferred.
- **Racing a retry that was just launched.** → The conditional updates and the "no pending attempt" guard make the move refuse with `retry-in-progress` or `not-failed`.

## Migration Plan

No schema change and no data migration. Existing bindings, attempts and chunks are untouched until an Administrator moves a stage. Rollback by reverting the code: nothing stored depends on it.

## Open Questions

- Should the move also start the retry (one click for the Administrator)? Not required by the acceptance criteria; the User keeps the retry controls.
- Should a move reopen a manual retry for a session-level failure that is not retryable?
- Should moves be logged (who, when, from and to) for diagnostics?
