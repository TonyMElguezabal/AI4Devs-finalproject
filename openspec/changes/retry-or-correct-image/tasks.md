# Tasks — Retry or correct the image instruction after an image failure (JOS-157, US-25)

Every code change starts with a failing test (TDD), and every scenario in `specs/image-failure-recovery/spec.md` has at least one test. Tests use the stub image adapter injected through the image provider registry, never the real provider. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-157-retry-or-correct-image` from `origin/feature/entrega-2-JAME` (the MVP integration branch), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [ ] 1.1 `git fetch`. Confirm the base still matches design.md § Context:
  - the routes ignore `sessionId`;
  - `correctAndRetry` writes `scenes.instruction`;
  - `markScenePendingRetry` is unconditional;
  - `launchSceneStage` dispatches on `imageInstruction`;
  - `SceneRow` pre-fills from `instruction`.

  If JOS-158 (clip retry) or JOS-184 (retry cycles) has merged and touched these, update design.md first. Record the result here.

## 2. Backend: session scoping (TDD; design Decision 1)

- [ ] 2.1 Write failing tests in `scene-api-surface.test.ts`: retry and correct at another session's URL answer 404 and leave the scene unchanged and unlaunched. An unknown session and an unknown scene answer 404 the same way.
- [ ] 2.2 Make `manualRetry` and `correctAndRetry` take `sessionId` and look the scene up with `getSceneForRun`; map a miss to 404 in `routes.ts`; make 2.1 pass.

## 3. Backend: conditional writes and reason codes (TDD; design Decisions 2 and 3)

- [ ] 3.1 Write failing tests:
  - retry and correct on a scene in each non-failed state answer 409 `not-failed`;
  - on a failed scene with a stored image they answer 409 `image-already-generated`;
  - each refusal leaves the row unchanged and launches nothing.
- [ ] 3.2 Write a failing test: two concurrent retries (and a retry racing a correction) give exactly one 200 and one 409 `not-failed`, with one launch.
- [ ] 3.3 Make `markScenePendingRetry` conditional, scoped by session, `failed` and no stored image, and have it return whether a row changed. Return the codes from the handlers. Make 3.1-3.2 pass.

## 4. Backend: correction changes only `IMAGE` (TDD; design Decisions 3-5)

- [ ] 4.1 Write failing tests:
  - a correction sets `image_instruction` to the trimmed value, and the stub adapter then receives exactly that;
  - `scenes.instruction` is not written for a real chunk;
  - a skeleton scene with no `IMAGE` has its legacy `instruction` corrected instead.
- [ ] 4.2 Write a failing test: snapshot every column of the corrected scene and of every other scene of the session, then correct. Only `image_instruction`, `status`, `attempts` and `updated_at` differ on the corrected scene, and nothing differs on the others.
- [ ] 4.3 Write failing tests: an empty instruction, a whitespace-only instruction and an extra body field each answer 400, with the scene unchanged.
- [ ] 4.4 Add `hasImageInstruction(scene)` and use it in `launchSceneStage`. Add `correctImageInstruction`, a single conditional write. Change the body schema to strict `{ instruction: z.string().trim().min(1) }`. Make 4.1-4.3 pass.

## 5. Backend: retry guarantees (TDD; design Decision 6)

- [ ] 5.1 Write tests through `POST …/retry`:
  - the stub adapter receives the stored `image_instruction` byte for byte;
  - a scene bound to A, with the registry default changed to B, is sent to A, and the binding stays A;
  - a retried scene gets a full attempt budget again;
  - a retry on a paused session leaves the scene `submitted` and held, and continue launches it once.

  These may pass on first run, because the behaviour exists; record which ones pin existing behaviour.
- [ ] 5.2 Fix any gap 5.1 reveals, in the image stage rather than in the handler.

## 6. Frontend: show and edit `IMAGE` (TDD; design Decision 7)

- [ ] 6.1 Add `prompt`, `imageInstruction` and `videoInstruction` to `SceneEventPayload` in `frontend/src/types.ts`; update the fixtures.
- [ ] 6.2 Write failing tests in `test/components.test.tsx`:
  - expanded details show `PROMPT`, `IMAGE` and `VIDEO`;
  - the correction form is pre-filled with `imageInstruction`, or with `instruction` for a scene without one;
  - a 409 `not-failed` or `image-already-generated` answer, and a 404, are shown on the row as their sentences.
- [ ] 6.3 Write a test for AC3: for every scene state, and for `failed` with `affectedStage: "video"`, there is no retry button and no correction form unless the scene is `failed` with `affectedStage: "image"`. It may pass on first run (JOS-151); record it as pinning.
- [ ] 6.4 Implement the `SceneRow.tsx` changes and the reason-to-sentence table, with `api/client.ts` returning the reason on a refusal; make 6.2-6.3 pass.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review the tests that call `manualRetry`, `correctAndRetry` or the retry and correct routes (`orchestrator.test.ts`, `image-stage.test.ts`, `video-stage.test.ts`, `scene-api-surface.test.ts`, `session-api-surface.test.ts`, `narration-interval-immutability.test.ts`) for the new signatures, the 404 and the reason codes; update them.
- [ ] 7.2 Confirm every scenario in `specs/image-failure-recovery/spec.md` has at least one test, and map ticket AC1-AC4 to tests; list both in the step 8 report.
- [ ] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents.
- [ ] 8.2 Run the targeted tests: `scene-api-surface`, `image-stage`, `orchestrator`, `components`.
- [ ] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`, so a local Fal.ai credential cannot mask a provider-dependent failure.
- [ ] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [ ] 8.5 Create the report `openspec/changes/retry-or-correct-image/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch store and scratch projects folder, with the stub image adapter configured to fail first; confirm `GET /health`.
- [ ] 9.2 Register a decomposed session in the scratch store and let one scene fail at the image stage. Then:
  - `curl -X POST …/retry` → 200;
  - `curl GET /sessions/:id` shows the scene back in progress, then `image-complete`;
  - the stub log shows the same `IMAGE`.
- [ ] 9.3 Fail another scene, then:
  - `curl -X POST …/correct -d '{"instruction":"  new text  "}'` → 200;
  - the store shows `image_instruction = "new text"` and `video_instruction` and `prompt` unchanged;
  - the stub received "new text".
- [ ] 9.4 Error cases, each with `curl`:
  - the scene under another session's id → 404;
  - a correction with `{"instruction":"   "}` → 400;
  - retry on an `image-complete` scene → 409 `not-failed`;
  - retry on a scene whose clip failed → 409 `image-already-generated`.

  `curl GET /docs/json` documents the 404 and the body constraint.
- [ ] 9.5 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/retry-or-correct-image/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: the scene details and correction form change, so it applies.
- [ ] 10.2 Run backend (scratch store, stub image adapter failing first) and frontend. Open a session with a failed image scene and expand it: `PROMPT`, `IMAGE` and `VIDEO` are shown, the form is pre-filled with `IMAGE`, and retry is offered.
- [ ] 10.3 Click retry: the row moves to in progress, then `image-complete`, without a reload, and the actions disappear.
- [ ] 10.4 On another failed scene, edit the form and submit: the scene completes, and its details show the corrected `IMAGE` with `PROMPT` and `VIDEO` unchanged.
- [ ] 10.5 Expand a scene whose image succeeded: no image retry and no correction form.
- [ ] 10.6 Restore the environment and save `openspec/changes/retry-or-correct-image/reports/YYYY-MM-DD-step-10-e2e.md`.

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the changes are the 404 responses, the reason codes and the trimmed non-blank body.
- [ ] 11.2 `docs/data-model.md`: record that a correction writes only `scenes.image_instruction` (or `instruction` for skeleton scenes), conditionally, and that `instruction` is legacy for real chunks.
- [ ] 11.3 `docs/backend-standards.md`: record that scene commands are scoped by `(sessionId, sceneId)` with 404 on a miss, and the conditional-write rule for recovery commands, as the pattern JOS-158 follows.
- [ ] 11.4 `docs/frontend-standards.md`: record that scene details show `PROMPT`, `IMAGE` and `VIDEO`, and add the reason-to-sentence table for scene command refusals.

## 12. Close out

- [ ] 12.1 Ask the user before commenting on JOS-158 (US-26) that the scoped, conditional recovery pattern is ready to mirror for `VIDEO`, and on JOS-184 that the attempt reset in `manualRetry` is the one place `startNewCycle` replaces.
- [ ] 12.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-157.
- [ ] 12.3 Obtain review by at least one human, not only AI agents.
- [ ] 12.4 Archive the OpenSpec change after merge.
