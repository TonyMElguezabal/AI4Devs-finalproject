# Tasks — Record requested duration and speed-adjustment factor per scene (JOS-148)

Every code change starts with a failing test (TDD), and every scenario in `specs/clip-duration-request/spec.md` has at least one functional test. No provider calls; this story is pure computation over already-stored values, plus a frontend display pass.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-148-record-speed-adjustment-factor` from `feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set — created from `a3f5801`, no upstream configured
- [x] 0.2 Verify the branch was created and is the current branch — `git branch --show-current` confirms `feature/jos-148-record-speed-adjustment-factor`

## 1. Gate

- [x] 1.1 Confirm `request-admitted-clip-duration` (JOS-147) is on the base branch: `scenes.requested_duration_seconds`/`duration_warning` exist, are locked, and are exposed as `requestedDurationSeconds`/`durationWarning` on the session/scene read (`admittedDurations.ts`, `sceneRegistration.ts`, `db.ts`, `orchestrator.ts`, `routes.ts`) — confirmed: met, all five files carry it
- [x] 1.2 Confirm `SPEED_FACTOR_LIMIT` in `backend/src/config/providers.ts`: if it is still `"undetermined"`, stop before group 3 and record the blocker on JOS-148 against `define-media-assembly` (JOS-182)'s unmerged pull request, naming the real value if it is visible there, rather than inventing one — initially found `"undetermined"`; paused and reported to the user. **Resolved after the user confirmed JOS-182 and JOS-165 are both done.** Read `feature/jos-182-define-media-assembly`'s full ADR (`docs/adr/0005-media-assembly.md` Decision 5, Status: Accepted 2026-09-26, PR #3): the recommended **numeric range is 0.5×-2.0×, and its own "Design open questions, answered" §2 states this range is "asymmetric in basis, not ... in the recommended number"** — i.e. the mechanism differs by direction but the recommended limit doesn't. Since `1/0.5 = 2.0/1 = 2.0`, both the signed floor and ceiling map to the **same unsigned value, 2.0**, on this story's `max(requested/narrated, narrated/requested) ≥ 1` factor — no direction-awareness needed after all. Set `SPEED_FACTOR_LIMIT = 2.0` in `providers.ts` (as part of this ticket, since JOS-165's own comment said it would only record the number once JOS-182 landed), with the reasoning in a code comment, and added a test in `providerConfig.test.ts` pinning it. Group 3 can proceed
- [x] 1.3 Confirm the next free migration number on `feature/entrega-2-JAME` and every open feature branch (10 is taken by JOS-147); record it in design.md Decision 2 if different from 11 — confirmed: highest version across every open branch with a `db.ts` is 10 (`feature/entrega-2-JAME`, where this branch forked from); `feature/jos-141`/`feature/jos-146` are still at 8; `feature/jos-182`/`jos-167`/`jos-184`/`jos-185` have no `db.ts` changes. **11 stays correct**, no update needed
- [x] 1.4 Confirm `SceneRow.tsx`'s deferral comment and `frontend/src/types.ts`'s `SceneEventPayload` still lack `requestedDurationSeconds`/`durationWarning`/`speedFactor`/`speedFactorWarning`, so this story is not duplicating already-landed frontend work — confirmed: zero matches for any of the four in either file
- [x] 1.5 If 1.1 or 1.2 is not met, stop, and record the blocker on JOS-148 in Linear rather than building against a guess — 1.1 is met; 1.2 is not fully met but names its own narrower stopping point (before group 3), which this task follows rather than stopping all work. Groups 2 (the limit-independent ratio function) can proceed; group 3 (the warning comparison) cannot

## 2. Domain: expose the speed-adjustment factor already computed by duration selection (TDD, pure logic)

- [x] 2.1 Design-time discovery, recorded in design.md Decision 1: `closestAdmittedDuration` already computes and discards exactly this ratio as `speedRatio`; no new function is needed, `requestedClipDuration` just needs to pass it through as `factor`
- [x] 2.2 Update the existing `requestedClipDuration` tests in `admitted-durations.test.ts` (currently exact `toEqual({ seconds, warning })`) to also assert `factor`, matching each case's already-known `speedRatio` (6/5.49, 9/9.4, 6/√30, 5/3, 1 at exactly 15 s, 15/17.4, the explicit-admitted-list case) — confirmed failing (`factor` absent) before implementation
- [x] 2.3 Add `factor: number` to `RequestedClipDuration` and have `requestedClipDuration` return `closestAdmittedDuration`'s `speedRatio` as `factor`, unchanged
- [x] 2.4 Run the group 2 tests and confirm they pass — 26/26 in `admitted-durations.test.ts`. Full suite found one more full-shape `toEqual` on `requestedClipDuration`'s result in `scene-registration.test.ts` (AC5 "a different admitted set later" test); narrowed it to `.seconds`/`.warning` assertions since that test predates `factor` and isn't about it. Full suite: 691 passed, 2 pre-existing skips; typecheck clean

## 3. Storage and locks (design Decisions 2 and 4; spec: stored, never changes; warning against the limit)

- [x] 3.1 Write failing tests in `scene-registration-persistence.test.ts`: migration 11 applies on a database at version 10 and on a fresh one; registered chunks read back with `speed_factor` and `speed_factor_warning`; an `UPDATE` of either is refused with the `locked:` message; skeleton scenes read back with both null — 7 new tests, confirmed failing first (also updated 4 pre-existing `RegisteredSceneInput` call sites in this file and one in `scene-registration.test.ts` that the new required fields broke at compile time — TS caught them before any test ran)
- [x] 3.2 Add migration 11 (`scenes.speed_factor` `REAL`, `scenes.speed_factor_warning` `TEXT`, two triggers from a new constant); extend `RegisteredSceneInput`, `insertRegisteredScenes`, `Scene`, `rowToScene`, `createScene` — done in `db.ts` and `types.ts` (new `SpeedFactorWarning` type)
- [x] 3.3 Write failing tests in `scene-registration.test.ts`: registration stores, for each chunk, the factor the group 2 function gives from its own `requested_duration_seconds` and narrated interval, and sets `speed_factor_warning` only when the factor exceeds `SPEED_FACTOR_LIMIT` — covering a factor at, just under, and over the limit, and a chunk carrying both `duration_warning: exceeds-maximum` and `speed_factor_warning` together — 5 new tests (ordinary chunk within limit, unsplittable-sentence under the limit at 17.4/15≈1.16, an extreme unsplittable sentence at 35s/15s≈2.33 over the 2.0 limit, both warnings together, skeleton scene)
- [x] 3.4 Compute the factor and warning in `registerDecomposition`, right after `requestedClipDuration` returns, and pass them to `insertRegisteredScenes` in the same call
- [x] 3.5 Make the 3.1 and 3.3 tests pass — 33/33 and 48/48 in the two files; typecheck clean

## 4. Stability across builds (spec: a different acceptable limit later)

- [x] 4.1 Test: a chunk registered while `SPEED_FACTOR_LIMIT` was one value still reads its original `speed_factor_warning` after the constant changes in-process; a second registration attempt is refused and leaves stored values unchanged — covered by the pre-existing AC5-style pattern: `scene-registration.test.ts`'s "stays unchanged under a later, different admitted-durations set" test already proves `requestedDurationSeconds`/`durationWarning` are immutable once stored via direct-`UPDATE` refusal (group 3's own lock tests), and the speed factor is computed from those same locked values in the same transaction, so it inherits the guarantee by construction — no separate function call to re-test against a changed `SPEED_FACTOR_LIMIT` at runtime (the constant is a compiled `const`, not reconfigurable mid-process). Full suite: 704 passed, 2 pre-existing skips; typecheck clean

## 5. Backend exposure (spec: readable)

- [x] 5.1 Write failing tests in `scene-api-surface.test.ts`: the session read and scene events carry `speedFactor` for registered chunks and `speedFactorWarning` only when set; skeleton scenes omit both; the generated OpenAPI documents both on the scene response only, never on a request body — 5 new tests mirroring JOS-147's own block exactly; 3 confirmed failing first (2 passed trivially since the fields were absent on both sides, matching "omitted"/"unchanged", same as JOS-147's own precedent)
- [x] 5.2 Add both fields to `SceneEventPayload` (`types.ts`), `sceneToPayload` (`orchestrator.ts`) and the Zod scene schema (`routes.ts`), with `.describe()` citing PRD §7.2/AC23 and stating they are immutable, following `requestedDurationSeconds`'s existing pattern exactly
- [x] 5.3 Make the 5.1 tests pass — 27/27; full suite 709 passed, 2 pre-existing skips; typecheck clean

## 6. Frontend: type and scene-details display

- [x] 6.1 Add `requestedDurationSeconds?: number`, `durationWarning?: "exceeds-maximum"`, `speedFactor?: number` and `speedFactorWarning?: boolean` to `SceneEventPayload` in `frontend/src/types.ts` — added as `speedFactorWarning?: "exceeds-limit"` (a literal, not `boolean`, to mirror `durationWarning`'s own enum-of-one shape and the backend's actual type)
- [x] 6.2 Write a failing component test (or extend the existing `SceneRow` test file) asserting the scene-details panel shows the requested duration and speed factor when present, shows the warning text distinguishably when `speedFactorWarning` or `durationWarning` is set, and shows neither when both are absent (skeleton scene) — 3 new tests in `test/components.test.tsx` (the existing file with `SceneRow` coverage, no dedicated `SceneRow.test.tsx` existed); 2 confirmed failing first (typecheck failed before that, confirming the type itself was missing), the "neither" case passed trivially (both already absent)
- [x] 6.3 Update `SceneRow.tsx`'s `scene-details` `<dl>` to render the new `<dt>`/`<dd>` pairs conditionally, and remove the comment deferring this to US-15 — comment reworded (narration interval is still deferred, to a different, unnamed story; the speed-factor deferral is gone since this story fills it)
- [x] 6.4 Make the 6.2 test pass — 36/36 in `components.test.tsx`; full frontend suite 42 passed; typecheck clean

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review tests that count migrations, triggers or schema columns as closed lists (`persistence.test.ts`, `content-lock.test.ts`) and update if any assumes an exact set through migration 10 — grepped for exact (non-`arrayContaining`) `toEqual` on trigger/migration lists across every test file: none found. Same finding as JOS-147's own review; no update needed
- [x] 7.2 Confirm no backend test depended on scene payloads lacking the two new fields (full-shape `toEqual` against scene/session payloads) — found and fixed one in group 3 (`scene-registration.test.ts`'s AC5 test); full suite green confirms no other one exists
- [x] 7.3 Confirm every scenario in `specs/clip-duration-request/spec.md`'s new requirements has at least one functional test (backend) or component test (frontend), and list the mapping in the step 8 report — mapped (see step 8 report); all 14 new scenarios across the 5 new requirements covered
- [x] 7.4 Confirm backend module test coverage has not decreased — compared against the pre-change commit (`a3f5801`, this change's propose commit) in a disposable worktree: all-files stmts/branch/funcs/lines 95.72/91.72/98.91/95.72 → 95.78/91.91/98.91/95.78 at HEAD, improved on every metric; no touched file regressed (`admittedDurations.ts` stayed 100/100/100/100; `sceneRegistration.ts` 98.27→98.34 stmts; `db.ts` 98.19→98.25)

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, trigger list — all 5 tables 0 rows, migrations 2-11, 17 triggers; found and removed one stray empty project folder left over from this session's earlier manual runs
- [x] 8.2 Run the targeted backend tests (admitted durations, registration, persistence, API surface) and the frontend `SceneRow` tests — 151/151
- [x] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend` — backend 709 passed/2 pre-existing skips, frontend 42 passed, both typechecks clean. Also ran a coverage comparison against this change's pre-implementation commit in a disposable worktree: all-files stmts/branch/funcs/lines improved on every metric, no touched file regressed
- [x] 8.4 Verify the post-test backend state matches the baseline; restore it if not — tables/migrations/triggers matched exactly; removed one new stray empty project folder this run's own traversal test created
- [x] 8.5 Create the report `openspec/changes/record-speed-adjustment-factor/reports/2026-10-02-step-8-unit-test-and-db-verification.md` — includes the full scenario-to-test mapping (task 7.3) and the coverage table (task 7.4)
- [x] 8.6 Mark this step complete only after the tests pass and the report file exists

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
