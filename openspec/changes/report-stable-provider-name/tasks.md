## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Branch `feature/jos-213-telemetry-provider-name` created from `origin/main` with `--no-track`, in the worktree `../AI4Devs-jos-213` (done by `/opsx:propose`)
- [x] 0.2 `git fetch`; confirm it is the current branch of that worktree, has no upstream, and `origin/main` has not moved past its base (merge it in if it has)

## 1. Gate

- [x] 1.1 Confirm design.md § Context still holds: `reportStageAttempt` and `reportProviderRequest` are the only places that set `provider` for telemetry; assembly records `providerId: null`; the stub and legacy identifiers are as listed; `PARAMETER_SHAPES` has the five adapter types.
- [x] 1.2 Check whether `db.ts` can import `config/providers.ts` without a side effect; if not, take the fallback in design.md § Risks. (It cannot: the module loads the settings file on import. Fallback taken, and design Decision 2 step 3 now matches stubs by the `stub-` prefix.)

## 2. Backend: vendor per adapter type (TDD; design Decision 1)

- [x] 2.1 Write a failing test: `ADAPTER_VENDORS` maps each adapter type to `OpenAI`, `ElevenLabs`, `Fal.ai` or `RunningHub`, and covers every key of `PARAMETER_SHAPES`.
- [x] 2.2 Add `ADAPTER_VENDORS` to `backend/src/providerTypes.ts`. Make 2.1 pass.

## 3. Backend: report the vendor (TDD; design Decisions 2, 3)

- [x] 3.1 Write failing tests in `telemetry-hooks.test.ts` (spec scenarios): seeded decomposition, voice-over, timestamps (native and forced alignment), image and clip report `OpenAI`, `ElevenLabs`, `ElevenLabs`, `Fal.ai`, `RunningHub` (AC1, AC2); the two legacy identifiers report `Fal.ai` and `RunningHub`; an `/admin` profile with a ULID id and a typed label reports its vendor and neither value is exported; assembly reports `local`; an identifier starting `stub-` reports `stub`; the two legacy literals in `db.ts` equal the constants in `config/providers.ts`; an unmapped identifier reports `unknown` and is not exported (AC3); a not-retryable clip error record carries `RunningHub`.
- [x] 3.2 Add `telemetryProviderOf` to `db.ts` and use it in `reportStageAttempt` and `reportProviderRequest`. Make 3.1 pass.

## 4. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 4.1 Update the existing `telemetry-hooks.test.ts` cases that store fake identifiers (`elevenlabs`, `fal`, `runninghub`) to store the real seeded ids, so they assert the vendor names; confirm `telemetry.test.ts`'s allowlist test passes unchanged (AC4).

## 5. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 5.1 Capture the pre-test baseline of the local database (this worktree has no local database and every run used scratch paths, so nothing shared was opened; recorded in the report)
- [x] 5.2 Run the targeted tests from groups 2 and 3
- [x] 5.3 Run the full backend suite and lint in this worktree with their own scratch `DB_PATH` and `PROJECTS_ROOT`
- [x] 5.4 Verify the post-test database state matches the baseline and restore if needed
- [x] 5.5 Create report `openspec/changes/report-stable-provider-name/reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md`
- [x] 5.6 Mark this group complete only after tests pass and the report exists

## 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

The change has no endpoint, and a session cannot run to a final video without provider keys here, so this group exercises the real recording functions and the real OTLP export instead of a route (see the report).

- [x] 6.1 Start a local capture server for OTLP/HTTP and point `VID4YOU_TELEMETRY_ENDPOINT` at it, with `providerUsage` and `errors` consent on in a scratch database
- [x] 6.2 Not possible: a stub session to the final video needs the content-check key. Replaced by 6.3, which drives every stage's recording function directly
- [x] 6.3 Record and complete one attempt or request for each seeded profile, the two legacy identifiers, an `/admin` profile, an unmapped identifier and an assembly attempt; confirm the captured `provider` values match the spec table and no stored identifier appears in any payload
- [x] 6.4 Stop the capture server and delete the scratch directory; document commands and captured series in `reports/YYYY-MM-DD-step-6-manual-endpoint-testing.md`

## 7. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 7.1 No frontend change, so there is no browser test. The dashboard queries were checked in the repository (they group by `provider` and filter on no value). Re-importing `infra/grafana/dashboards/providers.json` in the owner's Grafana stack (AC5) is not possible from this session and is left for the owner; see `reports/2026-10-27-step-7-grafana-check.md`.

## 8. Update Technical Documentation (MANDATORY)

- [x] 8.1 `infra/grafana/README.md`: list the values `provider` can take
- [x] 8.2 Confirm `docs/api-spec.yml`, `docs/data-model.md` and the relay allowlist need no change; check the PRD's telemetry section and the published privacy policy, and update them only if they describe the provider label's values (checked: `PRIVACY.md` and PRD §12.4 say only "the provider's name", which stays true, so neither changes)
- [x] 8.3 Run `graphify update .`
- [ ] 8.4 Commit (done), then (after the user's go-ahead) push and open the PR linking JOS-213; archive the change after merge
