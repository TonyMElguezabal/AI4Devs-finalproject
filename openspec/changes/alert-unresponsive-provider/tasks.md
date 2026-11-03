## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-246-alert-unresponsive-provider` from `origin/main` (`10eae28a`) with `--no-track`
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Backend: the `unresponsive` outcome (TDD; design Decision 2; JOS-257)

- [x] 1.1 Write failing tests in `backend/test` for `normalizeOutcome`: `timed-out` → `unresponsive`; any raw outcome with the `unresponsive` flag → `unresponsive`; `transient`, `transient_failure`, `success`, `late-success`, `not-retryable`, `not_retryable_failure` and an unknown value unchanged from today
- [x] 1.2 Add `unresponsive` to `NormalizedOutcome` and the flag to `normalizeOutcome` and `recordProviderCall` in `backend/src/telemetry/index.ts`; make 1.1 pass
- [x] 1.3 Confirm `outcome` is still on `ALLOWED_ATTRIBUTE_KEYS` (`infra/telemetry-relay/src/allowlist.ts`) and no new attribute key is sent; the allowlist test stays green

## 2. Backend: adapters mark a call that got no answer (TDD; design Decisions 1, 2; JOS-257)

- [x] 2.1 (result in design.md Decision 2 table; decomposition and alignment left to their time limit, Decision 7, decided with the owner) Trace, for each adapter, how a `failed_transient` result reaches `recordProviderCall`: image and clip through `insertProviderRequest` → `reportProviderRequest` (`db.ts:2380`); voice-over, narration timestamps and decomposition through stage-attempt completion (`db.ts:1912`). Record the hand-off per adapter in design.md Decision 2 before coding; use the `error_code` fallback only where no in-memory hand-off exists
- [x] 2.2 Write failing tests per adapter (fal image, RunningHub video, ElevenLabs voice; not alignment or decomposition, Decision 7): a `fetchFn` that rejects with `TimeoutError` → `failed_transient` with `unresponsive: true`; one that rejects with a connection error → same; one that answers 503 → `failed_transient` without the mark; a malformed 200 body → no mark
- [x] 2.3 Set `unresponsive: true` only in the `catch` directly around each `fetch(...)` call in `imageProvider.ts`, `videoProvider.ts` and `voiceProvider.ts`; make 2.2 pass with no change to the returned `kind` or `reason`
- [x] 2.4 Write failing tests that an unresponsive image request and an unresponsive voice-over attempt are recorded with `outcome="unresponsive"`, and a 503 with `outcome="transient"`; pass the mark through the hand-off found in 2.1 and make them pass
- [x] 2.5 Write a test that a refused connection to the reasoning provider is still recorded as `transient` (Decision 7)
- [x] 2.6 (JOS-260) Create the follow-up Linear ticket under JOS-246 for marking refused connections to the decomposition and alignment providers (Decision 7)
- [x] 2.7 Confirm the stored `provider_requests.mode` and `stage_attempts.outcome` values and the retry scheduling are unchanged for an unresponsive call (existing retry-policy tests stay green; add one assertion if none covers it)

## 3. Backend: timed-out attempts are reported (TDD; design Decision 3; JOS-257)

- [x] 3.1 Write a failing test: with `providerUsage` on, `timeOutAttempt` on an in-flight voice-over attempt records one provider call for `voice-over`, its provider and `unresponsive`, with latency `finished_at − sent_at`
- [x] 3.2 Write a failing test: a second `timeOutAttempt` on the same attempt, and a later `late-success` or `superseded` result, record no further provider call
- [x] 3.3 Record the call in `timeOutAttempt` only when the update changed a row, inside the same "telemetry never fails a write" guard the other paths use; make 3.1 and 3.2 pass

## 4. Infra: dashboard, alert rule and README (design Decisions 4, 5; JOS-258)

- [x] 4.1 Change the retry-rate query in `infra/grafana/dashboards/providers.json` from `outcome="transient"` to `outcome=~"transient|unresponsive"`; confirm it is the only query filtering on `transient`
- [x] 4.2 Create `infra/grafana/alerts/unresponsive-provider.json` (body format of the alert-rule provisioning API): query `sum by (provider, stage) (increase(vid4you_provider_calls_total{outcome="unresponsive", deployment_environment!="development"}[5m])) >= 3`, no data counted as OK, evaluated every 1 m, pending period 0, label `severity=critical`, summary naming the provider and the stage, routed to the contact point `vid4you-critical`
- [x] 4.3 Add a test (or extend the existing dashboard JSON test, if one exists) that parses the rule file and asserts the query, threshold, window, severity and contact point name, and that no `@` email address appears anywhere under `infra/grafana/`
- [x] 4.4 `infra/grafana/README.md`: a section on the alert: create the contact point `vid4you-critical` (email) by hand, import the rule, what it fires on, and its limits (opted-in installs only, about 1–3 minutes latency, one user's network outage can fire it); note that timed-out attempts now appear in the provider metrics and that the retry rate includes `unresponsive`

## 5. Backend: contract test from adapter to exporter (design Decision 6; JOS-259)

- [ ] 5.1 Write the test in `backend/test` with `setTelemetryExportersForTest` and the OpenTelemetry in-memory metric exporter, `providerUsage` consent on, scratch `DB_PATH` and `PROJECTS_ROOT`
- [ ] 5.2 Case 1: the real fal image adapter with a `fetchFn` that never resolves and a short `callTimeoutMs`, recorded through the real `insertProviderRequest`; after a forced metric flush the exporter holds `vid4you_provider_calls_total` for `image`, `Fal.ai`, `unresponsive`
- [ ] 5.3 Case 2: a real voice-over attempt timed out by `timeOutAttempt`; the exporter holds a data point for `voice-over`, `unresponsive`
- [ ] 5.4 Case 3: the fal adapter answering 503; the exporter holds `transient`, not `unresponsive`
- [x] 5.5 Update JOS-259 AC1 in Linear to match the in-process design (no spawned server, in-memory exporter)

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 6.1 Update the tests that assert the four normalised outcomes or the provider-call metrics (`backend/test` telemetry tests, provider-request and stage-attempt telemetry tests)
- [ ] 6.2 Map every scenario in `specs/app-telemetry/spec.md` and `specs/unresponsive-provider-alert/spec.md`, and JOS-257/JOS-258/JOS-259 acceptance criteria, to at least one test or to the step 9 live check; list the mapping in the step 7 report
- [ ] 6.3 Confirm module test coverage has not decreased (compare against this change's propose commit)

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 7.1 Capture the pre-test baseline of the default store: row counts per table, applied migrations, and `data/projects/` contents
- [ ] 7.2 Run the targeted tests from groups 1–5, each with a scratch `DB_PATH` and `PROJECTS_ROOT`
- [ ] 7.3 Run `npm run typecheck`, `npm run lint` and the full `npm test` in `backend`, and the relay tests in `infra/telemetry-relay`, with no `backend/.secrets.json`, no settings override and no vendor key in the environment
- [ ] 7.4 Verify the post-test state matches the baseline; restore it if not
- [ ] 7.5 Create the report `openspec/changes/alert-unresponsive-provider/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [ ] 7.6 Mark this step complete only after the tests pass and the report file exists

## 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Start the real server on a scratch store and scratch projects folder with `USE_STUB_VOICE_PROVIDER=hang`, the other stubs on success, and short retry delays
- [ ] 8.2 Create a session with curl; wait past the voice stage's time limit; `GET /sessions/:id` shows the voice-over attempt `timed-out` and the retry scheduled exactly as before this change
- [ ] 8.3 Restart with `USE_STUB_VOICE_PROVIDER=transient-failure`; the attempt is `transient` and retried as before
- [ ] 8.4 Check the local log file under the scratch store's `logs/` for the timed-out attempt; confirm no response body carries the script
- [ ] 8.5 Delete the scratch store and folder; confirm the default store is untouched. Save `openspec/changes/alert-unresponsive-provider/reports/YYYY-MM-DD-step-8-manual-endpoint-testing.md`

## 9. Live Grafana alert test (MANDATORY - needs the owner's Grafana Cloud access)

- [ ] 9.1 The agent prepares the exact steps and a build that emits `unresponsive` calls (a non-`development` test environment label, or a temporary copy of the rule without the `development` filter, removed afterwards)
- [ ] 9.2 With the owner: create the contact point `vid4you-critical` (email), import the rule and re-import `providers.json`
- [ ] 9.3 Produce 3 or more unresponsive calls for one provider within 5 minutes; confirm the alert fires as critical naming the provider and stage, the email arrives, and the alert resolves after 5 quiet minutes
- [ ] 9.4 In Explore, confirm the `outcome` and `deployment_environment` labels as named in the rule; fix the rule query in the repository if they differ
- [ ] 9.5 Save `openspec/changes/alert-unresponsive-provider/reports/YYYY-MM-DD-step-9-live-alert-test.md` with the date, what was fired, and the result; remove any temporary rule copy

## 10. E2E Testing with the browser (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Applicability: this change touches no frontend code and no page, so this step does not apply; record that in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 `infra/grafana/README.md`: checked against what was built in group 4 and the result of group 9; correct the "not yet checked against a live stack" note for the labels group 9 confirmed
- [ ] 11.2 `docs/development_guide.md` (telemetry section, if present) and `PRIVACY.md`: the `unresponsive` outcome value; no new data leaves the machine
- [ ] 11.3 `docs/PRD.md`: add the alert only if the PRD describes telemetry outcomes or alerting; otherwise record "no PRD change" in the step 7 report
- [ ] 11.4 Run `graphify update .`
- [ ] 11.5 Update JOS-257, JOS-258 and JOS-259 in Linear with the PR link
