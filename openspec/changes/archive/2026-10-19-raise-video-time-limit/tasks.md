# Tasks — Raise the video stage time limit (JOS-197)

Every code change starts with a failing test (TDD), and every scenario in `specs/video-stage-time-limit/spec.md` has at least one test. No test reaches a provider or needs `.secrets.json`. Backend code uses only erasable TypeScript syntax.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-197-raise-video-time-limit` from `feature/jos-194-production-deployment` (worktree `../AI4Devs-jos-197`); stacked because PRD v1.8 continues from that branch's v1.7; no upstream set
- [x] 0.2 Verify the branch is current and based on `e330be3`

## 1. Tests first

- [x] 1.1 In `providerConfig.test.ts`: the slow-tail floors become video 344 s, voice 151 s and decomposition 208.6 s, and the PRD comparison reads `docs/PRD.md` instead of `docs/PRD-v1.4.md`; run it and confirm it fails (the constants are 240, 10 and 20) — done: floors video 344 s, voice 151 s, decomposition 208.6 s and the PRD comparison against `docs/PRD.md`; seen failing (the constants were 240, 10 and 20)
- [x] 1.2 Write failing stage tests (the orchestrator's poll check, with an injected clock or sent-at): a request 344 s old and still running is pending with no failure; one 601 s old is a transient failure naming the 600 s limit — done: `video-time-limit.test.ts` — still pending after 344 s with one attempt and no failed request row; failed past the limit with a `transient_failure` row above the limit and attempt 2 started; seen failing first
- [x] 1.3 Write failing tests that a voice-over attempt 151 s old and a decomposition attempt 209 s old are still in flight when the deadlines are checked (fixtures of `voiceTimeoutFixtures.ts` and `attemptDeadline`), and that nothing is scheduled for retry — done: `attempt-deadline.test.ts` group "an attempt at the product's real script size"; seen failing first

## 2. Implement

- [x] 2.1 Set `PER_PHASE_MAX_TIME_SECONDS.video`, `.voice` and `.decomposition` to 600 with their comments (observed 344 s, 151 s and 208.6 s; provisional) — done: video, voice and decomposition set to 600 with their comments; the voice adapter's own timeout (`voiceProvider.ts`) and the reasoning adapter's (`visualInstructions.ts`) read the same constants
- [x] 2.2 PRD: `docs/PRD-v1.7.md` copied and `docs/PRD.md` is v1.8; update the status line, the §11.3 row (`Reasoning 600s … Voice 600s … Video 600s`) and the "From version 1.7 to 1.8" changelog section for the three limits — the video part was done in the first pass — done: PRD v1.8 — status line, §11.3 row (`Reasoning 600s … Voice 600s … Video 600s`) and the "From version 1.7 to 1.8" section cover the three limits; `docs/PRD-v1.7.md` kept
- [x] 2.3 `docs/adr/0005-provider-selection.md`: record the new value and the reason; check no other document states 240 s as current — done: `docs/adr/0005-provider-selection.md` records 600 s with the reason; `docs/data-model.md` no longer says 240 s; no other document states it as current — done: `docs/adr/0005-provider-selection.md` records the three new values and the measurements; `docs/data-model.md` no longer says 240 s

## 3. Review and Update Existing Unit Tests (MANDATORY)

- [x] 3.1 Review tests that depend on the video limit (`attempt-deadline`, timeout and orchestrator tests, `generate-chunk-video` tests) and record which needed a change; assertions about "240" literals are replaced by the constant — done: only `providerConfig.test.ts` changed; `attempt-deadline.test.ts` derives from the constant

## 4. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 4.1 Capture the pre-test state (temporary `DB_PATH`/`PROJECTS_ROOT`, no `.secrets.json`) — done: fresh temporary stores, no `.secrets.json`
- [x] 4.2 Run the targeted tests, the full backend suite, typecheck, and the frontend suite — done: backend 1482 passed / 5 skipped, frontend 162, typecheck clean — done: backend 1488 passed / 5 skipped, frontend 162, typecheck clean
- [x] 4.3 Verify the post-test state matches the baseline — done: temporary stores removed, nothing else changed — done: temporary stores removed, nothing else changed
- [x] 4.4 Save `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md` — done: `reports/2026-10-14-step-4-unit-test-and-db-verification.md` — done: `reports/2026-10-14-step-4-unit-test-and-db-verification.md`

## 5. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Not a separate run: the real clip timing is observed in the product owner's script-to-video E2E (JOS-194); record the first clips' generation times and whether any attempt was timed out in this change's report, and whether 600 s needs revisiting — partly done: the real timings so far are in `reports/2026-10-14-step-5-real-clip-timings.md` (voice 151 s, decomposition 208.6 s, a 5 s clip 344 s); the full-size session's timings come from the product owner's E2E  — done in JOS-203 B4, see `reports/2026-10-20-step-5-real-clip-timings.md` (API-driven, no browser; 14 s clips not sampled).
- [x] 5.2 Save `reports/YYYY-MM-DD-step-5-real-clip-timings.md`  — done in JOS-203 B4, see `reports/2026-10-20-step-5-real-clip-timings.md` (API-driven, no browser; 14 s clips not sampled).

## 6. E2E Testing with Playwright MCP (MANDATORY if applicable)

- [x] 6.1 Covered by the same E2E run (browser, real providers); record the result in the report of 5.2  — done in JOS-203 B4, see `reports/2026-10-20-step-5-real-clip-timings.md` (API-driven, no browser; 14 s clips not sampled).

## 7. Update Technical Documentation (MANDATORY)

- [x] 7.1 `docs/backend-standards.md`: update the per-phase limits sentence if it states 240 s as current — not applicable: `docs/backend-standards.md` does not state the video limit as a number
- [x] 7.2 Check `docs/api-spec.yml` and `docs/data-model.md` need no change — done: `docs/api-spec.yml` needs no change; `docs/data-model.md` was updated (2.3)

## 8. Close

- [ ] 8.1 Comment on JOS-197 with the change, the timings and the PR link; open the PR after JOS-194's, after the user's go-ahead **Left open at MVP closure; tracked in JOS-203.**
- [x] 8.2 After merge, archive with `/opsx:archive` Archived at MVP closure (JOS-203).

## 9. Second pass: the video limit at the longest admitted clip (2026-10-14)

- [x] 9.1 After the 11-scene real run, raise the video limit from 600 s to 1200 s (clips of 14 s exceeded 600 s on every attempt; 15 s is admitted): spec requirement and scenarios, design Decision 1, `providers.ts`, the config floor (610 s x 1.5), the stage test (a 14 s clip pending after 640 s), the deadline tests (voice and decomposition 600 s, video 1200 s), PRD v1.8 row, status line and changelog, ADR 0005 and `data-model.md`; backend 1488 passed, typecheck clean
- [x] 9.2 With RunningHub topped up by the product owner, retry the three failed scenes (5, 6, 8) from the page on the rebuilt executable and let the session assemble — done 2026-10-14: the three 14 s clips took 661, 719 and 730 s, the session assembled in about 76 s and reached `final-video` (1920x1080 h264 + mp3, 129.13 s, 24.8 MB); recorded in the step 5 report
- [ ] 9.3 Record as a follow-up story (not built here): a timed-out clip keeps being polled instead of being resubmitted, so one scene costs one task **Left open at MVP closure; tracked in JOS-203.**
