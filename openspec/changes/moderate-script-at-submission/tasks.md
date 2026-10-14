## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-187-moderate-script-at-submission` from `origin/feature/entrega-2-JAME` (worktree `../AI4Devs-jos-187`)
- [x] 0.2 Verify the current branch and that the backend and frontend test suites pass before any change

## 1. Verify the moderation endpoint (gate: stop and escalate if it fails)

- [x] 1.1 Call `POST /v1/moderations` with the two JOS-165 step-7a disallowed inputs in English and in Spanish; record `flagged` and the true categories for each
- [x] 1.2 Call it with two clean scripts (English and Spanish) and confirm `flagged: false`
- [x] 1.3 Call it with the ~2,200-word AC04 script from `test/session-creation.test.ts` and record whether a single `input` string is accepted (design Decision 8)
- [x] 1.4 Record 5+ latency samples and the snapshot id the endpoint returns in `model`
- [x] 1.5 Write `specs/script-moderation/reports/YYYY-MM-DD-step-1-moderation-endpoint-verification.md` with the pinned model id, the chosen `MODERATION_MAX_TIME_SECONDS` and the raw verdicts (no credentials)
- [x] 1.6 If any step-7a input is not flagged, stop here and comment on JOS-187 for the product owner instead of continuing

## 2. Backend: Hardcoded values (TDD)

- [x] 2.1 Add failing assertions in `test/providerConfig.test.ts` for `SCRIPT_MODERATION` (`name: "OpenAI"`, pinned `model`) and `MODERATION_MAX_TIME_SECONDS`
- [x] 2.2 Add both constants to `src/config/providers.ts` with values and comments from the step-1 report
- [x] 2.3 Update the `NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED` comment to point to the submission gate as the resolution of the finding (value stays `false`)

## 3. Backend: Moderation adapter (TDD)

- [x] 3.1 Write failing tests in `test/script-moderation.test.ts` with a stubbed `fetchFn`: a not-flagged response → `clean`; a flagged response → `flagged` with exactly the true categories
- [x] 3.2 Add failing tests: script sent untrimmed, exactly one request, `model` and `Authorization` set from config and key
- [x] 3.3 Add failing tests for `unavailable`: timeout, network error, `429`, `500`, `400`, a `200` with no `results[0].flagged` boolean, and a missing credential; assert `reason` contains no key value and no raw body
- [x] 3.4 Implement `src/scriptModeration.ts` (`ModerationVerdict`, `ScriptModerator`, `createOpenAiScriptModerator`, `get/set/resetScriptModerator`) to pass 3.1–3.3
- [x] 3.5 Only if step 1.3 showed a size limit: add a failing test for array input with any-part-flags, then implement it — skipped: step 1.3 showed no size limit
- [x] 3.6 Add the adapter to `test/adapters-no-hidden-retries.test.ts` (one request on failure)

## 4. Backend: Gate in `POST /sessions` (TDD)

- [x] 4.1 Install a `clean` stub moderator in `test/setup.ts` `beforeEach`, next to the voice stub
- [x] 4.2 Write failing route tests: clean → `201` as today and the moderator called once with the exact script
- [x] 4.3 Write failing route tests: flagged → `422 { ok: false, reason }` naming the categories, no run in the DB, voice provider not called, script absent from `reason`
- [x] 4.4 Write failing route tests: unavailable → `503 { ok: false, reason }`, no run in the DB
- [x] 4.5 Write a failing route test: an invalid body (empty script, unsupported language) → `400` and the moderator is not called
- [x] 4.6 Implement the gate in `src/routes.ts` before `createRun`, declaring `422` and `503` in the route's response schema

## 5. Frontend: Refusal shown, input kept

- [x] 5.1 Add a test in `test/components.test.tsx` (or the existing App-level test) where `createSession` rejects with the 422 reason: the reason is shown, title/script/language keep their values, and no session view opens
- [x] 5.2 Make it pass; per the proposal, no production change is expected

## 6. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Review tests that call `POST /sessions` (`session-creation`, `session-end-to-end`, `session-api-surface`, `content-lock`, …) and confirm they pass with the default `clean` stub
- [x] 6.2 Confirm no test reaches the real moderation endpoint (run once with `OPENAI_KEY` unset and the secrets file moved aside, per the local-secrets memory)

## 7. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test DB baseline (session/run count) for the local `DB_PATH`
- [x] 7.2 Run the targeted tests (`script-moderation`, `session-creation`, `providerConfig`, `adapters-no-hidden-retries`)
- [x] 7.3 Run the full backend and frontend suites (`npm test` in each)
- [x] 7.4 Verify the post-test DB state matches the baseline; restore if needed
- [x] 7.5 Create `specs/script-moderation/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [x] 7.6 Mark complete only after the tests pass and the report exists

## 8. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Start the backend with the real `OPENAI_KEY`; note the DB baseline
- [x] 8.2 `POST /sessions` with a clean script → `201`; then delete the created session to restore the DB
- [x] 8.3 `POST /sessions` with a step-7a disallowed script → `422`, reason naming the categories; confirm no session was created
- [x] 8.4 `POST /sessions` with `OPENAI_KEY` invalid → `503`; confirm no session was created
- [x] 8.5 `POST /sessions` with an empty script → `400` (validation unchanged)
- [x] 8.6 Check `/docs/json` lists `422` and `503` on `POST /sessions`
- [x] 8.7 Verify the DB matches the baseline; write `specs/script-moderation/reports/YYYY-MM-DD-step-8-curl-endpoint-testing.md`

## 9. Frontend: E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Start the backend and frontend
- [x] 9.2 Submit a disallowed script through the start form: the refusal reason is shown and the fields keep their values
- [x] 9.3 Edit it to a clean script and submit: the session page opens in `submitted`
- [x] 9.4 Clean up the created session and restore the DB
- [x] 9.5 Write `specs/script-moderation/reports/YYYY-MM-DD-step-9-e2e-playwright.md`

## 10. Update Technical Documentation (MANDATORY)

- [x] 10.1 `docs/PRD.md`: §4.1 (scripts are checked at submission by the reasoning provider's moderation endpoint), §10.1 (content refusal now happens before the pipeline), §11 (moderation model and time limit), and mark the §11.3 open finding and its gap-table row resolved by JOS-187
- [x] 10.2 `docs/adr/0005-provider-selection.md`: append the resolution to Decision 5 and the Consequences entry; note the remaining exposure for §10.3 corrected instructions
- [x] 10.3 Regenerate/update `docs/api-spec.yml` for `422`/`503` on `POST /sessions`
- [x] 10.4 Confirm `docs/data-model.md` needs no change (no stored state added)
- [x] 10.5 Run `graphify update .` after the code changes

## 11. Close-out

- [ ] 11.1 Comment on JOS-187 with the decision taken (option 2) and the link to this change
- [x] 11.2 Commit on the feature branch; ask before pushing or opening the PR into `feature/entrega-2-JAME`
