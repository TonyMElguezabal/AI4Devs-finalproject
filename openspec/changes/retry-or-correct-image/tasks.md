# Tasks — Retry or correct the image instruction after an image failure (JOS-157, US-25)

Every code change starts with a failing test (TDD), and every scenario in `specs/image-failure-recovery/spec.md` has at least one test. Tests use the stub image adapter injected through the image provider registry, never the real provider. Backend code uses only erasable TypeScript syntax (no enums, no parameter properties).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-157-retry-or-correct-image` from `origin/feature/entrega-2-JAME` (the MVP integration branch), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 `git fetch`. Confirmed the base still matches design.md § Context, re-checked against current `feature/entrega-2-JAME` (148 commits ahead of the propose commit; branch rebased onto it):
  - the routes ignore `sessionId` (`routes.ts` calls `manualRetry(request.params.sceneId)` / `correctAndRetry(request.params.sceneId, ...)`, dropping `request.params.sessionId` even though `sceneParamsSchema` already types it);
  - `correctAndRetry` still writes `scenes.instruction` via `setSceneInstruction`, never `image_instruction`;
  - `markScenePendingRetry` and `setSceneInstruction` are still unconditional single-column `UPDATE`s with no `WHERE status = 'failed'`;
  - `launchSceneStage` still dispatches on `imageInstruction` (confirms `hasImageInstruction`'s intended signal);
  - frontend `SceneRow`/`types.ts` still have no `prompt`/`imageInstruction`/`videoInstruction` fields, pre-fill is still from `scene.instruction`.

  JOS-158 (clip retry/correction) is proposed only (`feature/jos-158-retry-or-correct-clip`, not merged) — no `VIDEO` correction path exists yet, nothing to conflict with. JOS-184 (bounded-retry-policy) is merged (PR #27) but never touched `manualRetry`/`correctAndRetry`; `resetAttemptsForManualRetry` is still the one direct reset, matching this change's own non-goal (JOS-184 replaces it later, not here). No artifact update needed.

## 2. Backend: session scoping (TDD; design Decision 1)

- [x] 2.1 Write failing tests in `scene-api-surface.test.ts`: retry and correct at another session's URL answer 404 and leave the scene unchanged and unlaunched. An unknown session and an unknown scene answer 404 the same way.
- [x] 2.2 Made `manualRetry` and `correctAndRetry` take `sessionId` and look the scene up with `getSceneForRun`; mapped a miss (`unknown-scene`) to 404 in `routes.ts`. Makes 2.1 pass.

## 3. Backend: conditional writes and reason codes (TDD; design Decisions 2 and 3)

- [x] 3.1 Write failing tests:
  - retry and correct on a scene in each non-failed state answer 409 `not-failed`;
  - on a failed scene with a stored image they answer 409 `image-already-generated`;
  - each refusal leaves the row unchanged and launches nothing.
- [x] 3.2 Write a failing test: two concurrent retries (and a retry racing a correction) give exactly one 200 and one 409 `not-failed`, with one launch.
- [x] 3.3 Deviation from the design's wording: `markScenePendingRetry` is left unconditional, because `applyFailureOutcome`'s automatic-retry path still calls it while the scene is `image-generating`/`video-generating`, not `failed` — a `WHERE status = 'failed'` there would silently drop every automatic retry. Added a separate `markSceneForManualRetry(sessionId, sceneId, error)` in `db.ts` instead, conditional on session + `failed` + no stored image, returning whether a row changed; `manualRetry` calls this one. Reason codes returned from the handlers (`ImageRecoveryRefusal` in `orchestrator.ts`). Makes 3.1-3.2 pass.

## 4. Backend: correction changes only `IMAGE` (TDD; design Decisions 3-5)

- [x] 4.1 Write failing tests:
  - a correction sets `image_instruction` to the trimmed value, and the stub adapter then receives exactly that;
  - `scenes.instruction` is not written for a real chunk;
  - a skeleton scene with no `IMAGE` has its legacy `instruction` corrected instead.
- [x] 4.2 Write a failing test: snapshot every column of the corrected scene and of every other scene of the session, then correct. Only `image_instruction`, `status`, `attempts` and `updated_at` differ on the corrected scene, and nothing differs on the others.
- [x] 4.3 Write failing tests: an empty instruction and a whitespace-only instruction each answer 400, with the scene unchanged. (Design correction — see design.md Decision 5: an extra body field is ignored, not 400, matching every other chunk-mutating route's convention; tested that it's ignored instead.)
- [x] 4.4 Added `hasImageInstruction(scene)` and used it in `launchSceneStage`. Added `correctImageInstruction` and `correctLegacyInstruction` in `db.ts`, each a single conditional write (two functions, not a column parameter, matching this file's existing `bindSceneImageProvider`/`bindSceneVideoProvider` pattern). Body schema is `{ instruction: z.string().transform(trim).pipe(z.string().min(1)) }`, not `.strict()` — see design.md Decision 5. Makes 4.1-4.3 pass.

## 5. Backend: retry guarantees (TDD; design Decision 6)

- [x] 5.1 Wrote tests in `image-stage.test.ts` (function-level, not through HTTP — matches this file's existing `manualRetry`/`correctAndRetry` test style):
  - "a retry sends the stored image_instruction to the provider unchanged, byte for byte" (new);
  - "a retry stays bound to the provider from the first attempt, even if the registry default changes" (new);
  - a retried scene gets a full attempt budget again — already pinned by `orchestrator.test.ts`'s "a manual retry after failure starts a fresh 1 + RETRY_BUDGET cycle" (the reset site, `resetAttemptsForManualRetry`, is the same for both the stub and real image stage);
  - a retry on a paused session leaves the scene `submitted` and held — already pinned by "a manual retry while paused is recorded as pending and not sent" (updated for the new signature in task 2.2/7.1).

  Both new tests passed on first run — pinning existing behaviour, no gap found.
- [x] 5.2 No gap found; nothing to fix.

## 6. Frontend: show and edit `IMAGE` (TDD; design Decision 7)

- [x] 6.1 Added `prompt`, `imageInstruction` and `videoInstruction` to `SceneEventPayload` in `frontend/src/types.ts` (backend already sent them; no fixtures needed updating since the fields are optional and `makeScene` passes overrides through).
- [x] 6.2 Wrote failing tests in `test/components.test.tsx`:
  - expanded details show `PROMPT`, `IMAGE` and `VIDEO`;
  - the correction form is pre-filled with `imageInstruction`, or with `instruction` for a scene without one;
  - a `not-failed`, `image-already-generated` (409) and `unknown-scene` (404) answer are all shown on the row as their sentences (one lookup table, no HTTP-status branching needed — `api/client.ts`'s `asJson` already turns any non-ok response into an `Error` whose message is the reason, so the row's catch handles 404 and 409 identically).
- [x] 6.3 AC3 is already pinned by the unchanged `sceneActions` tests (`describe("sceneActions derives actions from state and affected stage (JOS-151, Decision 4)")`), which this change does not touch — recorded as pinning, no new test needed.
- [x] 6.4 Implemented `SceneRow.tsx`: PROMPT/IMAGE/VIDEO replace the old single "Instruction" field; the correction form's initial draft is `imageInstruction || instruction`; a new `imageRecoveryRefusals.ts` reason-to-sentence table (mirrors `retryRefusals.ts`); retry and correction both go through one local `runAction` (pending/disabled state, catch → sentence), the same pattern `PhaseRetryButton.tsx` already uses for decomposition retry. `onRetry`/`onCorrect` props changed from `void` to `Promise<unknown>` (`SceneRow`, `SceneList`, `SessionPage`); `api/client.ts` needed no change, its error propagation already carried the reason. Makes 6.2-6.3 pass.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review the tests that call `manualRetry`, `correctAndRetry` or the retry and correct routes (`orchestrator.test.ts`, `image-stage.test.ts`, `video-stage.test.ts`, `scene-api-surface.test.ts`, `session-api-surface.test.ts`, `narration-interval-immutability.test.ts`) for the new signatures, the 404 and the reason codes; update them.
- [x] 7.2 Confirm every scenario in `specs/image-failure-recovery/spec.md` has at least one test, and map ticket AC1-AC4 to tests; list both in the step 8 report.
- [x] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list, and `data/projects/` contents.
- [x] 8.2 Run the targeted tests: `scene-api-surface`, `image-stage`, `orchestrator`, `components`.
- [x] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`. Run the backend suite once more in a fresh worktree without `backend/.secrets.json`, so a local Fal.ai credential cannot mask a provider-dependent failure.
- [x] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [x] 8.5 Create the report `openspec/changes/retry-or-correct-image/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [x] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Started the real server on a scratch store and scratch projects folder. Deviation: there is no `USE_STUB_IMAGE_PROVIDER` toggle (unlike voice/video) — confirmed `GET /health`, then used the missing-`FAL_API_KEY`-credential not-retryable failure (free, no network call) to drive a real scene through the real image stage into `failed`, inserted via `insertRegisteredScenes` through a one-off script against the scratch `DB_PATH` (the same store-function technique JOS-166's reports use for the same gap). Recorded in the step 9 report.
- [x] 9.2 `curl -X POST …/retry` → 200; `GET` shows the scene back at `failed` with the same credential-missing cause, confirming the real image path was used again. The exact-`IMAGE`-forwarded and stays-bound guarantees are proven at the unit level (step 8, `image-stage.test.ts`), which curl cannot reach without a stub registry.
- [x] 9.3 `curl -X POST …/correct -d '{"instruction":"  a corrected lighthouse scene, warmer light  "}'` → 200; the store shows `imageInstruction` set to the trimmed text and `prompt`/`videoInstruction` unchanged.
- [x] 9.4 Error cases, each with `curl`: the scene under another session's id → 404; a correction with `{"instruction":"   "}` → 400; retry on an `image-complete` scene → 409 `not-failed`; retry and correct on a clip-failed scene → 409 `image-already-generated`. `GET /docs/json` documents 200/404/409 and the body's `minLength: 1`.
- [x] 9.5 Cleaned up the scratch store and folder; confirmed the default store untouched; saved `openspec/changes/retry-or-correct-image/reports/2026-10-09-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Decided applicability: the scene details and correction form change, so it applies.
- [x] 10.2 Ran backend (scratch store, a real failed image scene via the missing-credential technique — no image-provider stub exists, see step 9) and frontend. Opened a session with the failed image scene and expanded it: `PROMPT`, `IMAGE` and `VIDEO` shown, the form pre-filled with `IMAGE`, retry offered.
- [x] 10.3 Deviation: with no `FAL_API_KEY`, a retry cannot reach `image-complete` over HTTP (same limitation as step 9) — not re-tested here; the row updating live without a reload after the correction (task 10.4) proves the same live-update mechanism.
- [x] 10.4 Edited the form and submitted: the row updated live, with no reload, to the corrected `IMAGE`; `PROMPT` and `VIDEO` unchanged in the same snapshot.
- [x] 10.5 Marked the scene `image-complete` out of band; the open page's live reconnect picked it up live: no retry button, no correction form (AC3).
- [x] 10.6 Restored the environment and saved `openspec/changes/retry-or-correct-image/reports/2026-10-09-step-10-e2e-playwright.md`.

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
