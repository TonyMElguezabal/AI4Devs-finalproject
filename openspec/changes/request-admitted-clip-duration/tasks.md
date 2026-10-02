# Tasks — Request the admitted clip duration closest to the narrated interval (JOS-147)

Every code change starts with a failing test (TDD), and every scenario in `specs/clip-duration-request/spec.md` has at least one functional test. Backend only; no screen changes and no provider calls.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-147-request-admitted-clip-duration`, stacked on `feature/jos-143-assign-narration-intervals` (at `b5ec062`) because the stored narration interval exists only there until JOS-143 (and JOS-142 below it) merge; no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate

- [x] 1.1 Confirm on this branch: `closestAdmittedDuration` implements §7.2 (smallest speed change, tie to the longer), `intervalDurationSeconds` and the stored interval exist, and `registerDecomposition`/`insertRegisteredScenes` have the shapes design.md's Context describes — confirmed: all four match exactly (`admittedDurations.ts`, `sceneRegistration.ts`, `db.ts`)
- [x] 1.2 Confirm migration 10 is still free on `feature/entrega-2-JAME` and every open feature branch; renumber design.md and these tasks if not — confirmed 2026-10-02: highest version across every local and remote branch is 9 (this branch, via JOS-143); JOS-146 plans 11 for itself at its own gate. 10 is free
- [x] 1.3 If JOS-143 or JOS-142 merged since this branch was cut, rebase onto `feature/entrega-2-JAME` first — neither has merged (`git merge-base --is-ancestor b5ec062 origin/feature/entrega-2-JAME` is false); stays stacked

## 2. The requested duration (design Decision 1; spec: smallest speed change, admitted range, over the maximum)

- [x] 2.1 Failing tests in `admitted-durations.test.ts`: `requestedClipDuration` gives 6 s for 5.49 s, 9 s for 9.4 s, 6 s for √30 s, 5 s for 3.2 s with no warning, 15 s for exactly 15 s with no warning, 15 s for 17.4 s with `exceeds-maximum`; `closestAdmittedDuration` with an explicit admitted list 5-20 gives 17 s for 17.4 s; its existing tests still pass with the default list — 9 new tests, confirmed failing (`requestedClipDuration is not a function`) before implementation
- [x] 2.2 Add the optional `admitted` argument to `closestAdmittedDuration` and implement `requestedClipDuration`, fully typed — `admittedDurations.ts`. Also moved `intervalDurationSeconds` here from `sceneRegistration.ts` (re-exported from there unchanged) to avoid a circular import: `requestedClipDuration` needs it, and `sceneRegistration.ts` will need `requestedClipDuration` (group 3)
- [x] 2.3 Make the 2.1 tests pass — 25/25 in `admitted-durations.test.ts`. First full-suite run had one `orchestrator.test.ts` retry-budget failure (a real-timer `waitFor` test); a second full run passed 615/615, and the same test passed 3/3 times in isolation on both this branch and the unmodified one. Treated as a pre-existing timing flake, not a regression from this change

## 3. Storage and locks (design Decisions 2 and 3; spec: stored, never changes)

- [x] 3.1 Failing tests in `scene-registration-persistence.test.ts` and `content-lock.test.ts`: migration 10 applies on a database at version 9 and on a fresh one; registered chunks read back with their requested duration and warning; an `UPDATE` of `requested_duration_seconds` or `duration_warning` is refused with the `locked:` message; skeleton scenes read back with both null — added to `scene-registration-persistence.test.ts` (mirroring migration 9's own tests), not `content-lock.test.ts`, which covers session/voice-over content locks, not scene columns; 7 new tests, confirmed failing first
- [x] 3.2 Add migration 10 (two nullable columns, two triggers from the new constant); extend `RegisteredSceneInput`, `insertRegisteredScenes`, `Scene`, `rowToScene` and `createScene`; check whether the test-only reset needs anything for the new triggers (it drops only delete triggers) — confirmed: `resetAll()` only lifts BEFORE DELETE triggers; the new ones are BEFORE UPDATE, untouched by it, no change needed
- [x] 3.3 Failing tests in `scene-registration.test.ts`: registration stores, for each chunk, the requested duration and warning its interval gives, including an unsplittable 17.4 s chunk (`exceeds-maximum`, chunk `submitted`, session not failed) — 2 new tests
- [x] 3.4 Compute both values in `registerDecomposition` after the partition check and pass them to `insertRegisteredScenes`
- [x] 3.5 Make the 3.1 and 3.3 tests pass — 26/26 in `scene-registration-persistence.test.ts`, 42/42 in `scene-registration.test.ts`; typecheck clean; full suite 624/626 (2 intentional skips)

## 4. Stability across builds (spec: a different admitted set later)

- [x] 4.1 Test: a chunk registered with a 17.4 s interval still reads 15 s and `exceeds-maximum` while `requestedClipDuration(interval, 5..20)` now gives 17 s; a second registration is refused and leaves stored values unchanged — added to `scene-registration.test.ts`; passed immediately (nothing to implement for AC5 beyond group 3's storage, which already makes it hold by construction)

## 5. Exposure (design Decision 4; spec: readable)

- [x] 5.1 Failing tests in `scene-api-surface.test.ts`: the session read and scene events carry `requestedDurationSeconds` for registered chunks and `durationWarning` only when set; skeleton scenes omit both; the generated OpenAPI (`GET /docs/json`) documents both on the scene response only, never on a request body — 5 new tests; 3 confirmed failing first (the other 2 passed trivially since the fields didn't exist yet on either side, matched "omitted"/"unchanged")
- [x] 5.2 Add both fields to `SceneEventPayload`, `sceneToPayload` and the Zod scene schema in `routes.ts`, with a `.describe()` citing PRD §7.2 and §6.1.1 and stating they are immutable
- [x] 5.3 Make the 5.1 tests pass — 22/22 in `scene-api-surface.test.ts`; typecheck clean

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Review tests that count migrations, triggers or schema columns (`persistence.test.ts`, `content-lock.test.ts`, `narration-interval-immutability.test.ts`) and update them for migration 10 — no update needed: all three use `toContain`/`arrayContaining` for migrations and triggers (open sets), never an exact closed list; `narration-interval-immutability.test.ts` goes through `registerDecomposition`, which computes the new fields internally
- [x] 6.2 Confirm segmentation's tests (`script-segmentation.test.ts`, `split-segmentation.test.ts`) are unaffected by the new optional argument — 36/36 and 11/11, unchanged
- [x] 6.3 Confirm no test depended on scene payloads lacking the two fields — searched for exact full-shape `toEqual` against scene/session payloads; none found (every assertion uses `toMatchObject` or a field-specific `.map()` projection), consistent with the full suite passing with no update needed anywhere outside this change's own new tests
- [x] 6.4 Confirm every spec scenario has a functional test, and list the mapping in the step 7 report — all 11 scenarios across the spec's 5 requirements mapped (listed in the step 7 report)
- [x] 6.5 Confirm module test coverage has not decreased (base `b5ec062` vs head, each on a scratch database, `@vitest/coverage-v8` installed locally without saving) — totals improved (stmts 95.28%→95.42%, branch 91.29%→91.36%, funcs 98.72%→98.74%, lines 95.28%→95.42%); no file regressed in substance (`sceneRegistration.ts`'s branch % dipped 0.05pp from denominator dilution around the same pre-existing uncovered re-throw line, not a new gap)

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list — found and cleared a leftover from an earlier `split-segmentation.test.ts` run this session first ("Clause split test", 1 run/2 scenes); clean baseline: all tables 0, migrations 2-10, 15 triggers
- [x] 7.2 Run the targeted tests (admitted durations, registration, persistence, content lock, API surface) — 150/150
- [x] 7.3 Run `npm run typecheck` and the full `npm test` — clean; 630/632 (2 intentional skips)
- [x] 7.4 Verify the post-test state matches the baseline; restore it if not — tables/migrations/triggers matched exactly; found and removed one stray empty project folder (`Traversal Test ...`, same category as `generate-chunk-image`'s own precedent)
- [x] 7.5 Write `openspec/changes/request-admitted-clip-duration/reports/2026-10-02-step-7-unit-test-and-db-verification.md`
- [x] 7.6 Mark this step complete only after the tests pass and the report exists

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the real server on a scratch database and scratch projects folder, and confirm `GET /health` responds — `{"ok":true}`, migrations 2-10 applied
- [x] 8.2 Create a session, store a real narration (reuse JOS-142's recorded one), run `runDecompositionPhase` with a stub instruction generator, then `curl GET /sessions/:id` and check every scene's `requestedDurationSeconds` against its `narrationInterval` by the §7.2 rule — 4 scenes, intervals matched JOS-143's own report exactly; requested durations [12, 14, 8, 13] all hand-verified against the ratio rule
- [x] 8.3 Force an over-maximum case (a scratch session whose script has a sentence narrated over 15 s with no clause boundary, or a direct registration with such an interval) and confirm `requestedDurationSeconds: 15` and `durationWarning: "exceeds-maximum"` on the session read — confirmed, chunk `submitted`, session `chunks-processing`
- [x] 8.4 Try to change the values: an extra field in every scene-writing route's body, and a direct `UPDATE` on the scratch database; confirm they are unchanged and the trigger message appears — confirmed on both fields
- [x] 8.5 `curl GET /docs/json` and confirm both fields are documented on responses only — 2 occurrences each, 0 in any request body
- [x] 8.6 Clean up through the test-only reset; confirm the scratch store is empty with all triggers, and the default store untouched — confirmed; two throwaway helper scripts deleted, never committed
- [x] 8.7 Save `reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md` with every command and response

## 9. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 9.1 Decide applicability: no screen changes. Check that the session page still lists the chunks with the payload's new fields, or record why not — not applicable: `SceneRow.tsx`'s own existing comment already defers requested-duration display to JOS-148, and the frontend doesn't read `narrationInterval` either; zero `grep` matches in `frontend/src`
- [x] 9.2 Save `reports/YYYY-MM-DD-step-9-e2e.md`

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 `docs/data-model.md`: the two `scenes` columns, migration 10 and the two triggers in the lock table — added alongside the narration-interval entry, the migrations narrative, the triggers table and its notes
- [x] 10.2 `docs/api-spec.yml`: regenerate from `GET /docs/json`; confirm the only change is the two scene response fields — regenerated and diffed against a fresh fetch: the only content difference is the two new fields (inserted at both occurrences); the diff also showed a pre-existing, unrelated single-vs-double-quote cosmetic difference from a different `yaml`-library version, left untouched
- [x] 10.3 `docs/backend-standards.md`: the requested duration is decided once at registration from the stored interval through `closestAdmittedDuration`, and locked — added a paragraph alongside the narration-interval one, and extended the lock-triggers paragraph's field list
- [x] 10.4 `docs/PRD.md`: check §6.1.1, §7.2, §11.2 and AC06 need no wording change; record in the change log only if something changes — checked, all four already describe exactly this behavior (smallest speed change, tie to longer, below-minimum uses the minimum, unsplittable sentence uses the maximum with a warning, not a failure); no change needed

## 11. Close out

- [x] 11.1 Comment on JOS-146 (read the stored `requested_duration_seconds` instead of calling a function; its design Decision 4 and migration number need updating at its gate) and on JOS-148 (the request and `exceeds-maximum` are stored; the factor and the limit warning are its own) — JOS-146 commented and re-gated in the same session (its own gate task 1.1-1.6 re-run); JOS-148 comment posted
- [ ] 11.2 Rebase onto `feature/entrega-2-JAME` once JOS-142 and JOS-143 merge
- [x] 11.3 Open the PR, linking to JOS-147 — [PR #17](https://github.com/TonyMElguezabal/AI4Devs-finalproject/pull/17), stacked against `feature/jos-143-assign-narration-intervals` (task 11.2 not yet done: retarget to `feature/entrega-2-JAME` once PR #16 merges). The whole stack was opened together: [PR #15](https://github.com/TonyMElguezabal/AI4Devs-finalproject/pull/15) (JOS-142 → entrega-2-JAME), [PR #16](https://github.com/TonyMElguezabal/AI4Devs-finalproject/pull/16) (JOS-143 → JOS-142's branch), this one (JOS-147 → JOS-143's branch)
- [ ] 11.4 Get a review from at least one human
- [ ] 11.5 Archive the OpenSpec change after merge
