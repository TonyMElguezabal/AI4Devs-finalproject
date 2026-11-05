## Context

The project panel (`SessionPage.tsx`, `aside.project-panel`) shows title, language, start time, the script, the session status (`SessionHeader`) and a `Scenes done` progress bar computed inline as `scenes.filter(state === "chunk-complete").length`. Every scene's `state`, `index` and `affectedStage` already reach the page in each snapshot, through the session read and the live SSE stream (`useLiveSession`).

The scene states and what they mean in the run (verified in `backend/src/orchestrator.ts`):
- `submitted`: waiting for an image slot or held.
- `image-generating`: an image request holds one of the image stage's slots.
- `image-complete`: the image is stored and the scene waits for a video slot. `launchVideoStage` acquires the slot and only then does `runVideoAttempt` call `markVideoGenerating`, so `image-complete` is exactly "waiting for a clip slot". An automatic clip retry also returns the scene here (`markSceneVideoRetry`), and so does a held scene of a paused session.
- `video-generating`: a clip attempt holds a video slot (from the submit's start delay until the task finishes).
- `chunk-complete`, `failed` (with `affectedStage` `image` or `video`).

## Goals / Non-Goals

**Goals:**
- One glance at the panel answers: how many scenes are done, waiting, generating an image, waiting for a clip, generating a clip, failed, and how many images and clips are left.
- The scene numbers of in-progress and failed scenes are visible without opening cards.

**Non-Goals:**
- Backend, API or data-model changes.
- Slot usage across sessions (the video stage's slots are shared by every session).
- A session-level time estimate (JOS-200 covers per-clip estimates, JOS-233 the clip task's liveness).
- Interaction: the summary has no filters or links to cards.

## Decisions

### 1. Derive in the frontend, in a pure module
`frontend/src/sceneProgress.ts` exports `summariseSceneProgress(scenes)` and `formatSceneNumbers(indexes)`. The component only renders what the helper returns.
- Why: all inputs are already on the page and update live. A backend `phases`-like aggregate would duplicate state the snapshot already carries, add a contract field and a migration of the API spec for no new information.
- Alternative considered: a `sceneSummary` field in the session read, beside `phases`. Rejected for the reason above. `docs/frontend-standards.md` forbids re-deriving `held` and `running` in components. This is a count of states the page already shows, like today's inline `scenesDone`, and it lives in a module, not a component.

### 2. A new capability, not a delta of `session-phase-progress`
`session-phase-progress` specifies the backend's `phases` representation. The summary is a presentation of scene states, so it gets its own `scene-progress-summary` spec.

### 3. Scene numbers as compressed ranges
The image stage can run up to 200 requests at once, so "Generating image" can list dozens of scenes. Consecutive numbers collapse into `a–b` (en dash). Sorted ascending, so out-of-order snapshot input still reads in order.
- Alternative considered: truncating after N numbers with "+k more". Rejected because ranges stay complete and short for the common case of a contiguous run.

### 4. Markup: a description list, no live region
A `<dl>` with the labels as `<dt>` and "count · numbers" as `<dd>`, under the existing `<progress>`, which stays as is (its accessible name `Scenes done` and its "N of total" text are pinned by existing tests). No `aria-live`: the summary changes on every scene update and would flood a screen reader. No `role="alert"`: the panel reserves alerts for failures elsewhere.

### 5. Labels reuse the card wording
"Queued", "Generating image", "Image ready", "Generating clip" come from `SCENE_STATE_LABEL`. The summary adds only qualifiers that the cards don't need: "for image", "waiting for a clip slot", "at image" / "at clip", "Images left", "Clips left".

## Risks / Trade-offs

- [Image ready also counts clips waiting out a retry delay or held by a pause] → the label says "waiting for a clip slot", which stays true in all three cases. The pause marker already explains a held session.
- [A skeleton scene (no decomposition, test-only) never gets a clip but counts in Clips left] → skeleton scenes don't occur in real runs, so accepted.
- [Long sessions make the `dd` wrap] → ranges keep it short. The CSS lets the numbers wrap inside the panel, with no horizontal scroll at 375px.

## Migration Plan

Frontend-only and additive. Ships with the next build. Rollback is reverting the commit.

## Open Questions

None.
