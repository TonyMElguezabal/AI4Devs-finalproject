# Tasks — Generate the clip of each scene (JOS-146)

Every code change starts with a failing test (TDD), and every scenario in `specs/chunk-video-generation/spec.md` has at least one functional test. Automated tests use the stub video adapter only. Real RunningHub calls happen only in step 10, capped at one.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-146-generate-chunk-video` from `feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate: Confirm the foundations this story depends on

- [x] 1.1 Confirm JOS-145 (US-12) has landed on the base branch: chunks reach `image-complete`, `scenes.result` holds the stored image's relative path, `scenes.provider` is the image-stage binding, and the shortcut to `chunk-complete` is gone. Rebase onto it if it merged after this branch was cut — **checked 2026-09-30: NOT met.** `feature/jos-145-generate-chunk-image` (cut from `853d53d`) holds only its OpenSpec artifacts (`f7df629`); no `backend/src` change exists on it (confirmed by diff against `feature/entrega-2-JAME`: only `openspec/` and report files differ). JOS-145's own gate had stopped on JOS-144, which merged into `feature/entrega-2-JAME` on 2026-09-28 (`ea4db30`), but nobody has come back to implement JOS-145's code since. The skeleton on `feature/entrega-2-JAME` still shortcuts `image-generating → chunk-complete` directly (`backend/src/orchestrator.ts`). **Re-checked 2026-10-01 after rebasing onto `692e36f` (PR #14 merged): MET.** `markImageComplete` and `bindSceneImageProvider` are in `db.ts`, `image-complete` counts as still processing in `orchestrator.ts`, and no `image-generating → chunk-complete` shortcut remains
- [x] 1.2 Confirm JOS-147 (US-14) has landed and name its duration function and signature; confirm JOS-143's narration interval is on the base branch (JOS-147 needs it) — **checked 2026-09-30: NOT met.** No OpenSpec change exists for JOS-147 at all (`openspec list` and a repo-wide search for "US-14"/"JOS-147" outside this change find nothing); it has not started. `closestAdmittedDuration` (`backend/src/admittedDurations.ts`, JOS-140) already implements §7.2's rule and is available for JOS-147 to call, but nothing calls it for a clip request yet. JOS-143's narration interval is not on `feature/entrega-2-JAME` either (`feature/jos-143-assign-narration-intervals` is a separate, unmerged branch). **Re-checked 2026-10-01: still NOT met.** JOS-147 is now proposed as `request-admitted-clip-duration` (branch `feature/jos-147-request-admitted-clip-duration`, stacked on JOS-142 and JOS-143), but none of its code exists yet. It stores the duration on the chunk at registration (`scenes.requested_duration_seconds`, `scenes.duration_warning`) rather than exposing a function to call at launch, so design Decision 4 now reads the stored value. Neither JOS-143 nor JOS-147 is on `feature/entrega-2-JAME`
- [x] 1.3 Confirm the RunningHub values from JOS-165 in `backend/src/config/providers.ts`: endpoint `/openapi/v2/minimax/hailuo-h3/image-to-video`, `VIDEO_GENERATION_SETTING.resolution` `2K`, phase limit `video: 240`, concurrency `video: "undetermined"`; and that the `RUNNINGHUB_API_KEY` credential loads through `config/credentials.ts` — confirmed: all four values are present as named, and `loadCredential(name)` in `config/credentials.ts` is generic (not Fal.ai-specific), so `loadCredential("RUNNINGHUB_API_KEY")` works the same way JOS-145 plans to call it for Fal.ai
- [x] 1.4 Confirm the next free migration number on `feature/entrega-2-JAME` and every open feature branch (9 is taken by JOS-143); record it in design.md Decision 5 — confirmed: `feature/entrega-2-JAME` tops out at 8, `feature/jos-143-assign-narration-intervals` (unmerged) takes 9, `feature/jos-145-generate-chunk-image` has no code so no migration. **10 is the next free number**, recorded in design.md. **Re-checked 2026-10-01:** JOS-145 added no migration, `feature/jos-143-assign-narration-intervals` still takes 9, and JOS-147's proposal plans 10 (not yet in code). **11** is now this story's number, updated in design.md Decision 5
- [x] 1.5 Check whether JOS-158, JOS-148 or JOS-163 have started and whether their changes touch the same code; record any overlap in design.md — confirmed: no branch and no OpenSpec change exists for any of the three. No overlap to record
- [x] 1.6 If 1.1 or 1.2 is not met, stop, and record the blocker on JOS-146 in Linear rather than building against a stand-in — **1.1 and 1.2 are both not met, so implementation stops here.** The blocker is recorded on JOS-146, JOS-145 and JOS-147 (Linear). Groups 2 onward wait for both to land in code, not just in OpenSpec artifacts. **Re-checked 2026-10-01: 1.1 is met, 1.2 is not, so implementation still stops here.** The updated blocker (JOS-147 only, stacked on JOS-142/JOS-143) is recorded on JOS-146

## 2. Storage for the video stage (design Decision 5)

- [x] 2.1 Failing tests in `scene-registration-persistence.test.ts` / `persistence.test.ts`: the migration applies on a database at the previous version and on a fresh one; existing scenes read back with null `videoProvider` and `videoResult`; existing `provider_requests` rows read back as `stage = 'image'`; a second `scene_video_results` commit for the same scene is refused
- [x] 2.2 Add the migration: `scenes.video_provider`, `scenes.video_result`, `provider_requests.stage` (NOT NULL DEFAULT `'image'`) and the `scene_video_results` table; extend `Scene`, `rowToScene`, `insertProviderRequest` and add `commitSceneVideoResult`; make the test-only reset empty the new table
- [x] 2.3 Make the 2.1 tests pass

## 3. Provider port and adapters (design Decision 3)

- [x] 3.1 Define the typed `VideoProvider` port: `submit({ imageBytes, instruction, durationSeconds })` and `poll(requestId)` with the outcomes of Decision 3
- [x] 3.2 Build the stub adapter with these modes: success (bytes), success (temporary link), download failure, not an MP4, transient failure, not-retryable failure, pending past the phase limit, request lost after restart
- [x] 3.3 Failing tests for the RunningHub adapter against a mocked HTTP layer: the upload sends the image bytes; the submit body carries `prompt` (the `VIDEO` instruction), `duration`, `resolution: "2K"` and the uploaded `firstFrameUrl`; the `taskId` becomes the request id; the poll maps `QUEUED`/`RUNNING`, `SUCCESS` (with `results[0].url`) and `FAILED`; 4xx except 408/429 is not retryable, everything else transient; an unexpected response shape is transient
- [x] 3.4 Implement the RunningHub adapter, reading the credential only through `config/credentials.ts` and validating every response with Zod; the HTTP client's automatic retries are disabled
- [x] 3.5 Make the group 3 tests pass

## 4. Precondition and launch (design Decisions 1, 2 and 4; spec: no clip without an image, launch)

- [x] 4.1 Failing tests: a chunk in `submitted`, `image-generating`, `failed` (image stage) or `chunk-complete` sends no clip request; a chunk in `image-complete` whose image file is missing fails its video stage, not retryable, with no request; a chunk with no stored requested duration fails its video stage, not retryable, with no request
- [x] 4.2 Failing tests: committing an image result launches the clip; the chunk is `video-generating` before the adapter is called; the adapter receives the stored image's bytes, the `VIDEO` instruction exactly as registered, and the chunk's stored `requestedDurationSeconds` (JOS-147); a duplicate image delivery launches nothing a second time
- [x] 4.3 Failing tests: a paused session holds an `image-complete` chunk with no request, and continuing launches it; a chunk's clip starts while a sibling is still `video-generating`; the `video` concurrency key is used, never the `image` one, with the provisional limit of 3
- [x] 4.4 Implement `launchVideoStage`, the launch after the image commit, the `continueSession` launch of held `image-complete` chunks, and the provisional video concurrency constant
- [x] 4.5 Make the group 4 tests pass

## 5. Completion (design Decision 8; spec: a stored clip completes the chunk)

- [x] 5.1 Failing tests: a success stores `scene-<idx>.mp4` in the project folder, records its relative path in `video_result`, commits `scene_video_results`, and the chunk is `chunk-complete` with `result` (the image path) unchanged; a temporary link is downloaded before `chunk-complete` and the URL is never stored; a failed download and a file that is not an MP4 each count as one failed attempt with no clip recorded; a duplicate success delivery stores nothing twice
- [x] 5.2 Implement the completion path, with the `ftyp` check
- [x] 5.3 Make the group 5 tests pass

## 6. Failures, retries and binding (design Decisions 5, 6 and 7; spec: failures belong to the video stage, binding)

- [x] 6.1 Failing tests: the first clip attempt is attempt 1 of the video stage whatever the image stage used; a transient clip failure retries the video stage only (no image request); an exhausted budget leaves the chunk `failed` with `affectedStage: "video"` and the image path unchanged; a not-retryable clip failure skips automatic retries; an image-stage failure still reports `affectedStage: "image"`
- [x] 6.2 Failing tests: the first attempt records `video_provider` and leaves `provider` unchanged; a retry after the configured provider changes is sent to the bound one; a bound provider with no adapter fails not-retryable with no request; each attempt's `provider_requests` row carries `stage = 'video'`
- [x] 6.3 Failing tests: `POST .../retry` and `POST .../correct` on a video-stage failure answer 409 with "retrying a failed clip is not available yet" and change nothing (state, attempts, instructions, paths); on an image-stage failure they behave as before
- [x] 6.4 Implement the per-stage attempt reset, the derived `affectedStage`, the binding, and the refusal in `manualRetry` and `correctAndRetry`
- [x] 6.5 Make the group 6 tests pass

## 7. Restart and phase limit (design Decisions 3 and 9; spec: an interrupted clip resumes)

- [x] 7.1 Failing tests: on boot, a `video-generating` chunk whose request succeeded is completed; a lost request counts as one failed video attempt and follows the retry rule; a pending request keeps being polled from its persisted `sent_at`; an attempt unfinished at 240 s counts as a failed transient attempt
- [x] 7.2 Implement reconciliation and polling for the video stage through the bound adapter
- [x] 7.3 Make the group 7 tests pass

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [x] 8.1 Review tests that expect a scene to go straight from the stage to `chunk-complete`, or that assert `affectedStage: "image"` for every failure, and update each to the two-stage flow, keeping its intent; no bulk rewrite
- [x] 8.2 Review tests that count migrations, tables or `provider_requests` columns (`persistence.test.ts`, `content-lock.test.ts`) and update them for the new migration
- [x] 8.3 Review the manual-retry and correction tests: image-stage behaviour must be unchanged

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 9.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list
- [ ] 9.2 Run the targeted tests (adapter, launch, completion, failures, reconciliation, persistence)
- [ ] 9.3 Run `npm run typecheck` and the full `npm test`
- [ ] 9.4 Verify the post-test state matches the baseline; restore it if not
- [ ] 9.5 Write `openspec/changes/generate-chunk-video/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md`
- [ ] 9.6 Mark this step complete only after the tests pass and the report exists

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Start the real server on a scratch database and scratch projects folder, and confirm `GET /health` responds
- [ ] 10.2 With the stub adapter: create a session, bring one chunk to `image-complete`, and follow it with `curl GET /sessions/:id` through `video-generating` to `chunk-complete`; confirm the clip file is in the project folder and `result` still points to the image
- [ ] 10.3 With the stub adapter: force a clip failure until the budget is exhausted; confirm `affectedStage: "video"`, then `POST .../retry` and `POST .../correct` answer 409 and change nothing
- [ ] 10.4 One real RunningHub call (about $0.60): a chunk with a real stored image goes to `chunk-complete`; record the cost, the time, and the stored file's size and `ftyp` check. Skip and record why if the credential or quota is missing
- [ ] 10.5 `curl GET /docs/json` and confirm no request schema gained a field
- [ ] 10.6 Clean up through the test-only reset; confirm the scratch store is empty with all triggers, and the default store untouched
- [ ] 10.7 Save `reports/YYYY-MM-DD-step-10-manual-endpoint-testing.md` with every command and response

## 11. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 Decide applicability: no screen changes. Check that a chunk shown in the UI moves through `video-generating` to `chunk-complete`, and that a clip failure shows the video stage, or record why not
- [ ] 11.2 Save `reports/YYYY-MM-DD-step-11-e2e.md`

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 `docs/data-model.md`: the two `scenes` columns, `provider_requests.stage`, `scene_video_results`, the migration, the per-stage `attempts`, and the derived `affectedStage`
- [ ] 12.2 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only changes are descriptions (states, `affectedStage`, the 409 reasons)
- [ ] 12.3 `docs/backend-standards.md`: the `VideoProvider` port and its submit-and-poll shape, the per-stage concurrency key and provisional cap, per-stage attempts, and the clip-retry refusal until JOS-158
- [ ] 12.4 `docs/PRD.md`: check §7.1, §7.2, §8.2 and §11.2 need no wording change; record in the change log only if something changes

## 13. Close out

- [ ] 13.1 Comment on JOS-158, JOS-148, JOS-149 and JOS-163: where the clip, its binding and its per-stage attempts live, and that manual clip retry is refused until JOS-158
- [ ] 13.2 Comment on JOS-150: a session with every chunk `chunk-complete` still derives to `final-video` with no final MP4 (design Risks)
- [ ] 13.3 Open the PR against `feature/entrega-2-JAME`, linking to JOS-146
- [ ] 13.4 Get a review from at least one human
- [ ] 13.5 Archive the OpenSpec change after merge
