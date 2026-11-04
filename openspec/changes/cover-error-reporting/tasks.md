## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-245-error-reporting-coverage` from `origin/feature/entrega-3-JAME` with `--no-track` (design Open Questions: it holds JOS-243's error log; `main` does not)
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Backend: 5xx route errors are reported (TDD; design D1; JOS-252)

- [x] 1.1 Write failing tests in `backend/test/route-error-reporting.test.ts` with `buildApp()` and `.inject()`, a test route that throws, and a capturing `setErrorLog`: a throw without status is answered 500 with the same body as today and reports `stage` `api`, `route` `POST /<pattern>`, `error.code` (else the name) and the plain message; a thrown error with `statusCode` 503 is reported; a Zod 400 and an `/admin/` 401 are not reported; the reported message and stack hold no text from the request body
- [x] 1.2 Add an optional `route` to `recordError` (local log field and OTLP attribute, not scrubbed) and `route` to `infra/telemetry-relay/src/allowlist.ts`; the relay tests stay green
- [x] 1.3 Add the `onError` hook to `buildApp` in `backend/src/server.ts`, before the routes; make 1.1 pass
- [x] 1.4 Add a pinning test with error consent on and `setTelemetryExportersForTest`: one OTLP record with `stage` `api` and `route`, only allowlisted keys

## 2. Backend: error triggers behind `VID4YOU_ERROR_TRIGGERS` (TDD; design D4)

- [x] 2.1 Write failing tests in `backend/test/error-triggers.test.ts`: without the variable both routes answer 404; with it, `route-crash` answers 500 and reports a message holding `synthetic` and the tag, with code `SYNTHETIC_ERROR`; a tag outside `^[A-Za-z0-9-]{1,40}$` answers 400; `unhandled-rejection` answers 202 (the rejection itself is pinned by the contract test in group 6, not in-process)
- [x] 2.2 Register the two routes in `buildApp` only when `process.env.VID4YOU_ERROR_TRIGGERS === "1"`; make 2.1 pass
- [x] 2.3 Restore the variable in the tests' teardown

## 3. Backend: `POST /telemetry/frontend-errors` (TDD; design D3; JOS-254 AC1, AC3–AC5)

- [x] 3.1 Write failing tests in `backend/test/frontend-error-endpoint.test.ts`: a valid report answers 204 and reports `stage` `frontend` with `kind` as the error code; a message of 1001 characters, a stack of 8001, an unknown `kind` and an extra field each answer 400 and report nothing; with consent off the log line is written and no OTLP record is sent
- [x] 3.2 Write a failing test for the limit with a fake clock: 50 reports in one window → 10 reported, 40 answered 204, one `warn`; the next window reports again
- [x] 3.3 Add the route and its Zod schemas next to `/telemetry/consent` in `backend/src/routes.ts`, with the module-level window and its `ponytail:` comment; expose a reset for tests; make 3.1 and 3.2 pass
- [x] 3.4 Check the route sits behind the origin policy (a request from another origin is refused as for every route)

## 4. Frontend: capture and fallback (TDD; design D3; JOS-254 AC1, AC2, AC4)

- [x] 4.1 Write failing tests for `reportFrontendError` in `frontend/src`: it posts only `kind`, `message` and `stack`; it cuts the message to 1000 and the stack to 8000; a non-`Error` reason is sent as `String(reason)`; a rejected `fetch` does not throw and sends nothing more
- [x] 4.2 Add `reportFrontendError` to `frontend/src/api/client.ts` and the request type to `frontend/src/types.ts`; make 4.1 pass
- [x] 4.3 Write failing tests for `ErrorBoundary`: a child that throws while rendering shows the fallback (heading and a "Reload" button found by role) and calls the reporter once with `render`; the button calls `window.location.reload`
- [x] 4.4 Add `frontend/src/components/ErrorBoundary.tsx` styled with the existing tokens; make 4.3 pass
- [x] 4.5 In `frontend/src/main.tsx`, add the `error` and `unhandledrejection` listeners once before `createRoot`, and wrap `<App />` in the boundary; add a test that dispatching each event calls the reporter with the right kind

## 5. Backend: catch audit (design D2; JOS-253)

- [x] 5.1 List every `catch` block and `.catch(` handler in `backend/src` with file, line and group (A–D, design D2) in `reports/YYYY-MM-DD-catch-audit.md`
- [x] 5.2 Group C without a comment: add a one-line comment saying why the error is not reported
- [x] 5.3 Group D in `db.ts`, `orchestrator.ts` and the phase files: add `recordError` with the stage when known, changing no `return` or `throw`; add a test where the module already tests that path; run the full backend suite
- [x] 5.4 Group D in the provider adapters, `retry/`, `config/`, `keyStore.ts` and the rest; same rule; run the full backend suite
- [x] 5.5 Complete the report with what changed per block and the counts per group

## 6. Backend: error contract test (TDD; design D5; JOS-255)

- [x] 6.1 Add `backend/test/fakeOtlpReceiver.ts` (`node:http` on port 0, collects `POST /v1/logs` JSON bodies, answers 200)
- [x] 6.2 (no change needed: `startWorkflowServer` already merges the map it is given into the child's env, and `stop()` already skips the kill when the process has exited) Let `startWorkflowServer` take the extra env (`VID4YOU_TELEMETRY_ENDPOINT`, `VID4YOU_ERROR_TRIGGERS`) and make `stop()` tolerate a process that already exited; the existing workflow tests stay green
- [x] 6.3 (mutation check: with the `onError` hook disabled both cases fail) Write `backend/test/error-reporting-contract.test.ts`, consent on: route crash, not-retryable image failure, frontend report, then unhandled rejection; wait for the exit; assert one `error` log line per class and at least one OTLP record per class with `error.code`, `stage` where it applies and `provider` `stub` for the image failure
- [x] 6.4 Same test with consent off: the log lines are there and the receiver got no log record
- [x] 6.5 (`ci.yml` runs `npm test` in `backend`, which picks the file up; about 11 s locally for both cases) Confirm it runs in the existing CI backend job with no new step, and record its run time

## 7. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 (no update needed: the telemetry, error-log, process-handler and workflow tests pass unchanged; `processHandlers.ts` now goes through `recordCaughtError` with the same fields) Review the telemetry tests (`telemetry*.test.ts`, `error-log.test.ts`) and the workflow tests for assumptions the `onError` hook or the harness change break; update them
- [x] 7.2 (`route` is the only new key; added to the allowlist, which `telemetry.test.ts` and `route-error-reporting.test.ts` both check) Check `telemetry.test.ts`'s allowlist assertion still covers the new paths (no new attribute keys)
- [x] 7.3 (the App tests render `<App />` directly, not `main.tsx`, so the boundary does not change them; 483 pass) Review the frontend tests that render `<App />` for the new boundary

## 8. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture a pre-test baseline of the Developer's `data/` store (session count, file list of `data/projects`)
- [x] 8.2 Run the targeted tests from groups 1–6 with scratch `DB_PATH` and `PROJECTS_ROOT`
- [x] 8.3 Run the full backend and frontend suites with scratch `DB_PATH` and `PROJECTS_ROOT`; run lint and type-check
- [x] 8.4 Verify the baseline is unchanged after the tests and restore it if needed
- [x] 8.5 Create `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`
- [x] 8.6 Mark this step complete only after the tests pass and the report exists

## 9. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the backend with literal scratch `DB_PATH` and `PROJECTS_ROOT`, `VID4YOU_ERROR_TRIGGERS=1` and `VID4YOU_TELEMETRY_ENDPOINT` pointed at a local fake receiver; guard that the server does not use `data/`
- [ ] 9.2 `POST /telemetry/frontend-errors` with a valid body → 204 and an `error` line in the scratch log
- [ ] 9.3 Error cases: oversized message, unknown `kind`, extra field → 400; 15 reports in a row → the 11th onward answer 204 and are not logged at `error`
- [ ] 9.4 `POST /dev/errors/route-crash` → 500 with today's body; with consent on, one record at the receiver
- [ ] 9.5 Restart without `VID4YOU_ERROR_TRIGGERS` → both trigger routes 404
- [ ] 9.6 Restore the consent value changed in 9.4 and remove the scratch folders
- [ ] 9.7 Document every command and response in `reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`

## 10. Frontend: E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Start the backend (scratch folders as in 9.1) and the frontend dev server
- [ ] 10.2 Open the app with `browser_navigate`; take a snapshot
- [ ] 10.3 With `browser_evaluate`, throw from a `setTimeout` and reject a promise unhandled; check two `frontend` lines in the scratch log
- [ ] 10.4 Try to force a render error from `browser_evaluate` (no test-only route is added); if one is found, check the fallback and the "Reload" button by snapshot and keyboard; if none exists, record that the boundary is covered by the 4.3 unit test
- [ ] 10.5 Restore the environment and close the browser
- [ ] 10.6 Document the scenarios in `reports/YYYY-MM-DD-step-10-e2e-playwright.md`

## 11. Live check on the Grafana stack (MANUAL with the Developer; design D6; JOS-256)

- [ ] 11.1 Run a `development` backend with error consent on, the real endpoint and `VID4YOU_ERROR_TRIGGERS=1`; send `POST /dev/errors/route-crash` with tag `jos-256-<date>`, and one not-retryable stage failure with the stub image provider
- [ ] 11.2 With the Developer's go-ahead and logged-in browser, find both in Loki (`service_name="vid4you"`, `detected_level="error"`) and check `stage`, `provider`, `error_code`, `service_version`
- [ ] 11.3 Open `release-health` with Environment = `development` and check the errors are counted
- [ ] 11.4 Record what was checked in `reports/YYYY-MM-DD-step-11-live-grafana-check.md`; correct `infra/grafana/README.md` ("not yet checked"), or fix the queries and add a note to task 8.3 of the archived observability change

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 Regenerate `docs/api-spec.yml` from the live OpenAPI (the new endpoint; no trigger routes)
- [ ] 12.2 `PRIVACY.md`: error reports now include 5xx route errors (with the route pattern) and frontend errors, with the size cap; `infra/grafana/README.md` lists the `route` label
- [ ] 12.3 `docs/backend-standards.md`: the catch rule (report, rethrow, or a one-line comment) and `VID4YOU_ERROR_TRIGGERS`
- [ ] 12.4 `docs/frontend-standards.md`: the error boundary, the fallback in the screen inventory, the reporter
- [ ] 12.5 Run `graphify update .`
- [ ] 12.6 Open the PR into `feature/entrega-3-JAME` explaining the architectural motivation, linking JOS-245 and JOS-252 to JOS-256 (after the Developer's go-ahead to push)
