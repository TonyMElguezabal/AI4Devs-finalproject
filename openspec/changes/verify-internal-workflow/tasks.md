## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-243-internal-workflow-verification` from `origin/feature/entrega-3-JAME` (`69dde226`) with `--no-track`
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Backend: the stub assembly tool writes its output (TDD; design D4)

- [x] 1.1 (`backend/test/stub-assembly-slow.test.ts`) Write failing tests in `backend/test`: `createStubAssemblyTool({ kind: "success" })` and `slow-success` leave a non-empty file at `input.outputPath` (its folder created if missing) and keep a file already there; `transient-failure` and `not-retryable-failure` leave none
- [x] 1.2 Make `success` and `slow-success` write a fixed placeholder before they return, unless a file is already there; make 1.1 pass
- [x] 1.3 (first run: 3 failures in `final-video-download.test.ts` and `assembly-failure-recovery.test.ts`, which write real bytes then call the stub; fixed by keeping an existing file, spec and design D4 updated; second run 2640 passed, 11 skipped) Run the full backend suite with scratch `DB_PATH` and `PROJECTS_ROOT`; fix any test that relied on the stub writing nothing (design Risks)

## 2. Backend: one copy of the decomposition stubs (design D3)

- [x] 2.1 (`backend/test/decomposition-stub-factories.test.ts`) Write failing tests for `createStubInstructionGenerator()` (one image and one video instruction per text) and `createStubAlignmentProvider()` (one timestamp per character, the last ending at or before 0.96 s)
- [x] 2.2 Add them to a new `backend/src/decompositionStubs.ts`, moved from `packaging/smokeStubs.ts`; make 2.1 pass
- [x] 2.3 (`packaging-build.test.ts` checks the `smoke-stubs` marker, which stays in the smoke file only) Make `packaging/smokeStubs.ts` use them; the packaging tests (including the one asserting a release build has no smoke stubs) stay green
- [x] 2.4 Leave `backend/test/decompositionStubs.ts` as it is (it counts calls and uses its own step)

## 3. Backend: `USE_STUB_DECOMPOSITION` and `USE_STUB_SCRIPT_MODERATION` (TDD; design D1, D2; JOS-247)

- [x] 3.1 (`backend/test/provider-stub-variables.test.ts`; unknown values are returned as warnings and logged at boot) Write failing tests for `configureProviderStubs(env)`: with `USE_STUB_DECOMPOSITION=success` the reasoning and alignment registries default to `stub-reasoning` and `stub-alignment`; with it unset or empty, both registries are the profile-built ones (as before); with any other value the registries are unchanged and a warning is returned or logged
- [x] 3.2 Same tests for `USE_STUB_SCRIPT_MODERATION=clean`: the moderator answers `clean` for any script; unset keeps the real moderator
- [x] 3.3 (passed at once: `telemetryProviderOf` has had the `stub-` rule since JOS-213; kept as a pinning case in `telemetry-provider-name.test.ts`) Write a failing test: a decomposition attempt bound to `stub-reasoning` is reported to telemetry with `provider` `stub` (JOS-247 AC3)
- [x] 3.4 Write failing tests in `backend/test/stage-diagnostics.test.ts`: `stub-reasoning` (instructions) and `stub-alignment` (timestamps) show as `Stub provider` with the identifier as the model, and are not logged as unknown; an unknown identifier without the prefix stays `Unknown provider`
- [x] 3.5 Replace the three exact stub entries in `describeProvider`'s display maps with a `stub-` prefix rule checked after the profile lookup; make 3.4 pass with the existing stub assertions unchanged
- [x] 3.6 (full suite: 2650 passed, 11 skipped) Implement `configureProviderStubs(env)` in `backend/src/server.ts` next to `configureAssemblyTool`, call it from `startServer`, and add its comment to the `USE_STUB_*` comments in `bootstrap.ts`; make 3.1–3.3 pass
- [x] 3.7 Reset the registries and the moderator in the new tests' teardown so no other test sees the stubs
- [x] 3.8 (found by task 5.5: `resolveBoundAdapter` returns the injected dependency when the bound id is the registry default) Write a failing test that after `USE_STUB_DECOMPOSITION=success` the decomposition dependencies are the same stub instances the registries hold; install them through `setDecompositionDependencies` too, and reset them in teardown

## 4. Backend: reported errors reach the local log file (TDD; design D5)

- [x] 4.1 (`backend/test/error-log.test.ts`; also: the redacted stack of an uncaught error, and a failing log never throws) Write failing tests in `backend/test`: with an error-log sink set and error consent off, `recordError` calls the sink once at `error` with `stage`, `provider`, `outcome`, `errorCode` and the path-redacted message, and emits no OTLP record; with consent on it does both; with no sink set it writes nothing and behaves as today
- [x] 4.2 (`setErrorLog`) Add the sink setter to `backend/src/telemetry/index.ts` and call the sink in `recordError` before the consent check; make 4.1 pass
- [x] 4.3 Set the sink to `app.log` in `startServer` after `buildApp`
- [x] 4.4 (it failed: `reportStageAttempt` and `reportProviderRequest` in `db.ts` returned early with no consent on; the early returns are removed, design D5) Write a failing test, then make it pass: a not-retryable image request recorded through `insertProviderRequest` writes an `error` line with `stage` `image` to a test logger (spec "Permanent stage failure with consent off")
- [x] 4.5 (full suite: 2656 passed, 11 skipped) The existing telemetry tests (`recordError`, process handlers, the contract tests) stay green with no change to what is exported

## 5. Backend: workflow harness and end-to-end test (design D6; JOS-248)

- [x] 5.1 Add `backend/test/workflowServer.ts`: scratch folder under `tmpdir()`, `spawn` of `node src/server.ts` with `PORT=0`, `NODE_ENV=development`, `DB_PATH`, `PROJECTS_ROOT`, `SETTINGS_PATH`, `SECRETS_PATH`, `VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:9`, zero retry delays and caller-given stub variables; port read from Fastify's `Server listening at` line; `stop()` kills the child, waits for its exit, and removes the scratch folder
- [x] 5.2 (`backend/test/workflow-wait-for.test.ts`) Add `waitFor(read, done, { timeoutMs, intervalMs })`: polls, and when the bound is reached throws with the last value read; a unit test proves it gives up and names the last state (spec "A stuck session fails the test in bounded time")
- [x] 5.3 Write `backend/test/workflow-end-to-end.test.ts`: every stub on, `POST /sessions`, wait for `state` `final-video` and four phases `complete`, `GET /sessions/:id/download/final-video` answers 200 with a non-empty body
- [x] 5.4 In the same test, record `backend/data/` (entries and mtimes) before and compare after; `stop()` runs in `finally`/`afterEach`, and the test asserts the scratch folder is gone
- [x] 5.5 (two causes: the stub's native timestamps outran the ~1 s stub narration for a long script, so the script is now at most 19 characters, design D6; and the real alignment adapter answered under `stub-alignment`, fixed in task 3.8, design D1) Make 5.3 pass; if a step fails, fix the cause in the product or the stubs (update this file and the design first, per CLAUDE.md §7), never by loosening the assertion
- [x] 5.6 (5/5 passed, 5.54–5.58 s each; no scratch folder left, including after the two failed runs) Run it 5 times in a row locally to check for flakiness; record the runtimes in the step 8 report

## 6. Backend: permanent stage failure test (design D6; JOS-249)

- [x] 6.1 Write `backend/test/workflow-stage-failure.test.ts` on the same harness with `USE_STUB_IMAGE_PROVIDER=not-retryable-failure`: wait until every scene is `failed` with `affectedStage` `image`; assert the `assembly` phase is `pending` and `finalVideoUrl` is absent
- [x] 6.2 Read `logs/vid4you.log` in the scratch folder and assert a JSON line with `level` 50 and `stage` `image`
- [x] 6.3 (passed at once, 5.6 s; with `setErrorLog(app.log)` taken out of `bootstrap.ts` it fails on the log assertion, so it guards group 4) Make 6.1 and 6.2 pass; scratch folder removed and server stopped as in 5.4

## 7. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [ ] 7.1 Review the tests that use `createStubAssemblyTool`, `installSmokeStubs`, `setScriptModerator`, the reasoning and alignment registry setters, and `recordError`; update any that the changes in groups 1–4 make wrong, and record each change in the step 8 report
- [ ] 7.2 Confirm the backend coverage of the touched modules does not decrease (`npm run test -- --coverage` before and after, or the project's coverage command); record both numbers

## 8. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline of the Developer's `backend/data/` (database row counts for `runs` and `stage_attempts`, the `projects/` entries) without changing it
- [ ] 8.2 Run the targeted tests (groups 1–6) with scratch `DB_PATH` and `PROJECTS_ROOT`
- [ ] 8.3 Run `npm run typecheck`, `npm run lint` and the full `npm test` in `backend/`, with scratch `DB_PATH` and `PROJECTS_ROOT`
- [ ] 8.4 Run the full suite again in a fresh worktree with no `backend/.secrets.json`, to rule out local secrets masking a failure
- [ ] 8.5 Verify the post-test state of `backend/data/` matches 8.1; restore it if not, and document the restoration
- [ ] 8.6 Create report `openspec/changes/verify-internal-workflow/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [ ] 8.7 Mark this step complete only after the tests pass and the report exists

## 9. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start `node src/server.ts` on a scratch `DB_PATH`, `PROJECTS_ROOT`, `SETTINGS_PATH` and `SECRETS_PATH`, with every `USE_STUB_*` variable on and `NODE_ENV=development`
- [ ] 9.2 `curl -X POST /sessions` with a short script: 201, no request to OpenAI (the log shows `stub-*` providers only)
- [ ] 9.3 `curl GET /sessions/:id` until `final-video`; `curl GET /sessions/:id/download/final-video`: 200 with a non-empty body
- [ ] 9.4 Restart with `USE_STUB_IMAGE_PROVIDER=not-retryable-failure`; create a session; `GET /sessions/:id` shows the scenes failed on `image` and `assembly` `pending`; `logs/vid4you.log` has the `error` line
- [ ] 9.5 Error cases: start with `USE_STUB_DECOMPOSITION=bogus` and confirm the boot warning; `GET /sessions/<unknown ulid>` answers 404
- [ ] 9.6 Stop the server, delete the scratch folder, confirm `backend/data/` is unchanged
- [ ] 9.7 Document the commands and responses in `openspec/changes/verify-internal-workflow/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Applicability: this change touches no frontend code and no page, so this step does not apply; record that in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `backend/README.md`, `docs/development_guide.md` and `readme.md`: add `USE_STUB_DECOMPOSITION` and `USE_STUB_SCRIPT_MODERATION` to the `USE_STUB_*` lists; say that the stub assembly writes a placeholder file; name the two workflow tests and how to run them
- [ ] 11.2 `docs/development_guide.md` (telemetry or logging section, if present): errors reported to telemetry are also written to the local log; `PRIVACY.md` already covers the local log file, so confirm it needs no change
- [ ] 11.3 `docs/api-spec.yml` and `docs/data-model.md`: no endpoint or schema change; record "no change" in the step 8 report
- [ ] 11.4 Run `graphify update .`
- [ ] 11.5 Open the PR against `feature/entrega-3-JAME` (after asking); it states the architectural motivation and the accepted product change of design D5; update JOS-247, JOS-248 and JOS-249 in Linear with the PR link
