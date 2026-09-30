# Tasks — Generate the image of each scene (JOS-145)

Tests come first throughout: each behaviour gets a failing test before the code that makes it pass, and every scenario in `specs/chunk-image-generation/spec.md` has at least one functional test. Automated tests use the stub image adapter only. Real Fal.ai calls happen only in step 9, capped at one.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-145-generate-chunk-image` from `feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`) — cut from `853d53d`, with the restored proposal artifacts
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate: Confirm the foundations this story depends on

- [x] 1.1 Confirm JOS-144 (US-11) has landed and chunks carry a distinct, non-empty `IMAGE` instruction, not the skeleton's conflated `instruction` field — **re-checked 2026-09-30, after rebasing onto `origin/feature/entrega-2-JAME`: MET.** JOS-144 merged 2026-09-28 (`ea4db30`). `Scene.imageInstruction` and `Scene.videoInstruction` are distinct fields (`backend/src/types.ts:149,151`), backed by `scenes.image_instruction` / `scenes.video_instruction` (migration in `db.ts`, `rowToScene`, `insertRegisteredScenes`). The old conflated `instruction` field still exists (kept for the image stage's current input and for correction, per JOS-144 Decision 3) but a distinct `imageInstruction` is now available for this story to read instead
- [x] 1.2 Confirm the Fal.ai values from JOS-165 in `backend/src/config/providers.ts`: model `fal-ai/flux/dev`, request size 1920×1088, phase limit 25 s, concurrency 200 — confirmed: `IMAGE_PROVIDER` (`Fal.ai`, `fal-ai/flux/dev`), `IMAGE_GENERATION_SIZE` `{ width: 1920, height: 1088 }`, phase limit `image: 25`, concurrency `image: 200` (provisional)
- [x] 1.3 Locate the retry (JOS-184/JOS-154), time-limit (JOS-185) and concurrency (`concurrency.ts`, JOS-167) mechanisms to call. Record which are already in the codebase and which are still the skeleton versions — found: the concurrency gate (`backend/src/concurrency.ts`, used by `launchScene`) and the retry budget (`RETRY_BUDGET` in `orchestrator.ts`) exist only as the skeleton's versions; `bounded-retry-policy` (0/74) and `stage-execution-time-limit` (0/56) have not started, so this story calls the skeleton versions and does not re-implement the real ones
- [x] 1.4 If 1.1 is not met, stop and record the blocker on JOS-145 rather than building against the conflated field — 1.1 is not met, so implementation stops here: the blocker is recorded on JOS-145 and on JOS-144 (Linear). Groups 2 onward wait for JOS-144

## 2. Output check (TDD) — AC2, design Decision 1

- [x] 2.1 Write failing unit tests for `isAcceptedImageSize(width, height)`: 1920×1088 accepted, 1920×1080 accepted, 2560×1440 accepted, 1024×576 rejected, 1080×1920 rejected, 1920×1200 (16:10) rejected
- [x] 2.2 Write failing tests that read dimensions from a stored PNG and a stored JPEG file header, not from provider metadata
- [x] 2.3 Implement the check and the header reader, fully typed — `backend/src/imageOutputCheck.ts`: `isAcceptedImageSize`, `readImageDimensions` (PNG IHDR / JPEG SOF0-SOF15 walk), `readImageDimensionsFromFile`
- [x] 2.4 Run the group 2 tests and confirm they pass — 10/10 passed, `npm run typecheck` clean

## 3. Provider port and adapters (TDD)

- [x] 3.1 Define the typed `ImageProvider` port: `generate(instruction)` returns either image bytes or a temporary URL, or a classified failure (transient / not retryable) — `backend/src/imageProvider.ts`: `GeneratedImage`, `ImageGenerationResult`, `ImageProvider`
- [x] 3.2 Extend the stub adapter with these modes: success (bytes), success (temporary link), download failure, under-size image, portrait image, transient failure, not-retryable failure — `createStubImageProvider` with 4 modes (`success-bytes`, `success-temporary-url`, `transient-failure`, `not-retryable-failure`); "under-size image", "portrait image" and "download failure" are exercised by configuring what bytes/URL a success mode returns and how the orchestrator's own download step behaves (groups 4-6), not by separate adapter modes
- [x] 3.3 Write failing tests for the Fal.ai adapter against a mocked HTTP layer: request body carries the instruction and `{width: 1920, height: 1088}`, the HTTP client's automatic retries are disabled, and failure classification follows JOS-165 (content rejections are transient, per ADR 0005 Decision 5) — `backend/test/image-provider.test.ts`, 19 tests
- [x] 3.4 Implement the Fal.ai adapter, reading the credential only from the local environment or the local secrets file (`config/credentials.ts`) — `createFalAiImageProvider`, credential name `FAL_API_KEY`, `Authorization: Key <key>`
- [x] 3.5 Validate the provider response shape with Zod before use — `falResponseSchema`
- [x] 3.6 Run the group 3 tests and confirm they pass — 19/19 passed, `npm run typecheck` clean

## 4. Launch and completion (TDD) — AC1, AC2, §12.2

- [x] 4.0 Write a failing test: `segmentStoredTimestamps`'s successful registration launches image generation for every newly-registered chunk, with no further action (AC1) — `getSubmittedScenes()` (`db.ts`) is currently dead code, and nothing today calls `launchScene` after registration — `test/decomposition-phase.test.ts`
- [x] 4.1 Write a failing test: a `submitted` chunk with an `IMAGE` instruction launches without User action, and is `image-generating` before the adapter is called — `test/image-stage.test.ts`
- [x] 4.2 Write a failing test: the adapter receives the chunk's `IMAGE` instruction
- [x] 4.3 Write a failing test: a paused session sends no request and the chunk stays `submitted`
- [x] 4.4 Write a failing test: an accepted image is stored under the session's `project_folder`, `result` holds the relative path, and the state is `image-complete`, never `chunk-complete`
- [x] 4.5 Write a failing test: a temporary-link result is downloaded to a local file before `image-complete`, and `result` is never the link
- [x] 4.6 Write a failing test: a download failure is recorded as a failed attempt and the chunk does not reach `image-complete`
- [x] 4.7 Write a failing test: an under-size or portrait image is recorded as a failed attempt and the chunk does not reach `image-complete`
- [x] 4.8 Write a failing test: a duplicate success delivery leaves exactly one `scene_results` row and the state unchanged
- [x] 4.9 Write a failing test: a session whose chunks are all `image-complete` derives to `chunks-processing`, not `final-video` (design Decision 4)
- [x] 4.10 Write a failing test (design Decision 6): a scene left `image-generating` on boot is reconciled as one failed transient attempt ("interrupted by restart"), with the retry rule applied, never left polling
- [x] 4.11 Implement `launchImageStage` (design Decision 6: a synchronous `await` of the adapter resolved from the Decision 7 registry, no `provider.send`/poll), replacing the `image-generating → chunk-complete` shortcut and wiring in the adapter, the output check and the file write; update `reconcileOnBoot` for `image-generating` scenes; wire `segmentStoredTimestamps` (`decompositionPhase.ts`) to launch every newly-registered chunk on a successful registration (task 4.0) — also required renaming `markSceneComplete` to `markImageComplete` (its production caller, `applyOutcome`'s generic-stub success path, now shares the same `image-complete` terminus, per Decision 4), adding `bindSceneImageProvider`, and updating `continueSession` to route a real held chunk (non-empty `imageInstruction`) through `launchImageStage` instead of `launchScene`
- [x] 4.12 Publish each state change on the live-update channel using the existing `SceneEventPayload` shape — every branch of `runImageAttempt` calls `broadcast`
- [x] 4.13 Run the group 4 tests and confirm they pass — `test/image-stage.test.ts` 16/16, `test/decomposition-phase.test.ts` 22/22 (1 new), full suite 615 passed / 2 skipped, `npm run typecheck` clean

## 5. Independent progression (TDD) — AC3, design Decision 5

- [ ] 5.1 Write a failing test: two chunks `image-generating`, the first succeeds, the first is `image-complete` while the second is still `image-generating`
- [ ] 5.2 Write a failing test: the first chunk's stage reaches `failed`, and the second chunk still reaches `image-complete`
- [ ] 5.3 Write a failing test: two sessions with a chunk of the same identifier, and a result updates only its own session's chunk and folder
- [ ] 5.4 Fix any cross-chunk barrier the tests expose
- [ ] 5.5 Run the group 5 tests and confirm they pass

## 6. Provider binding (TDD) — AC4, design Decision 3

- [ ] 6.1 Write a failing test: the first attempt writes the image provider identifier to `scenes.provider` before the request is sent
- [ ] 6.2 Write a failing test: a later attempt does not overwrite an already-bound `scenes.provider`
- [ ] 6.3 Write a failing test: with the stage bound to provider A and the configuration changed to B, a retry is sent to A
- [ ] 6.4 Write a failing test: a stage bound to a provider with no adapter in the running build fails its attempt as not retryable, and no other adapter is called
- [ ] 6.5 Implement adapter resolution from the bound identifier through a typed registry
- [ ] 6.6 Run the group 6 tests and confirm they pass

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Update `orchestrator.test.ts`, `persistence.test.ts` and `session-*.test.ts` assertions that expect `chunk-complete` or `final-video` from the skeleton's single stage
- [ ] 7.2 Update tests that rely on `STUB_PROVIDER_NAME` as the recorded provider, so they use the bound image provider identifier
- [ ] 7.3 Confirm every scenario in `specs/chunk-image-generation/spec.md` has at least one functional test, and list the mapping in the step 8 report
- [ ] 7.4 Confirm module test coverage has not decreased (`npm test -- --coverage` from `backend/`)
- [ ] 7.5 Run `npm run typecheck` with no errors

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test state: row counts of `runs`, `scenes`, `provider_requests`, `scene_results`, and the file list of `backend/data/`
- [ ] 8.2 Run the targeted tests for the image stage and capture the pass/fail summary
- [ ] 8.3 Run the full suite (`npm test` in `backend/`) and record totals, failures and runtime. The default test store (`backend/data/skeleton.sqlite`) is shared by every branch and keeps the migrations and triggers of newer ones, so run against a scratch database (`DB_PATH` and `PROJECTS_ROOT` pointed at a temporary folder) if it fails on something unrelated
- [ ] 8.4 Verify the post-test state matches the baseline. Restore the store and remove leftover test images if it does not
- [ ] 8.5 Write the report `openspec/changes/generate-chunk-image/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [ ] 8.6 Mark this step complete only after the tests pass and the report exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the backend with the stub image adapter and confirm it responds
- [ ] 9.2 POST a session through decomposition, then GET it repeatedly: chunks go `submitted → image-generating → image-complete`, each `result` points to a file that exists on disk, and each `provider` is set
- [ ] 9.3 With per-chunk stub latencies that differ, verify one chunk shows `image-complete` while another still shows `image-generating`
- [ ] 9.4 With the stub returning a temporary link, verify on disk that the file exists and `result` is not a URL
- [ ] 9.5 With the stub returning a portrait image, verify the attempt is recorded as failed and the chunk does not reach `image-complete`
- [ ] 9.6 Run one real Fal.ai generation (credential from the local secrets file). Verify the stored file is 1920×1088 and passes the check, and record the cost
- [ ] 9.7 Delete the sessions and files created above and confirm the store and disk match the pre-test state
- [ ] 9.8 Save the transcript as `openspec/changes/generate-chunk-image/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: the session page renders per-scene status from the snapshot and live events, so check that `image-complete` shows up without reloading
- [ ] 10.2 Start the backend (stub adapter) and the frontend
- [ ] 10.3 Start a project and assert each scene's status changes to the image-complete label as it finishes, independently of the others, with no page reload
- [ ] 10.4 Restore the environment and save `openspec/changes/generate-chunk-image/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/data-model.md`: `scenes.provider` as the image-stage binding written on the first attempt, `result` as the relative image path, and `image-complete` now produced
- [ ] 11.2 `docs/api-spec.yml`: the scene `status` enum includes `image-complete`, and `provider`/`result` semantics are described. The file is generated, never hand-edited: put any new descriptions in the Zod schemas in `backend/src/routes.ts` and regenerate it from `GET /docs/json` of a running server (the `info` block now comes from `backend/src/server.ts`), then review the diff for drift and check it matches
- [ ] 11.3 `docs/backend-standards.md`: record the provider port / adapter / bound-provider registry convention, if it is not already there

## 12. Close out

- [ ] 12.1 Comment on JOS-146 (US-13) describing how `image-complete` and `result` are exposed, so it can gate on them directly
- [ ] 12.2 Open the PR with a description linking to JOS-145 and this change
- [ ] 12.3 Get a review from at least one human, not only AI agents
- [ ] 12.4 Archive the OpenSpec change after merge
