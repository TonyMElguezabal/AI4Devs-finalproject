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

- [ ] 3.1 Define the typed `VisualInstructionGenerator` port: fragment texts in, one `{ image, video }` per fragment out, or a classified failure (transient / not retryable)
- [ ] 3.2 Write failing adapter tests against a mocked `fetch`: one request to chat completions with model `gpt-6-astra`, `response_format: json_object`, all fragment texts in order, the bearer credential, no retry
- [ ] 3.3 Write failing tests that the response is validated with Zod: exactly N pairs, each non-empty, otherwise an invalid-output failure
- [ ] 3.4 Write failing classification tests: 4xx except 408/429 not retryable; 408, 429, 5xx, a network error and the 20 s timeout transient; a missing credential fails without sending a request
- [ ] 3.5 Implement the adapter, reading `OPENAI_KEY` through `loadCredential`
- [ ] 3.6 Write an opt-in contract test against the real provider (runs only with `RUN_PROVIDER_CONTRACT_TESTS=1`), excluded from the default run
- [ ] 3.7 Run the group 3 tests and confirm they pass

## 4. Validation and registration (TDD) — Decisions 1, 5, 6

- [ ] 4.1 Write failing tests that valid fragments register chunks numbered 1..N in order, each with `PROMPT` equal to its fragment text and the generated `IMAGE` and `VIDEO`, all `submitted`, and that `instruction` equals `IMAGE` (Decision 3)
- [ ] 4.2 Write failing tests for each invalid decomposition: no fragments, an empty text, a duration below 5 s or above 15 s without a flag, a `script-below-lower-bound` flag on one of several fragments, a reconstruction mismatch, an incomplete instruction set; each leaves no chunks and records a `decomposition` failure whose cause does not blame the script
- [ ] 4.3 Write failing tests that the two §6.1.1 exceptions register, and that whitespace-only differences still reconstruct
- [ ] 4.4 Write a failing test that a provider failure records a `decomposition` failure with the retryability from the adapter and leaves no chunks
- [ ] 4.5 Write a failing test that invalid fragments never reach the instruction generator (validated first)
- [ ] 4.6 Write a failing test that a session that already has chunks is refused and its chunks are unchanged
- [ ] 4.7 Write a failing test that an unknown session is refused without writing anything
- [ ] 4.8 Implement `SessionFailure` (voice-over or decomposition), `registerDecomposition`, the validation, and the single-transaction insert
- [ ] 4.9 Run the group 4 tests and confirm they pass

## 5. Session state and representation (TDD) — Decision 6, AC5

- [ ] 5.1 Write failing tests that `deriveSessionState` returns `failed` with failed phase `decomposition` for a session with no chunks and a decomposition failure, and `chunks-processing` right after a successful registration
- [ ] 5.2 Write a failing test that `GET /sessions/:id` lists the chunks in ascending order with `prompt`, `imageInstruction` and `videoInstruction`, and the failed phase when registration failed
- [ ] 5.3 Implement both, publishing through the existing snapshot and live-update payloads; validate the response with the route's Zod schema
- [ ] 5.4 Run the group 5 tests and confirm they pass

## 6. API surface (TDD) — AC4

- [ ] 6.1 Write failing tests that no route deletes, reorders, splits or merges scenes, and that the correction route leaves `idx`, `prompt` and `run_id` unchanged even if the body names them
- [ ] 6.2 Make any change the tests require (none expected), then run the group 6 tests

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review existing tests that create or modify scenes for anything migration 7 now refuses, and update them — started in group 2: three migration fixtures (two in `content-lock.test.ts`, one in `voice-over-persistence.test.ts`) built a database with only `runs`, while every real database has `scenes` from the baseline schema; they now create the baseline `scenes` table, so migration 7 can alter it
- [ ] 7.2 Confirm every scenario in `specs/scene-registration/spec.md` has at least one functional test, and list the mapping in the step 8 report
- [ ] 7.3 Confirm module test coverage has not decreased
- [ ] 7.4 Run `npm run typecheck` (with `erasableSyntaxOnly`) and the server runtime-load test

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test state of the default test store: row counts, triggers, applied migrations, project folders
- [ ] 8.2 Run the targeted tests and capture the summary
- [ ] 8.3 Run the full suite and record totals, failures and runtime
- [ ] 8.4 Verify the post-test state matches the baseline; restore it if not
- [ ] 8.5 Write `openspec/changes/assign-scene-identifiers/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [ ] 8.6 Mark this step complete only after the tests pass and the report exists

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
