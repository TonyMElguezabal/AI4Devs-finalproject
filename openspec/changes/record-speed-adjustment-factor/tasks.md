# Tasks — Record requested duration and speed-adjustment factor per scene (JOS-148)

Every code change starts with a failing test (TDD), and every scenario in `specs/clip-duration-request/spec.md` has at least one functional test. No provider calls; this story is pure computation over already-stored values, plus a frontend display pass.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create branch `feature/jos-148-record-speed-adjustment-factor` from `feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set
- [ ] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [ ] 1.1 Confirm `request-admitted-clip-duration` (JOS-147) is on the base branch: `scenes.requested_duration_seconds`/`duration_warning` exist, are locked, and are exposed as `requestedDurationSeconds`/`durationWarning` on the session/scene read (`admittedDurations.ts`, `sceneRegistration.ts`, `db.ts`, `orchestrator.ts`, `routes.ts`)
- [ ] 1.2 Confirm `SPEED_FACTOR_LIMIT` in `backend/src/config/providers.ts`: if it is still `"undetermined"`, stop before group 3 and record the blocker on JOS-148 against `define-media-assembly` (JOS-182)'s unmerged pull request, naming the real value if it is visible there, rather than inventing one
- [ ] 1.3 Confirm the next free migration number on `feature/entrega-2-JAME` and every open feature branch (10 is taken by JOS-147); record it in design.md Decision 2 if different from 11
- [ ] 1.4 Confirm `SceneRow.tsx`'s deferral comment and `frontend/src/types.ts`'s `SceneEventPayload` still lack `requestedDurationSeconds`/`durationWarning`/`speedFactor`/`speedFactorWarning`, so this story is not duplicating already-landed frontend work
- [ ] 1.5 If 1.1 or 1.2 is not met, stop, and record the blocker on JOS-148 in Linear rather than building against a guess

## 2. Domain: speed-adjustment factor function (TDD, pure logic)

- [ ] 2.1 Write a failing test for the slow-down example in design.md Decision 1 (9 s narrated, 11 s requested → factor 11/9 ≈ 1.222)
- [ ] 2.2 Write a failing test for the speed-up example (17.4 s narrated, 15 s requested → factor 17.4/15 = 1.16)
- [ ] 2.3 Write a failing test that the factor is always ≥ 1, for both a requested duration above and below the narrated interval
- [ ] 2.4 Implement `speedAdjustmentFactor(requestedDurationSeconds, narratedDurationSeconds)` in `admittedDurations.ts` (next to `requestedClipDuration`, reusing `intervalDurationSeconds`), run the group 2 tests and confirm they pass

## 3. Storage and locks (design Decisions 2 and 4; spec: stored, never changes; warning against the limit)

- [ ] 3.1 Write failing tests in `scene-registration-persistence.test.ts`: migration 11 applies on a database at version 10 and on a fresh one; registered chunks read back with `speed_factor` and `speed_factor_warning`; an `UPDATE` of either is refused with the `locked:` message; skeleton scenes read back with both null
- [ ] 3.2 Add migration 11 (`scenes.speed_factor` `REAL`, `scenes.speed_factor_warning` `TEXT`, two triggers from a new constant); extend `RegisteredSceneInput`, `insertRegisteredScenes`, `Scene`, `rowToScene`, `createScene`
- [ ] 3.3 Write failing tests in `scene-registration.test.ts`: registration stores, for each chunk, the factor the group 2 function gives from its own `requested_duration_seconds` and narrated interval, and sets `speed_factor_warning` only when the factor exceeds `SPEED_FACTOR_LIMIT` — covering a factor at, just under, and over the limit, and a chunk carrying both `duration_warning: exceeds-maximum` and `speed_factor_warning` together
- [ ] 3.4 Compute the factor and warning in `registerDecomposition`, right after `requestedClipDuration` returns, and pass them to `insertRegisteredScenes` in the same call
- [ ] 3.5 Make the 3.1 and 3.3 tests pass

## 4. Stability across builds (spec: a different acceptable limit later)

- [ ] 4.1 Test: a chunk registered while `SPEED_FACTOR_LIMIT` was one value still reads its original `speed_factor_warning` after the constant changes in-process; a second registration attempt is refused and leaves stored values unchanged

## 5. Backend exposure (spec: readable)

- [ ] 5.1 Write failing tests in `scene-api-surface.test.ts`: the session read and scene events carry `speedFactor` for registered chunks and `speedFactorWarning` only when set; skeleton scenes omit both; the generated OpenAPI documents both on the scene response only, never on a request body
- [ ] 5.2 Add both fields to `SceneEventPayload` (`types.ts`), `sceneToPayload` (`orchestrator.ts`) and the Zod scene schema (`routes.ts`), with `.describe()` citing PRD §7.2/AC23 and stating they are immutable, following `requestedDurationSeconds`'s existing pattern exactly
- [ ] 5.3 Make the 5.1 tests pass

## 6. Frontend: type and scene-details display

- [ ] 6.1 Add `requestedDurationSeconds?: number`, `durationWarning?: "exceeds-maximum"`, `speedFactor?: number` and `speedFactorWarning?: boolean` to `SceneEventPayload` in `frontend/src/types.ts`
- [ ] 6.2 Write a failing component test (or extend the existing `SceneRow` test file) asserting the scene-details panel shows the requested duration and speed factor when present, shows the warning text distinguishably when `speedFactorWarning` or `durationWarning` is set, and shows neither when both are absent (skeleton scene)
- [ ] 6.3 Update `SceneRow.tsx`'s `scene-details` `<dl>` to render the new `<dt>`/`<dd>` pairs conditionally, and remove the comment deferring this to US-15
- [ ] 6.4 Make the 6.2 test pass

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review tests that count migrations, triggers or schema columns as closed lists (`persistence.test.ts`, `content-lock.test.ts`) and update if any assumes an exact set through migration 10
- [ ] 7.2 Confirm no backend test depended on scene payloads lacking the two new fields (full-shape `toEqual` against scene/session payloads)
- [ ] 7.3 Confirm every scenario in `specs/clip-duration-request/spec.md`'s new requirements has at least one functional test (backend) or component test (frontend), and list the mapping in the step 8 report
- [ ] 7.4 Confirm backend module test coverage has not decreased

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list
- [ ] 8.2 Run the targeted backend tests (admitted durations, registration, persistence, API surface) and the frontend `SceneRow` tests
- [ ] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`
- [ ] 8.4 Verify the post-test backend state matches the baseline; restore it if not
- [ ] 8.5 Create the report `openspec/changes/record-speed-adjustment-factor/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [ ] 8.6 Mark this step complete only after the tests pass and the report file exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch database and scratch projects folder, confirm `GET /health` responds with migrations 2-11 applied
- [ ] 9.2 Create a session, store a real narration, run `runDecompositionPhase`, then `curl GET /sessions/:id` and hand-verify each scene's `speedFactor` against `requestedDurationSeconds`/`narrationInterval` by the group 2 formula
- [ ] 9.3 Force a factor-over-limit case and confirm `speedFactorWarning` is set on the session read while the chunk stays `submitted` (not failed) and the session stays `chunks-processing`
- [ ] 9.4 Force the unsplittable-sentence case and confirm the chunk carries both `durationWarning: "exceeds-maximum"` and `speedFactorWarning`, independently
- [ ] 9.5 Try to change the values: an extra field in every scene-writing route's body, and a direct `UPDATE` on the scratch database; confirm both are refused with the trigger message
- [ ] 9.6 `curl GET /docs/json` and confirm the two fields are documented on responses only, never in a request body
- [ ] 9.7 Clean up through the test-only reset; confirm the scratch store is empty, the default store untouched
- [ ] 9.8 Save `openspec/changes/record-speed-adjustment-factor/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md` with every command and response

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: this story changes `SceneRow.tsx`'s rendered output, so it applies (unlike JOS-147, which had no screen change)
- [ ] 10.2 Ensure backend (stubbed providers) and frontend are running; start a project through decomposition so at least one chunk has a stored requested duration and factor
- [ ] 10.3 Navigate to the session page, expand a scene's details, and assert the requested duration and speed factor render
- [ ] 10.4 Where feasible, exercise a scene whose factor exceeds the limit (or stub one) and assert the warning renders distinguishably from a `durationWarning`
- [ ] 10.5 Restore the environment and save the report as `openspec/changes/record-speed-adjustment-factor/reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/data-model.md`: add `scenes.speed_factor`/`speed_factor_warning`, migration 11 and its two triggers, alongside the existing `requested_duration_seconds` entry; update its note that recording the factor "belongs to JOS-148" now that it is implemented
- [ ] 11.2 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only change is the two new scene response fields
- [ ] 11.3 `docs/backend-standards.md`: add a paragraph next to the requested-duration one explaining the factor is computed from already-locked values at registration, never from a generated clip, and extend the lock-triggers field list
- [ ] 11.4 `docs/PRD-v1.3.md` (or current PRD version): check §7.2 and AC23 need no wording change; record in the change log only if something changes

## 12. Close out

- [ ] 12.1 Comment on `generate-chunk-video` (JOS-146) confirming its "Out of Scope" split still holds and naming where the factor now lives, if its branch is still active
- [ ] 12.2 Open the PR with a description linking to JOS-148
- [ ] 12.3 Obtain review by at least one human, not only AI agents
- [ ] 12.4 Archive the OpenSpec change after merge
