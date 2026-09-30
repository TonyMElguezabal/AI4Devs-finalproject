# Tasks — Assign narration intervals that partition the voice-over (JOS-143)

Every code change starts with a failing test (TDD). Backend only; no screen changes.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-143-assign-narration-intervals`, stacked on `feature/jos-142-decide-silence-allocation` because D11's rule A lives only there until JOS-142's PR merges; no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 Confirm on this branch: `unitBoundaries` implements rule A (next unit's speech start), and `segmentScript`, `registerDecomposition` and `insertRegisteredScenes` have the shapes design.md's Context describes
- [x] 1.2 Confirm migration 9 is still free on `feature/entrega-2-JAME` and every open feature branch; renumber design.md and these tasks if not
- [x] 1.3 Check `decompose-script-into-chunks` (umbrella) for interval wording, and point it to this change where it overlaps

## 2. Segmentation hands over the interval (design Decision 1; spec: shared boundary rule)

- [ ] 2.1 Failing tests in `script-segmentation.test.ts`: each fragment's `narrationInterval` equals `[boundaries[first], boundaries[last + 1]]`; consecutive fragments share their boundary exactly; the first starts at 0 and the last ends at the MP3 duration; a pause between two fragments goes to the earlier one (rule A); leading and trailing silence are covered
- [ ] 2.2 Add `narrationInterval` to `SegmentedFragment`, remove `narratedDurationSeconds`, add the exported helper `intervalDurationSeconds`, and fill the interval in `segmentScript`
- [ ] 2.3 Make the 2.1 tests pass; `npm run typecheck` shows every other caller that must follow the new shape

## 3. Registration checks the partition (design Decision 2; spec: partition)

- [ ] 3.1 Failing tests in `scene-registration.test.ts`: a valid partition registers; a gap, an overlap, a first start other than 0, a last end other than the voice-over's duration and an empty interval each record a retryable decomposition failure naming the scene, with no chunk written and no instruction call made; a voice-over duration of 0, negative or NaN records a non-retryable failure
- [ ] 3.2 Implement `findPartitionProblem(fragments, voiceOverDurationSeconds)` with exact comparisons; give `registerDecomposition` the `voiceOverDurationSeconds` parameter (design Decision 2), call the check after `findFragmentProblem` and before the instruction call, and pass `voiceOver.durationSeconds` from `segmentStoredTimestamps`; the §6.1 bounds check already uses `intervalDurationSeconds` (task 2.2)
- [ ] 3.3 Make the 3.1 tests pass

## 4. Storage and locks (design Decisions 3 and 4; spec: stored, immutable)

- [ ] 4.1 Failing tests in `scene-registration-persistence.test.ts` and `content-lock.test.ts`: registered chunks read back with their intervals; an `UPDATE` of `narration_start_seconds` or `narration_end_seconds` is refused with the `locked:` message; migration 9 applies on a database already at version 8 and on a fresh one; skeleton scenes have a null interval
- [ ] 4.2 Add migration 9 (two nullable `REAL` columns, two triggers from a new constant, not `LOCKED_SCENE_COLUMNS`); extend `RegisteredSceneInput`, `insertRegisteredScenes`, `Scene` and `rowToScene`; make the test-only reset aware of the new triggers if it drops and recreates the chunk locks
- [ ] 4.3 Make the 4.1 tests pass

## 5. Immutability through processing and retries (design Decision 6; spec: immutable)

- [ ] 5.1 Tests: an image-stage failure, an automatic retry, a manual retry and a correction of the image instruction each leave the interval as registered; a second registration is refused and leaves stored intervals unchanged
- [ ] 5.2 Make them pass without touching the retry code (they should, by construction); if one fails, stop and update design.md before changing code

## 6. Exposure (design Decision 5; spec: readable)

- [ ] 6.1 Failing tests in `scene-api-surface.test.ts` / `session-read.test.ts`: the session read and scene events carry `narrationInterval` for registered chunks and omit it for skeleton scenes; the generated OpenAPI (`GET /docs/json`) documents it on the scene response only, never on a request body
- [ ] 6.2 Add `narrationInterval` to `SceneEventPayload`, `sceneToPayload` and the Zod scene schema in `routes.ts`, with a `.describe()` citing PRD §3 and §7.3 and stating it is immutable
- [ ] 6.3 Make the 6.1 tests pass

## 7. Wire-through check (spec: shared boundary rule, partition)

- [ ] 7.1 Test in `decomposition-phase.test.ts`: `segmentStoredTimestamps` on stored timestamps with leading, inner and trailing silence registers chunks whose stored intervals partition `[0, voiceOver.durationSeconds]` and whose inner boundaries are the next unit's speech start

## 8. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 8.1 Review every test that builds a `SegmentedFragment` by hand (JOS-144's registration tests, JOS-140/141's segmentation tests): convert each `narratedDurationSeconds` to an interval of the same length, contiguous from 0, and pass the last interval's end as the voice-over duration, keeping the test's intent; no bulk rewrite
- [ ] 8.2 Review tests that count migrations, triggers or schema columns (`persistence.test.ts`, `content-lock.test.ts`) and update them for migration 9
- [ ] 8.3 Confirm no test depended on scene payloads lacking `narrationInterval`

## 9. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 9.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list
- [ ] 9.2 Run the targeted tests (segmentation, registration, persistence, content lock, API surface, decomposition phase)
- [ ] 9.3 Run `npm run typecheck` and the full `npm test`
- [ ] 9.4 Verify the post-test state matches the baseline; restore it if not
- [ ] 9.5 Write `openspec/changes/assign-narration-intervals/reports/YYYY-MM-DD-step-9-unit-test-and-db-verification.md`
- [ ] 9.6 Mark this step complete only after the tests pass and the report exists

## 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Start the real server on a scratch database and confirm `GET /health` responds
- [ ] 10.2 Create a session, narrate it for real (or reuse a narration recorded by JOS-142's step 10 if the quota is short), run `runDecompositionPhase` with a stub instruction generator, then `curl GET /sessions/:id` and check that every scene has `narrationInterval`, that the intervals are contiguous from 0 to the MP3's duration, and that inner boundaries match the timestamps' next-unit speech starts
- [ ] 10.3 Try to change an interval: every scene-writing route with an extra `narrationInterval` in the body, and a direct `UPDATE` on the scratch database; confirm the interval is unchanged and the trigger message appears
- [ ] 10.4 `curl GET /docs/json` and confirm `narrationInterval` is documented on responses only
- [ ] 10.5 Clean up through the test-only reset; confirm the scratch store is empty with all triggers, and the default store untouched
- [ ] 10.6 Save `reports/YYYY-MM-DD-step-10-manual-endpoint-testing.md` with every command and response

## 11. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 Decide applicability: no screen changes. Check that a session decomposed in step 10 still lists its chunks in order in the UI (the payload gained a field), or record why not
- [ ] 11.2 Save `reports/YYYY-MM-DD-step-11-e2e.md`

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 `docs/data-model.md`: the two `scenes` columns, migration 9 and the two triggers in the lock table
- [ ] 12.2 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only change is `narrationInterval` on scene responses
- [ ] 12.3 `docs/backend-standards.md`: intervals come from `unitBoundaries` via the fragment; registration checks the partition exactly; interval columns are locked
- [ ] 12.4 `docs/PRD.md`: check §5 step 4, §7.3 and AC19 need no wording change; record in §16 only if something changes

## 13. Close out

- [ ] 13.1 Comment on JOS-149 and JOS-148: where the stored intervals live and how to read them
- [ ] 13.2 Rebase onto `feature/entrega-2-JAME` once JOS-142's PR merges
- [ ] 13.3 Open the PR against `feature/entrega-2-JAME`, linking to JOS-143
- [ ] 13.4 Get a review from at least one human
- [ ] 13.5 Archive the OpenSpec change after merge
