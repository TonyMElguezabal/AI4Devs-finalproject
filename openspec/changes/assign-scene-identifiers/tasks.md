# Tasks — Assign scene identifiers and visual instructions (JOS-144)

Tests come first throughout: each behaviour gets a failing test before the code that makes it pass, and every scenario in `specs/scene-registration/spec.md` has at least one functional test. Automated tests use a stub instruction generator or a mocked HTTP layer; the real reasoning provider is called only by the opt-in contract test (task 3.6), at most once.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-144-assign-scene-identifiers` from `feature/entrega-2-JAME` (MVP changes do not target `main`)
- [x] 0.2 Verify the branch was created and is the current branch — `feature/jos-144-assign-scene-identifiers` at `853d53d`

## 1. Gate and umbrella carve-out

- [x] 1.1 Confirm JOS-165's values in `backend/src/config/providers.ts`: `DECOMPOSITION_PROVIDER` (OpenAI `gpt-6-astra`), `SEGMENTATION_LOWER_BOUND_SECONDS` 5, `SEGMENTATION_UPPER_BOUND_SECONDS` 15, the decomposition phase limit 20 s, and that the credential `OPENAI_KEY` exists (name only) — all confirmed; `OPENAI_KEY` is in the local secrets file (key names read, no value)
- [x] 1.2 Confirm no existing test creates two scenes with the same `idx` in one session, so the unique index in migration 7 is safe — confirmed across all 17 `createScene` calls
- [x] 1.3 Remove the US-11 requirements from `decompose-script-into-chunks` (the identifier, visual-instruction, incomplete-structure and reconstruction requirements, and the matching tasks), leave a pointer to this change, and validate both changes — four requirements removed (12 remain), proposal, design Decisions 4 and 5, and tasks 7.1-7.3 and 7.5 updated; both changes validate

## 2. Persistence: columns, unique number, locks (TDD) — design Decisions 2, 3, 7

- [x] 2.1 Write failing tests for migration 7: `prompt`, `image_instruction`, `video_instruction` exist with empty defaults on a pre-existing scene, and re-running migrations is a no-op — `backend/test/scene-registration-persistence.test.ts`
- [x] 2.2 Write a failing test that a second scene with the same `(run_id, idx)` is refused by the store, and that the same number in two sessions is allowed
- [x] 2.3 Write failing tests that a raw update of `scenes.idx`, `scenes.prompt` or `scenes.run_id` and a raw delete of a scene are refused, each naming the field, while `image_instruction`, `video_instruction`, `instruction` and `status` still update
- [x] 2.4 Write a failing test that `resetAll()` empties `scenes` and leaves the scene delete trigger in place — also that a scene created after a reset is locked again
- [x] 2.5 Implement migration 7 (columns, unique index, triggers from named constants) and the `resetAll()` change — `SCENE_LOCK_TRIGGERS_DDL`, `SCENE_NO_DELETE_TRIGGER_DDL` and migration 7 in `backend/src/db.ts`; `Scene` gains `prompt`, `imageInstruction`, `videoInstruction`
- [x] 2.6 Run the group 2 tests and confirm they pass — 11/11 (10 failed before migration 7; the "same number in two sessions" test passed from the start as a guard); full suite 234/234, typecheck clean

## 3. Visual instructions port and OpenAI adapter (TDD) — Decision 4

- [x] 3.1 Define the typed `VisualInstructionGenerator` port: fragment texts in, one `{ image, video }` per fragment out, or a classified failure (transient / not retryable) — `VisualInstructionGenerator` in `backend/src/visualInstructions.ts`; results `success`, `failed_transient`, `failed_not_retryable`, `invalid_output`
- [x] 3.2 Write failing adapter tests against a mocked `fetch`: one request to chat completions with model `gpt-6-astra`, `response_format: json_object`, all fragment texts in order, the bearer credential, no retry — `backend/test/visual-instructions.test.ts`
- [x] 3.3 Write failing tests that the response is validated with Zod: exactly N pairs, each non-empty, otherwise an invalid-output failure — too few, too many, an empty or missing instruction, no `scenes` key, non-JSON content, no choices; instructions are trimmed
- [x] 3.4 Write failing classification tests: 4xx except 408/429 not retryable; 408, 429, 5xx, a network error and the 20 s timeout transient; a missing credential fails without sending a request — also that the reason never carries the raw error body or the credential
- [x] 3.5 Implement the adapter, reading `OPENAI_KEY` through `loadCredential`
- [x] 3.6 Write an opt-in contract test against the real provider (runs only with `RUN_PROVIDER_CONTRACT_TESTS=1`), excluded from the default run — `backend/test/visual-instructions.contract.test.ts`, skipped in the default run; executed once in step 9
- [x] 3.7 Run the group 3 tests and confirm they pass — 25/25 (the module was missing before), contract test skipped by default; typecheck clean. The full suite is 259 passed, 1 skipped when green, but `orchestrator.test.ts` (skeleton, JOS-179) fails intermittently with `waitFor timed out`: 7 of 12 runs at one point, 0 of 15 later, 1 of 12 on a scratch database, 0 of 12 on the base commit. It also fails with this group's tests excluded, and no file it exercises was changed by this change. Cause not found; recorded in the step 8 report and raised with the product owner

## 4. Validation and registration (TDD) — Decisions 1, 5, 6

- [x] 4.1 Write failing tests that valid fragments register chunks numbered 1..N in order, each with `PROMPT` equal to its fragment text and the generated `IMAGE` and `VIDEO`, all `submitted`, and that `instruction` equals `IMAGE` (Decision 3) — `backend/test/scene-registration.test.ts`; also one generator call with the session's language, the script unchanged, a chunk 1 per session, and an earlier decomposition failure cleared on success
- [x] 4.2 Write failing tests for each invalid decomposition: no fragments, an empty text, a duration below 5 s or above 15 s without a flag, a `script-below-lower-bound` flag on one of several fragments, a reconstruction mismatch, an incomplete instruction set; each leaves no chunks and records a `decomposition` failure whose cause does not blame the script — also a non-positive duration and a missing fragment
- [x] 4.3 Write failing tests that the two §6.1.1 exceptions register, and that whitespace-only differences still reconstruct — plus the exact bounds (5 s and 15 s) and a sentence split at a clause boundary
- [x] 4.4 Write a failing test that a provider failure records a `decomposition` failure with the retryability from the adapter and leaves no chunks
- [x] 4.5 Write a failing test that invalid fragments never reach the instruction generator (validated first)
- [x] 4.6 Write a failing test that a session that already has chunks is refused and its chunks are unchanged — also a session with a scene created some other way, and a lost race (the unique index refuses it and nothing of the losing registration is written)
- [x] 4.7 Write a failing test that an unknown session is refused without writing anything
- [x] 4.8 Implement `SessionFailure` (voice-over or decomposition), `registerDecomposition`, the validation, and the single-transaction insert — `backend/src/sceneRegistration.ts`; `SessionFailure` and `DecompositionFailure` in `types.ts`, `createDecompositionFailure` in `sessionStateMachine.ts`, `insertRegisteredScenes` (one transaction, clears the session failure) in `db.ts`
- [x] 4.9 Run the group 4 tests and confirm they pass — 29/29 (the module was missing before); full suite 288 passed, 1 skipped; typecheck clean

## 5. Session state and representation (TDD) — Decision 6, AC5

- [x] 5.1 Write failing tests that `deriveSessionState` returns `failed` with failed phase `decomposition` for a session with no chunks and a decomposition failure, and `chunks-processing` right after a successful registration — `backend/test/scene-registration-session.test.ts`
- [x] 5.2 Write a failing test that `GET /sessions/:id` lists the chunks in ascending order with `prompt`, `imageInstruction` and `videoInstruction`, and the failed phase when registration failed
- [x] 5.3 Implement both, publishing through the existing snapshot and live-update payloads; validate the response with the route's Zod schema — `deriveSessionState(scenes, failure)` (the failure argument is optional, so existing callers are unchanged), `sceneToPayload` and the scene Zod schema carry `prompt`, `imageInstruction`, `videoInstruction`; `broadcast` is exported and registration publishes after a success and after a failure
- [x] 5.4 Run the group 5 tests and confirm they pass — 9/9 (5 failed before; 4 describe unchanged behaviour and passed from the start); full suite 297 passed, 1 skipped; typecheck clean

## 6. API surface (TDD) — AC4

- [x] 6.1 Write failing tests that no route deletes, reorders, splits or merges scenes, and that the correction route leaves `idx`, `prompt` and `run_id` unchanged even if the body names them — `backend/test/scene-api-surface.test.ts`: no route path names split/merge/reorder/move/order/position/renumber; DELETE/PUT/PATCH on a scene and on the scene collection, and POST .../split, /merge, /reorder, /move answer 404 and change nothing; a correction body naming `index`, `idx`, `prompt` and `runId` changes only the instruction. They passed on first run (they prove an absence); a temporary DELETE scene route and a reorder route made 3 of them fail, then were reverted
- [x] 6.2 Make any change the tests require (none expected), then run the group 6 tests — no production change needed; 12/12

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review existing tests that create or modify scenes for anything migration 7 now refuses, and update them — started in group 2: three migration fixtures (two in `content-lock.test.ts`, one in `voice-over-persistence.test.ts`) built a database with only `runs`, while every real database has `scenes` from the baseline schema; they now create the baseline `scenes` table, so migration 7 can alter it The rest of the review found nothing else: the only other raw scene write in the tests (`session-read.test.ts`) updates `status`, which stays writable
- [x] 7.2 Confirm every scenario in `specs/scene-registration/spec.md` has at least one functional test, and list the mapping in the step 8 report — all 17 scenarios have a test; the mapping is in the step 8 report
- [x] 7.3 Confirm module test coverage has not decreased — measured against the base `853d53d`, each on a scratch database: all files lines 91.46% -> 93.04%, branches 82.28% -> 84.90%, functions 97.82% -> 98.09%; `db.ts` lines 97.63% -> 97.85%, branches 87.03% -> 87.93% (after removing three unreachable `?? ""` fallbacks this change had added); `orchestrator.ts` branches 74.62% -> 75.71%; `routes.ts` lines 74.60% -> 76.74%. `routes.ts` branch coverage shows 88.23% -> 85.00% only because V8 counts a handler's branches once it runs: no base test called `/pause`, this change's API test does, so the pause route's unknown-session branch now counts as uncovered. No previously covered branch lost its coverage
- [x] 7.4 Run `npm run typecheck` (with `erasableSyntaxOnly`) and the server runtime-load test — typecheck exit 0; `server-runtime-load.test.ts` passes (the server loads under real `node`)

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture the pre-test state of the default test store: row counts, triggers, applied migrations, project folders
- [x] 8.2 Run the targeted tests and capture the summary — 86 passed, 1 skipped (the opt-in contract test), 1.54 s
- [x] 8.3 Run the full suite and record totals, failures and runtime — 309 passed, 1 skipped, 5.18 s; the known intermittent orchestrator failure did not occur in this run and is documented in the report
- [x] 8.4 Verify the post-test state matches the baseline; restore it if not — counts, nine triggers, migrations and the unique index identical; an empty leftover test folder was removed
- [x] 8.5 Write `openspec/changes/assign-scene-identifiers/reports/2026-09-27-step-8-unit-test-and-db-verification.md`
- [x] 8.6 Mark this step complete only after the tests pass and the report exists

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch database and confirm it responds
- [ ] 9.2 Register a decomposition by calling `registerDecomposition` from a script against that database (no route triggers it, by decision); `GET /sessions/:id` shows the chunks 1..N with `prompt`, `imageInstruction` and `videoInstruction`, state `chunks-processing`
- [ ] 9.3 Register an invalid decomposition for another session; `GET` shows `failed`, failed phase `decomposition`, and no chunks
- [ ] 9.4 Try `DELETE`/`PUT`/`PATCH` on scene paths and a correction whose body names `idx` or `prompt`; with `sqlite3`, try updating `idx`/`prompt` and deleting a scene; record the refusals
- [ ] 9.5 Run the opt-in contract test once against the real reasoning provider and record the result and cost
- [ ] 9.6 Clean up through the test-only reset; confirm the scratch store is empty with all triggers and the default store untouched
- [ ] 9.7 Save `openspec/changes/assign-scene-identifiers/reports/YYYY-MM-DD-step-9-curl-endpoint-testing.md`

## 10. E2E Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: the session page lists scenes, so check that registered chunks appear in ascending order and that no control splits, merges, deletes or reorders them
- [ ] 10.2 Run it against the real backend and frontend on scratch resources, with chunks registered by script
- [ ] 10.3 Save `openspec/changes/assign-scene-identifiers/reports/YYYY-MM-DD-step-10-e2e.md`

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `docs/data-model.md`: `prompt`, `image_instruction`, `video_instruction`, `ID` = `idx` with its unique index, the chunk-lock triggers, and the decomposition failure on `runs.failure`
- [ ] 11.2 `docs/api-spec.yml`: add descriptions in the Zod schemas and regenerate from `GET /docs/json`
- [ ] 11.3 `docs/backend-standards.md`: the reasoning adapter and the registration entry point, if not already covered

## 12. Close out

- [ ] 12.1 Comment on JOS-140 how to call `registerDecomposition`, and on JOS-145 and JOS-157 that `instruction` and `image_instruction` coexist until JOS-145 switches the image stage
- [ ] 12.2 Update Linear with progress, decisions and agreements on the tickets touched
- [ ] 12.3 Open the PR against `feature/entrega-2-JAME` linking to JOS-144
- [ ] 12.4 Get a review from at least one human
- [ ] 12.5 Archive the OpenSpec change after merge
