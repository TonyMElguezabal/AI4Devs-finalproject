# Tasks — Raise the video stage time limit (JOS-197)

Every code change starts with a failing test (TDD), and every scenario in `specs/video-stage-time-limit/spec.md` has at least one test. No test reaches a provider or needs `.secrets.json`. Backend code uses only erasable TypeScript syntax.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-197-raise-video-time-limit` from `feature/jos-194-production-deployment` (worktree `../AI4Devs-jos-197`); stacked because PRD v1.8 continues from that branch's v1.7; no upstream set
- [x] 0.2 Verify the branch is current and based on `e330be3`

## 1. Tests first

- [ ] 1.1 In `providerConfig.test.ts`: the slow-tail floor for video becomes 344 s, and the PRD comparison reads `docs/PRD.md` instead of `docs/PRD-v1.4.md`; run it and confirm it fails (the constant is 240)
- [ ] 1.2 Write failing stage tests (the orchestrator's poll check, with an injected clock or sent-at): a request 344 s old and still running is pending with no failure; one 601 s old is a transient failure naming the 600 s limit

## 2. Implement

- [ ] 2.1 Set `PER_PHASE_MAX_TIME_SECONDS.video` to 600 with its comment (observed 344 s for a 5 s clip at 2K on 2026-10-13, JOS-196; provisional)
- [ ] 2.2 PRD: copy `docs/PRD.md` to `docs/PRD-v1.7.md`; in `docs/PRD.md` set v1.8, update the status line, the §11.3 row (`Video 600s`) and add the "From version 1.7 to 1.8" changelog section
- [ ] 2.3 `docs/adr/0005-provider-selection.md`: record the new value and the reason; check no other document states 240 s as current

## 3. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 3.1 Review tests that depend on the video limit (`attempt-deadline`, timeout and orchestrator tests, `generate-chunk-video` tests) and record which needed a change; assertions about "240" literals are replaced by the constant

## 4. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 4.1 Capture the pre-test state (temporary `DB_PATH`/`PROJECTS_ROOT`, no `.secrets.json`)
- [ ] 4.2 Run the targeted tests, the full backend suite, typecheck, and the frontend suite
- [ ] 4.3 Verify the post-test state matches the baseline
- [ ] 4.4 Save `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md`

## 5. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 5.1 Not a separate run: the real clip timing is observed in the product owner's script-to-video E2E (JOS-194); record the first clips' generation times and whether any attempt was timed out in this change's report, and whether 600 s needs revisiting
- [ ] 5.2 Save `reports/YYYY-MM-DD-step-5-real-clip-timings.md`

## 6. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [ ] 6.1 Covered by the same E2E run (browser, real providers); record the result in the report of 5.2

## 7. Update Technical Documentation (MANDATORY)

- [ ] 7.1 `docs/backend-standards.md`: update the per-phase limits sentence if it states 240 s as current
- [ ] 7.2 Check `docs/api-spec.yml` and `docs/data-model.md` need no change

## 8. Close

- [ ] 8.1 Comment on JOS-197 with the change, the timings and the PR link; open the PR after JOS-194's, after the user's go-ahead
- [ ] 8.2 After merge, archive with `/opsx:archive`
