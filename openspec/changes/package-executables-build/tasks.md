## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-205-packaged-build-script` from `main` (no upstream)
- [x] 0.2 Verify the current branch

## 1. Backend: Tests first (TDD)

- [x] 1.1 Test `verifyChecksum`: matching file passes; mismatching file throws a message naming file, expected and actual hash
- [x] 1.2 Test `resolveDataDir` for darwin, win32 (`%APPDATA%`), and `VID4YOU_DATA_DIR` override
- [x] 1.3 Test `sanitizeEnvironment` removes `ALLOW_TEST_ENDPOINTS` and every `USE_STUB_*` and keeps other variables
- [x] 1.4 Test the esbuild bundle step: bundle builds from the product tree, contains no `swagger-ui`, contains no smoke entry, and does not reference `openspec/`
- [x] 1.5 Test `credentials.ts` reads `SECRETS_PATH` when set and the old path otherwise; same for `providers.ts` with `SETTINGS_DEFAULTS_PATH`
- [x] 1.6 Test the single-instance probe against a local server answering `/health` and against a closed port
- [x] 1.7 Test that a macOS target on a non-macOS host fails before any download

## 2. Backend: Source changes

- [x] 2.1 Move the bootstrap of `server.ts` into `startServer()` in `backend/src/bootstrap.ts`; `server.ts` calls it when run directly (behavior of `npm start` unchanged)
- [x] 2.2 Add `SECRETS_PATH` to `config/credentials.ts` and `SETTINGS_DEFAULTS_PATH` to `config/providers.ts`; defaults unchanged
- [x] 2.3 Decide and pin the ffmpeg and ffprobe builds (open question in design); record source, version and license in `targets.ts`
- [x] 2.4 Add `backend/packaging/targets.ts` with the three targets, Node version and committed SHA-256 values
- [x] 2.5 Add `backend/packaging/verify.ts` and `runtimeEnv.ts`
- [x] 2.6 Add `backend/packaging/entry.ts` (and `instance.ts`, `smokeStubs.ts`, `noDocs.ts`): runtime environment first, single-instance probe, embedded static files served through `buildApp({ staticAssets })` so the existing Origin and Host policy covers them, `startServer()`, open browser
- [x] 2.7 Add `backend/packaging/build.ts`: frontend build, esbuild bundle with the swagger-ui alias, SEA blob, `postject` injection, ad-hoc signing on macOS, ffmpeg and ffprobe copy, `--smoke` flavor
- [x] 2.8 Add the `package:*` npm scripts, the `esbuild` and `postject` dev dependencies, and `dist-package/` to `.gitignore`

## 3. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 3.1 Review tests of `server.ts`, `credentials.ts`, `providers.ts` and `keyStore.ts` for assumptions the bootstrap move or the new variables change
- [x] 3.2 Update affected tests and make the new tests of group 1 pass

## 4. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 4.1 Capture pre-test database baseline (isolated `DB_PATH` and `PROJECTS_ROOT`)
- [x] 4.2 Run targeted tests for the packaging, credentials, providers and server modules
- [x] 4.3 Run `npm run typecheck`, `npm run lint` and `npm test` in `backend`
- [x] 4.4 Verify post-test database state and restore if needed
- [x] 4.5 Create report `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md`
- [x] 4.6 Mark step complete only after tests pass and the report exists

## 5. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Build the macOS arm64 executable and the `--smoke` flavor; start the smoke flavor on a clean data folder (AGENT MUST EXECUTE)
- [x] 5.2 curl `GET /health` returns `{"ok":true}`; `GET /docs` returns 404; a foreign `Host` or `Origin` returns 403
- [x] 5.3 Start with `ALLOW_TEST_ENDPOINTS=1` and `USE_STUB_VOICE_PROVIDER=success` on the release flavor and confirm both are ignored
- [x] 5.4 Run one stubbed session to `final-video` on the smoke flavor with curl and record each request and response
- [x] 5.5 Start a second instance and confirm it opens the first and exits (one process on the port, one database writer)
- [x] 5.6 Delete the test data folder and verify the state matches the baseline
- [x] 5.7 Document all commands and responses in `reports/YYYY-MM-DD-step-5-curl-endpoint-testing.md`

## 6. Frontend: E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 With the macOS arm64 executable running, navigate to `http://127.0.0.1:3100/` and confirm the interface loads from the embedded assets
- [x] 6.2 Create a session from the interface and confirm it appears (smoke flavor)
- [x] 6.3 Restore the data folder and document the scenarios in `reports/YYYY-MM-DD-step-6-e2e-browser.md`

## 7. Verification on the other targets

- [x] 7.1 Build macOS x64 and Windows x64 and confirm the output folders (`Vid4You`/`Vid4You.exe`, `ffmpeg`, `ffprobe`)
- [ ] 7.2 Windows executable started once on a real Windows machine by the product owner: health check, interface load, one stubbed session to `final-video`, second launch; result recorded in `reports/`
- [x] 7.3 Confirm a deliberately altered pinned checksum makes the build fail with no executable written

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 Update `readme.md` section 1.4 (packaged application) and 2.4 (known limitations) with the real build command; keep it in Spanish
- [x] 8.2 Update `docs/adr/0007-deployment.md` with the build command, the SEA/postject decision and the ffmpeg license note
- [x] 8.3 Add `SECRETS_PATH` and `SETTINGS_DEFAULTS_PATH` to the environment table in the README and to `docs/backend-standards.md` if it lists variables
- [x] 8.4 Run `graphify update .`
- [ ] 8.5 Open the pull request linking JOS-205; archive the change after merge
