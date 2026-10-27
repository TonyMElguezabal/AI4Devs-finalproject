## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-213-telemetry-provider-name` created from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-213` (done by `/opsx:propose`)
- [ ] 0.2 `git fetch`; confirm it is the current branch of that worktree, has no upstream, and `origin/main` has not moved past its base (merge it in if it has)

## 1. Gate

- [ ] 1.1 Confirm design.md § Context still holds: `reportStageAttempt` and `reportProviderRequest` are the only places that set `provider` for telemetry; assembly records `providerId: null`; the stub and legacy identifiers are as listed; `PARAMETER_SHAPES` has the five adapter types.
- [ ] 1.2 Check whether `db.ts` can import `config/providers.ts` without a side effect; if not, take the fallback in design.md § Risks.

## 2. Backend: vendor per adapter type (TDD; design Decision 1)

- [ ] 2.1 Write a failing test: `ADAPTER_VENDORS` maps each adapter type to `OpenAI`, `ElevenLabs`, `Fal.ai` or `RunningHub`, and covers every key of `PARAMETER_SHAPES`.
- [ ] 2.2 Add `ADAPTER_VENDORS` to `backend/src/providerTypes.ts`. Make 2.1 pass.

## 3. Backend: report the vendor (TDD; design Decisions 2, 3)

- [ ] 3.1 Write failing tests in `telemetry-hooks.test.ts` (spec scenarios): seeded decomposition, voice-over, timestamps (native and forced alignment), image and clip report `OpenAI`, `ElevenLabs`, `ElevenLabs`, `Fal.ai`, `RunningHub` (AC1, AC2); the two legacy identifiers report `Fal.ai` and `RunningHub`; an `/admin` profile with a ULID id and a typed label reports its vendor and neither value is exported; assembly reports `local`; a stub reports `stub`; an unmapped identifier reports `unknown` and is not exported (AC3); a not-retryable clip error record carries `RunningHub`.
- [ ] 3.2 Add `telemetryProviderOf` to `db.ts` and use it in `reportStageAttempt` and `reportProviderRequest`. Make 3.1 pass.

## 4. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [ ] 4.1 Update the existing `telemetry-hooks.test.ts` cases that store fake identifiers (`elevenlabs`, `fal`, `runninghub`) to store the real seeded ids, so they assert the vendor names; confirm `telemetry.test.ts`'s allowlist test passes unchanged (AC4).

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 5.1 Capture the pre-test baseline of the local database (`provider_profiles` rows, `stage_attempts` and `provider_requests` counts)
- [ ] 5.2 Run the targeted tests from groups 2 and 3
- [ ] 5.3 Run the full backend suite and lint in this worktree with their own scratch `DB_PATH` and `PROJECTS_ROOT`
- [ ] 5.4 Verify the post-test database state matches the baseline and restore if needed
- [ ] 5.5 Create report `openspec/changes/report-stable-provider-name/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [ ] 5.6 Mark this group complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 6.1 Start the backend on a copy of the local database with stub providers and telemetry pointed at a local OTLP capture (or the console exporter), with `providerUsage` and `errors` consent turned on via `PUT /telemetry/consent`
- [ ] 6.2 Run a session through to the final video with `curl`; confirm the captured `vid4you_provider_calls_total` points carry only `stub` and `local`, and no stored identifier
- [ ] 6.3 Insert one attempt row for each seeded profile and legacy identifier on the database copy and complete it through the store; confirm the captured `provider` values match the spec table
- [ ] 6.4 Restore consent; document commands and captured points in `reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`; remove the database copy

## 7. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 7.1 Not applicable to the page: no frontend change. Instead, after the PR build runs against the owner's Grafana stack, re-import `infra/grafana/dashboards/providers.json` and confirm the provider panels show one series per vendor (AC5); record the result in `reports/YYYY-MM-DD-step-7-grafana-check.md`. If the owner's stack is not reachable from this session, record that and leave the check for the owner.

## 8. Update Technical Documentation (MANDATORY)

- [ ] 8.1 `infra/grafana/README.md`: list the values `provider` can take
- [ ] 8.2 Confirm `docs/api-spec.yml`, `docs/data-model.md` and the relay allowlist need no change; check the PRD's telemetry section and the published privacy policy, and update them only if they describe the provider label's values
- [ ] 8.3 Run `graphify update .`
- [ ] 8.4 Commit, then (after the user's go-ahead) push and open the PR linking JOS-213; archive the change after merge
