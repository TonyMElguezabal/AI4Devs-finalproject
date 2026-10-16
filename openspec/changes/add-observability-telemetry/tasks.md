## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/add-observability-telemetry` from `origin/feature/entrega-2-JAME` with `--no-track` (worktree `AI4Devs-observability`)
- [ ] 0.2 Verify the branch has no upstream (`git branch -vv`), and push only with `git push -u origin feature/add-observability-telemetry`
- [ ] 0.3 Re-check that L3 (Origin/Host guard) and L6/L7 have not landed in a way that changes this plan (`git fetch`, `git branch -a | grep -iE "jos-|l3|origin-guard"`), and record the result in design.md § Context

## 1. Backend: Shared path scrubber (TDD, D11)

- [ ] 1.1 Write failing tests in `backend/test/redact-paths.test.ts`: POSIX path, Windows drive path, UNC path, home folder, user name, text with no path left unchanged
- [ ] 1.2 Implement `backend/src/util/redactPaths.ts` until the tests pass
- [ ] 1.3 Replace the local `redactPaths` in `orchestrator.ts` with the shared import, and confirm the existing assembly-failure tests still pass

## 2. Backend: Build identity and consent store (TDD, D3, D8)

- [ ] 2.1 Write failing tests for `config/build.ts`: defaults (`0.0.0-dev`, `development`, null tag), a valid channel, and an unknown channel falling back to `development`
- [ ] 2.2 Implement `backend/src/config/build.ts`
- [ ] 2.3 Write failing tests for the `telemetry_settings` migration and its accessors: a fresh store has all signals off, `answered: false` and a stable install ID; saving persists and survives reopening the store
- [ ] 2.4 Add the migration and `getTelemetrySettings` / `saveTelemetryConsent` to `db.ts`

## 3. Backend: Telemetry module (TDD, D1, D2, D13)

- [ ] 3.1 Add the `@opentelemetry/*` packages listed in D1 and `pino` as direct dependencies, pinning exact versions that are at least two weeks old
- [ ] 3.2 Write failing tests in `backend/test/telemetry.test.ts` using in-memory exporters through `setTelemetryExportersForTest`:
  - each `record*` function is a no-op when its consent flag is off;
  - it records the documented metric or log record when the flag is on;
  - resource attributes match D13;
  - every exported attribute key is in `ALLOWED_ATTRIBUTE_KEYS`, imported from `infra/telemetry-relay/src/allowlist.ts`;
  - turning a flag off stops recording without a restart;
  - outcome normalisation covers every `StageAttemptOutcome` and `ProviderOutcomeMode`
- [ ] 3.3 Write a failing test proving an unreachable endpoint never throws into the caller and logs at most once per minute
- [ ] 3.4 Implement `backend/src/telemetry/` (consent cache, lazy providers, `recordProviderCall`, `recordError`, `recordProductEvent`, flush on shutdown) until 3.2–3.3 pass

## 4. Backend: Hooks into provider recording and the process (TDD, D4)

- [ ] 4.1 Write failing tests:
  - completing a voice-over attempt records one call with the run's provider, its latency and voice characters equal to the script length;
  - a refused second completion records nothing;
  - a `not-retryable` completion also records one error
- [ ] 4.2 Change `completeStageAttempt` to `UPDATE … RETURNING` and call `recordProviderCall` / `recordError`
- [ ] 4.3 Write failing tests:
  - `insertProviderRequest` for a `video` `success` records the scene's video provider and its requested seconds;
  - for an `image` `success` it records one image;
  - a `not_retryable_failure` records an error
- [ ] 4.4 Add the hook to `insertProviderRequest`
- [ ] 4.5 Write failing tests for product events:
  - app start counted once at boot;
  - session creation counted;
  - a session reaching `final-video` counted once
- [ ] 4.6 Wire the product events (boot, session-creation route, the final-video transition) and register `uncaughtException` / `unhandledRejection` handlers that call `recordError` and then keep today's behavior

## 5. Backend: Local log file and endpoints (TDD, D5, D9)

- [ ] 5.1 Write failing tests for `telemetry/logFile.ts`:
  - lines are appended;
  - the file rotates when it passes the size limit, using a small limit injected in the test;
  - no more than 5 rotated files are kept
- [ ] 5.2 Implement the rotating stream and pass a Pino multistream (stdout and file) to `buildApp` as `loggerInstance`, with the folder at `dirname(DB_PATH)/logs`
- [ ] 5.3 Write failing route tests for `GET/PUT /telemetry/consent`: defaults, a valid save returning `200`, an invalid body returning `400` with the store unchanged
- [ ] 5.4 Add the routes with Zod schemas in `routes.ts`
- [ ] 5.5 Write failing tests for `telemetry/updateCheck.ts`, with `fetch` injected:
  - production with a newer tag returns available;
  - the same tag returns not available;
  - UAT picks the first pre-release;
  - a timeout or network error returns not available;
  - `development` makes no request
- [ ] 5.6 Implement the update check, start it at boot without blocking `listen`, and add `GET /app/update`

## 6. Infrastructure: Telemetry relay (TDD, D6, D7)

- [ ] 6.1 Scaffold `infra/telemetry-relay/` (`package.json`, `wrangler.jsonc` with the rate-limit binding and the `otel.vid4you.download` custom domain, `tsconfig.json`, `src/allowlist.ts`)
- [ ] 6.2 Write failing tests in `infra/telemetry-relay/test/relay.test.ts`, calling the handler with a fake `env` and a stubbed `fetch`:
  - a valid JSON export is forwarded with Basic auth and the upstream status is returned;
  - the result for each refused case: wrong path `404`, wrong method `405`, protobuf `415`, more than 256 KB `413`, rate limited `429`;
  - an unknown attribute is stripped before forwarding;
  - the token never appears in any response
- [ ] 6.3 Implement `infra/telemetry-relay/src/index.ts` until the tests pass
- [ ] 6.4 Add `.github/workflows/telemetry-relay.yml` (push to `main` on `infra/telemetry-relay/**` and `workflow_dispatch`: `npm ci`, `vitest run`, `wrangler deploy`), with action versions pinned to commit SHAs
- [ ] 6.5 Once the product owner has created the Grafana stack, the token and the GitHub secrets (Open Questions), deploy, then `curl` the relay with a sample export and confirm it appears in Grafana Explore. Record the result in `reports/`

## 7. Frontend: Consent dialog and update banner (TDD, D10)

- [ ] 7.1 Add `getTelemetryConsent`, `saveTelemetryConsent` and `getAppUpdate` to `frontend/src/api/client.ts`, with types in `types.ts`
- [ ] 7.2 Write failing tests for `TelemetryConsentDialog`:
  - it opens when `answered: false` and stays closed when answered;
  - all three boxes start unchecked;
  - Save sends the chosen values;
  - the privacy sentence is present
- [ ] 7.3 Implement `TelemetryConsentDialog.tsx`, and add the "Privacy" button to `TopBar.tsx` that reopens it
- [ ] 7.4 Write failing tests for `UpdateBanner`: hidden when not available; shown with the release link when available; Dismiss hides it
- [ ] 7.5 Implement `UpdateBanner.tsx` and mount both components in `App.tsx`

## 8. Dashboards (D12)

- [ ] 8.1 Create `infra/grafana/dashboards/release-health.json`, `providers.json` and `usage.json` with datasource variables and the price constants
- [ ] 8.2 Write `infra/grafana/README.md` (how to import, where to update prices)
- [ ] 8.3 Import the dashboards into the Grafana Cloud stack that is receiving the 6.5 test data and confirm every panel renders. Record the result in `reports/`

## 9. Packaging check

- [ ] 9.1 Bundle the backend with the L6 proof-of-concept builder (`openspec/changes/define-production-deployment/poc/local/build.mjs`), run the executable with a local OTLP receiver as `VID4YOU_TELEMETRY_ENDPOINT` and every signal on, and confirm that metrics and an error record arrive and that the log file is written. Record the result in `reports/`

## 10. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [ ] 10.1 Review the tests that touch `completeStageAttempt`, `insertProviderRequest`, `buildApp` and the assembly-failure cause strings. Update any that assert the old `redactPaths` output or the logger options
- [ ] 10.2 Make sure every new test uses an isolated `DB_PATH` and resets state in `beforeEach`

## 11. Backend: Run Unit Tests and Verify Database State (MANDATORY - AGENT MUST EXECUTE)

- [ ] 11.1 Capture a pre-test baseline of the manual-testing store: table list, `telemetry_settings` row, run count
- [ ] 11.2 Run the targeted tests (`redact-paths`, `telemetry`, `log-file`, `update-check`, the consent routes, the relay)
- [ ] 11.3 Run the full suites: `backend` `npx tsc --noEmit && npx vitest run`; `frontend` `npm run typecheck && npm test`; `infra/telemetry-relay` `npx vitest run`
- [ ] 11.4 Verify the post-test state matches the baseline, and restore it if not
- [ ] 11.5 Create the report `openspec/changes/add-observability-telemetry/reports/YYYY-MM-DD-step-11-unit-test-and-db-verification.md`
- [ ] 11.6 Mark this step complete only after the tests pass and the report exists

## 12. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Start the backend on a separate `DB_PATH` and `PROJECTS_ROOT`, and capture the `telemetry_settings` row
- [ ] 12.2 `curl` `GET /telemetry/consent` and confirm the defaults
- [ ] 12.3 `curl` `PUT /telemetry/consent` with a valid body, then with invalid bodies (missing key, non-boolean); confirm `200` and `400`, then restore the original row
- [ ] 12.4 `curl` `GET /app/update` with the channel `development`, then with `VID4YOU_CHANNEL=production` and an old `VID4YOU_RELEASE_TAG`; confirm both responses
- [ ] 12.5 With a local OTLP receiver and every signal on, run one stubbed session to `final-video`. Confirm the provider-call, billed-unit and final-video metrics arrive and that the attributes contain no title, script or path
- [ ] 12.6 Confirm the log file exists under `logs/` beside the store
- [ ] 12.7 Document every command and response in `reports/YYYY-MM-DD-step-12-curl-endpoint-testing.md`, and verify the store matches the baseline

## 13. Frontend: E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 13.1 Start the backend and frontend on a fresh store
- [ ] 13.2 Load the page; confirm the consent dialog shows with all boxes unchecked and the privacy sentence
- [ ] 13.3 Turn on two signals and save; reload; confirm the dialog stays closed; reopen it from "Privacy" and confirm the saved values
- [ ] 13.4 Restart the backend with `VID4YOU_CHANNEL=production` and an old tag; confirm the update banner and its link; dismiss it
- [ ] 13.5 Check keyboard access: focus is trapped in the dialog and Escape closes it without saving
- [ ] 13.6 Restore the environment and document the run in `reports/YYYY-MM-DD-step-13-e2e-browser.md`

## 14. Update Technical Documentation (MANDATORY)

- [ ] 14.1 `docs/api-spec.yml`: add `GET/PUT /telemetry/consent` and `GET /app/update`
- [ ] 14.2 `docs/data-model.md`: add `telemetry_settings`
- [ ] 14.3 `docs/backend-standards.md`:
  - in § Logging and Diagnostics: the log files, telemetry through `telemetry/` only, and what a signal may never contain;
  - in § Technology Stack: the OpenTelemetry packages;
  - in § Deployment: the `VID4YOU_*` build variables
- [ ] 14.4 `docs/frontend-standards.md`: the consent dialog and the update banner in the screen inventory
- [ ] 14.5 `docs/development_guide.md`: how to point telemetry at a local OTLP receiver; the relay deploy; the dashboard import
- [ ] 14.6 Draft the PRD addendum (consent prompt and privacy note) for product-owner approval
- [ ] 14.7 Run `graphify update .` after the code changes
