# Tasks — Request the admitted clip duration closest to the narrated interval (JOS-147)

Every code change starts with a failing test (TDD), and every scenario in `specs/clip-duration-request/spec.md` has at least one functional test. Backend only; no screen changes and no provider calls.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-147-request-admitted-clip-duration`, stacked on `feature/jos-143-assign-narration-intervals` (at `b5ec062`) because the stored narration interval exists only there until JOS-143 (and JOS-142 below it) merge; no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [ ] 1.1 Confirm on this branch: `closestAdmittedDuration` implements §7.2 (smallest speed change, tie to the longer), `intervalDurationSeconds` and the stored interval exist, and `registerDecomposition`/`insertRegisteredScenes` have the shapes design.md's Context describes
- [ ] 1.2 Confirm migration 10 is still free on `feature/entrega-2-JAME` and every open feature branch; renumber design.md and these tasks if not
- [ ] 1.3 If JOS-143 or JOS-142 merged since this branch was cut, rebase onto `feature/entrega-2-JAME` first

## 2. The requested duration (design Decision 1; spec: smallest speed change, admitted range, over the maximum)

- [ ] 2.1 Failing tests in `admitted-durations.test.ts`: `requestedClipDuration` gives 6 s for 5.49 s, 9 s for 9.4 s, 6 s for √30 s, 5 s for 3.2 s with no warning, 15 s for exactly 15 s with no warning, 15 s for 17.4 s with `exceeds-maximum`; `closestAdmittedDuration` with an explicit admitted list 5-20 gives 17 s for 17.4 s; its existing tests still pass with the default list
- [ ] 2.2 Add the optional `admitted` argument to `closestAdmittedDuration` and implement `requestedClipDuration`, fully typed
- [ ] 2.3 Make the 2.1 tests pass

## 3. Storage and locks (design Decisions 2 and 3; spec: stored, never changes)

- [ ] 3.1 Failing tests in `scene-registration-persistence.test.ts` and `content-lock.test.ts`: migration 10 applies on a database at version 9 and on a fresh one; registered chunks read back with their requested duration and warning; an `UPDATE` of `requested_duration_seconds` or `duration_warning` is refused with the `locked:` message; skeleton scenes read back with both null
- [ ] 3.2 Add migration 10 (two nullable columns, two triggers from the new constant); extend `RegisteredSceneInput`, `insertRegisteredScenes`, `Scene`, `rowToScene` and `createScene`; check whether the test-only reset needs anything for the new triggers (it drops only delete triggers)
- [ ] 3.3 Failing tests in `scene-registration.test.ts`: registration stores, for each chunk, the requested duration and warning its interval gives, including an unsplittable 17.4 s chunk (`exceeds-maximum`, chunk `submitted`, session not failed)
- [ ] 3.4 Compute both values in `registerDecomposition` after the partition check and pass them to `insertRegisteredScenes`
- [ ] 3.5 Make the 3.1 and 3.3 tests pass

## 4. Stability across builds (spec: a different admitted set later)

- [ ] 4.1 Test: a chunk registered with a 17.4 s interval still reads 15 s and `exceeds-maximum` while `requestedClipDuration(interval, 5..20)` now gives 17 s; a second registration is refused and leaves stored values unchanged

## 5. Exposure (design Decision 4; spec: readable)

- [ ] 5.1 Failing tests in `scene-api-surface.test.ts`: the session read and scene events carry `requestedDurationSeconds` for registered chunks and `durationWarning` only when set; skeleton scenes omit both; the generated OpenAPI (`GET /docs/json`) documents both on the scene response only, never on a request body
- [ ] 5.2 Add both fields to `SceneEventPayload`, `sceneToPayload` and the Zod scene schema in `routes.ts`, with a `.describe()` citing PRD §7.2 and §6.1.1 and stating they are immutable
- [ ] 5.3 Make the 5.1 tests pass

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 6.1 Review tests that count migrations, triggers or schema columns (`persistence.test.ts`, `content-lock.test.ts`, `narration-interval-immutability.test.ts`) and update them for migration 10
- [ ] 6.2 Confirm segmentation's tests (`script-segmentation.test.ts`, `split-segmentation.test.ts`) are unaffected by the new optional argument
- [ ] 6.3 Confirm no test depended on scene payloads lacking the two fields
- [ ] 6.4 Confirm every spec scenario has a functional test, and list the mapping in the step 7 report
- [ ] 6.5 Confirm module test coverage has not decreased (base `b5ec062` vs head, each on a scratch database, `@vitest/coverage-v8` installed locally without saving)

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 7.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list
- [ ] 7.2 Run the targeted tests (admitted durations, registration, persistence, content lock, API surface)
- [ ] 7.3 Run `npm run typecheck` and the full `npm test`
- [ ] 7.4 Verify the post-test state matches the baseline; restore it if not
- [ ] 7.5 Write `openspec/changes/request-admitted-clip-duration/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [ ] 7.6 Mark this step complete only after the tests pass and the report exists

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Start the real server on a scratch database and scratch projects folder, and confirm `GET /health` responds
- [ ] 8.2 Create a session, store a real narration (reuse JOS-142's recorded one), run `runDecompositionPhase` with a stub instruction generator, then `curl GET /sessions/:id` and check every scene's `requestedDurationSeconds` against its `narrationInterval` by the §7.2 rule
- [ ] 8.3 Force an over-maximum case (a scratch session whose script has a sentence narrated over 15 s with no clause boundary, or a direct registration with such an interval) and confirm `requestedDurationSeconds: 15` and `durationWarning: "exceeds-maximum"` on the session read
- [ ] 8.4 Try to change the values: an extra field in every scene-writing route's body, and a direct `UPDATE` on the scratch database; confirm they are unchanged and the trigger message appears
- [ ] 8.5 `curl GET /docs/json` and confirm both fields are documented on responses only
- [ ] 8.6 Clean up through the test-only reset; confirm the scratch store is empty with all triggers, and the default store untouched
- [ ] 8.7 Save `reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md` with every command and response

## 9. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Decide applicability: no screen changes. Check that the session page still lists the chunks with the payload's new fields, or record why not
- [ ] 9.2 Save `reports/YYYY-MM-DD-step-9-e2e.md`

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/data-model.md`: the two `scenes` columns, migration 10 and the two triggers in the lock table
- [ ] 10.2 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only change is the two scene response fields
- [ ] 10.3 `docs/backend-standards.md`: the requested duration is decided once at registration from the stored interval through `closestAdmittedDuration`, and locked
- [ ] 10.4 `docs/PRD.md`: check §6.1.1, §7.2, §11.2 and AC06 need no wording change; record in the change log only if something changes

## 11. Close out

- [ ] 11.1 Comment on JOS-146 (read the stored `requested_duration_seconds` instead of calling a function; its design Decision 4 and migration number need updating at its gate) and on JOS-148 (the request and `exceeds-maximum` are stored; the factor and the limit warning are its own)
- [ ] 11.2 Rebase onto `feature/entrega-2-JAME` once JOS-142 and JOS-143 merge
- [ ] 11.3 Open the PR against `feature/entrega-2-JAME`, linking to JOS-147
- [ ] 11.4 Get a review from at least one human
- [ ] 11.5 Archive the OpenSpec change after merge
