## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-235-rebuild-scene` exists from `origin/feature/entrega-3-JAME` (at `3124559c`, PR #135 merged) with no upstream, in the worktree `../AI4Devs-jos-235` (checked by `/opsx:propose`)
- [x] 0.2 `git fetch`; confirm it is the current branch of that worktree, still has no upstream, and `origin/feature/entrega-3-JAME` has not moved past its base (merge it in if it has); run `npm ci` in `backend/` and `frontend/`

## 1. Gate

- [x] 1.1 Confirm design.md § Context still holds:
  - `scene_results` and `scene_video_results` are keyed by `scene_id`;
  - the image file is `scene-N-attempt-A.ext` and the clip is `scene-N.mp4`, both written with `writeArtefactOnce`;
  - `triggerAssemblyIfReady` is the only automatic assembly trigger after a clip commit;
  - `runVideoAttempt` has no `await` between its `image-complete` re-read and `markVideoGenerating` (with `videoStageStartDelayMs` 0);
  - `rebuildFinalVideo` does not check the gate;
  - the boot settle clears an interrupted rebuild's request.

## 2. Backend: migration and the rebuild transition (TDD; design Decisions 1, 5)

- [x] 2.1 Write failing tests for `markSceneForRebuild`:
  - accepted from `image-complete` and `chunk-complete`; refused (returns false, nothing changes) from `submitted`, `image-generating`, `video-generating`, `failed`, and for a scene of another session;
  - on success: status `submitted`; results, attempts, request fields and error cleared; `rebuild_count` incremented; the given instructions stored and omitted ones kept; guard rows deleted; providers, requested duration and narration interval unchanged;
  - `final_video_stale` set only when the session has a final video;
  - a corrected instruction is recorded like a correction; a skeleton scene's `imageInstruction` goes to the legacy `instruction`.
- [x] 2.2 Add the migration (`scenes.rebuild_count`, `runs.final_video_stale`), `Run.finalVideoStale`, `Scene.rebuildCount` and `markSceneForRebuild` in `db.ts`. Make 2.1 pass.

## 3. Backend: versioned files and URLs (TDD; design Decisions 3, 4)

- [x] 3.1 Write failing tests:
  - a scene with `rebuild_count` 1 writes `scene-N-r1-attempt-1.<ext>` and `scene-N-r1.mp4`;
  - `rebuild_count` 0 keeps today's names;
  - the snapshot's image and clip URLs carry `?r=1` only when `rebuild_count` > 0;
  - the image route still serves `/image?r=1`.
- [x] 3.2 Add `sceneFileStem` and use it in the image and clip writes; add the query to the snapshot URLs. Make 3.1 pass.

## 4. Backend: the command and route (TDD; design Decision 2)

- [x] 4.1 Write failing tests for `rebuildScene` and the route:
  - responses: 202; 404 `unknown-scene` (unknown session, unknown scene, cross-session); 409 `scene-not-ready`; 409 `assembly-in-progress` (attempt in flight, or rebuild requested); 400 for an empty or whitespace instruction;
  - an accepted rebuild launches the image stage on the bound provider even after the active provider changed, then the clip;
  - a held launch when paused;
  - two back-to-back calls: 202 then 409.
- [x] 4.2 Add `backend/src/sceneRebuild.ts` and `POST /sessions/:sessionId/scenes/:sceneId/rebuild` with Zod schemas. Make 4.1 pass.

## 5. Backend: automatic reassembly and the final-video rebuild rules (TDD; design Decisions 6, 7, 8)

- [x] 5.1 Write failing orchestrator tests with stub providers and the stub assembly tool:
  - a session in `final-video`: rebuilding scene 2 leads, after it completes, to one rebuild assembly that writes `final-video-2.mp4` with scene 2's new clip, clears `final_video_stale`, and leaves the other scenes' clip paths unchanged;
  - two scenes rebuilt: one assembly, after the second completes;
  - a session failed at assembly: the assembly runs again by itself and the session ends `final-video`;
  - a session still processing: only the normal first assembly;
  - an automatic rebuild that fails: version 1 stays current, `staleScenes` stays true, and `POST …/final-video/rebuild` is then accepted with no pause edits;
  - `POST …/final-video/rebuild` with pending pause edits while a scene is `image-generating`: 409 `scenes-not-complete`, with no assembly;
  - a restart with a stale final video and complete scenes: nothing relaunches, and `staleScenes` is true.
- [x] 5.2 Change `triggerAssemblyIfReady`, the rebuild success branch of `runAssemblyAttempt` (clear the flag), `rebuildFinalVideo` (gate, staleness) and `finalVideoStatus` (`staleScenes`); extend the types and the response schema. Make 5.1 pass.

## 6. Frontend: Rebuild scene and the stale final video (TDD; design Decision 9)

- [x] 6.1 Write failing tests:
  - `sceneActions` gives `rebuild` for `image-complete` and `chunk-complete`, but not while the session is `final-video-generating` and not for other states;
  - `SceneRow` opens the inline form with `IMAGE` and `VIDEO` prefilled and the confirmation sentence, sends only the edited fields, and shows refusals as sentences;
  - `FinalVideoDownload` offers Rebuild when `staleScenes` is true.
- [x] 6.2 Add `rebuildScene` to `api/client.ts`; extend `sceneActions.ts`, `SceneRow.tsx`, `SessionPage.tsx` (pass the session state and the handler), `sceneRecoveryRefusals.ts`, `FinalVideoDownload.tsx` and `types.ts`; add CSS only if needed. Make 6.1 pass.

- [x] 6.1a Write a failing test: with a rebuilt scene still generating, the page does not offer Rebuild final video, and offers it again once every scene is complete; `scenes-not-complete` has a refusal sentence
- [x] 6.2a Pass the final-video rebuild handler from `SessionPage` only while every scene is `chunk-complete`; add the sentence in `pauseRefusals.ts`. Make 6.1a pass.
- [x] 6.2b Let the scene details grid shrink to the card at 375 px (`minmax(min(17rem, 100%), 1fr)` in `frontend/src/styles/app.css`); verified in the browser (group 10), as jsdom has no layout

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review tests that assert `nothing-to-rebuild`, the final-video status shape, scene image URLs, file names, or `sceneActions` output. Update a test only where this change intends the new behaviour, and record each change in the report.

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline (the worktree has no local database; every run uses scratch `DB_PATH` and `PROJECTS_ROOT`)
- [x] 8.2 Run the targeted tests from groups 2-6
- [x] 8.3 Run the full backend suite (scratch paths), the full frontend suite, `npm run lint` and the type checks in both packages
- [x] 8.4 Verify the post-test state matches the baseline and restore if needed
- [x] 8.5 Create report `openspec/changes/rebuild-scene/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [x] 8.6 Mark this group complete only after tests pass and the report exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.0 Add the manual-testing flag `USE_STUB_IMAGE_PROVIDER` in `backend/src/bootstrap.ts` (design Decision 10) and list it with the other stub flags in `readme.md`, `backend/README.md` and `docs/development_guide.md`
- [x] 9.1 Start the backend on scratch paths with `USE_STUB_IMAGE_PROVIDER`, `USE_STUB_VIDEO_PROVIDER` and `USE_STUB_ASSEMBLY_TOOL` set (short delays), and bring a session to `final-video`
- [x] 9.2 `POST …/scenes/{id}/rebuild` with an edited `imageInstruction`: 202. Follow `GET /sessions/{id}` until the scene is `chunk-complete` and the final video is `final-video-2.mp4`. List the project folder to show the old and new files.
- [x] 9.3 Refusals: a rebuild while a scene is generating (409 `scene-not-ready`), during the assembly (409 `assembly-in-progress`), on another session's scene (404), and with an empty instruction (400). Also `final-video/rebuild` while a scene rebuilds (409 `scenes-not-complete`).
- [x] 9.4 A session failed at assembly (stub assembly failing, then succeeding): rebuild a scene and see the assembly run again by itself
- [x] 9.5 Document commands and responses in `reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`; remove the scratch data

## 10. E2E Testing in the Browser (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Open the session, expand a complete scene, open Rebuild scene, edit `IMAGE`, confirm. Check the scene's state updates live, the new image appears (not the cached one), and the final video becomes version 2 by itself.
- [x] 10.2 Check the action is absent on a generating scene and while the final video is assembling; check a refusal sentence
- [x] 10.3 Screenshot at 375 px width of the open Rebuild form; restore the environment and record in `reports/YYYY-MM-DD-step-10-e2e-testing.md`

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 `docs/PRD.md` v1.25 (Spanish): §10.3 row "Defecto visto por el Usuario en una escena generada", the §2.3 note, the AC table and the changelog row (product owner, JOS-235, 2026-10-28)
- [x] 11.2 `docs/api-spec.yml`: the new route (body, 202/400/404/409 reasons), `scenes-not-complete` and the `nothing-to-rebuild` wording on the final-video rebuild, `finalVideo.staleScenes`, the URL query note, and a JOS-235 changelog line
- [x] 11.3 `docs/data-model.md`: `scenes.rebuild_count`, `runs.final_video_stale`, the versioned file names, and the guard rows cleared by a rebuild
- [x] 11.4 `readme.md` (Spanish): one line in the usage or troubleshooting section on Rebuild scene
- [x] 11.5 Run `graphify update .`
- [x] 11.6 Commit, then push and open the PR into `feature/entrega-3-JAME` linking JOS-235 (on the user's go-ahead)
