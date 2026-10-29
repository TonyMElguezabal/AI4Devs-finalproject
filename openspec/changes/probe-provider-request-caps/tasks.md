## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-188-probe-provider-request-caps` from `origin/main` with `--no-track` (worktree `../AI4Devs-finalproject-jos-188`)
- [x] 0.2 Verify the branch has no upstream (`git branch -vv`) and record the start time for the DoD time-spent entry

## 1. Preparation

- [x] 1.1 Re-check the RunningHub per-call price for a 5 s 2K job and the account balance (`POST /uc/openapi/accountStatus`, free). Stop and ask if the 20 jobs would exceed $13. Result 2026-10-29: $0.60 per 5 s 2K job (JOS-165 step 3, not the $0.39 first assumed), balance $68.82, 0 tasks running; the owner approved about $12 and a $13 ceiling
- [x] 1.2 Check the ElevenLabs subscription (`GET /v1/user/subscription`) for tier and remaining characters, and the published concurrency limit for that tier. Result 2026-10-29: Creator, 15,351 of 245,986 characters used, no concurrency field or header in the response (the limit can only come from the probe)
- [x] 1.3 Verify design Decision 4's assumption in `concurrency.ts` and the voice, alignment and video call sites: a retry never runs alongside its own earlier attempt, including one that timed out. Record the result (holds / does not hold, with file:line). Result 2026-10-29: holds for voice and alignment: `retryScheduler.ts:79-112` releases the slot only when the provider call settles, a retry is a new attempt that takes its own slot, and a timed-out attempt keeps its slot, so live requests never exceed the cap. Holds for video except at the ceiling: `orchestrator.ts:910-917` follows the same task past the limit, and at twice the limit releases the slot while the RunningHub task may still be running, so a later retry can briefly overlap it. No headroom is subtracted; the exception goes into the step 4 report
- [x] 1.4 Write the probe script under `probe/` that drives the existing adapters with the stored keys, logs status, error body, `*concurrent*` headers and timings per call, and enforces the spend ceiling (design Decisions 1-3). Dry-run it at concurrency 1 per provider. Result 2026-10-29: `probe/probe.ts` runs both dry runs; the ElevenLabs response carries `current-concurrent-requests` and `maximum-concurrent-requests: 5` headers, which the design listed as unconfirmed

## 2. ElevenLabs probe

- [x] 2.1 Run voice-only at 5, 6 and 7 concurrent calls; record which return `429` and any concurrency headers. Result 2026-10-29: voice-only: 5 concurrent all `200`; 6 gives one `429`; 7 gives two `429` (2 runs each)
- [x] 2.2 Run 3 voice + 3 alignment concurrently to confirm the pool is shared (design Decision 2). Result 2026-10-29: 5 voice + 1 alignment (6 in flight) and 3 + 3 all succeeded in 3 runs each, so alignment does not share the voice pool; alignment alone took 10 concurrent without error
- [x] 2.3 Write `reports/YYYY-MM-DD-step-2-elevenlabs-concurrency.md`: raw results, measured limit, shared-pool finding, derived voice/alignment split, characters used. Result 2026-10-29: report written; voice limit 5 measured, alignment independent

## 3. RunningHub probe

- [x] 3.1 Take 2 sequential 5 s 2K baseline samples in the same session. Result 2026-10-29: 318.8 s and 220.7 s (time to `RUNNING` 0.23 s and 0.22 s); the 45% spread between two sequential samples means total time cannot be a clean/dirty criterion on its own
- [x] 3.2 Run 4, then 6 concurrent 5 s 2K jobs (level 8 dropped by the owner on 2026-10-29: about $2.10 of balance per job, ceiling $30 after level 4), stopping at the first level that is not clean (design Decision 3); repeat only a borderline level, once. Result 2026-10-29: level 4 and level 6 both clean (no `QUEUED`, no errors, all totals 227-296 s); level 8 not run
- [x] 3.3 Write `reports/YYYY-MM-DD-step-3-runninghub-concurrency.md`: per-job time to `RUNNING`, status sequence, totals, highest clean level, spend from balance before and after. Result 2026-10-29: report written; highest clean level 6; balance debits do not match the $0.60 itemized price (open item)

## 4. Decision

- [x] 4.1 Write `reports/YYYY-MM-DD-step-4-recommendation.md`: findings, trade-offs, keep / raise / lower per stage, time spent, and next step (proceed / pivot / cancel). Result 2026-10-29: report written; recommends voice 5, alignment 2, video 4 or 6
- [ ] 4.2 Present the recommendation to the product owner and record the decision. If no cap changes, mark 5.1-5.3 as not applicable and go to 6
- [ ] 4.3 If a cap changes: update this change's `specs/provider-request-limit/spec.md` with the new values (CLAUDE.md §7) before coding

## 5. Backend: Apply caps (TDD, only if a cap changes)

- [ ] 5.1 Update the expected values in `backend/test/providerConfig.test.ts` first and see them fail
- [ ] 5.2 Update `maxSimultaneousRequests` in `backend/config/settings.default.json`
- [ ] 5.3 Update the source comment above `MAX_SIMULTANEOUS_REQUESTS` in `backend/src/config/providers.ts` to cite the JOS-188 reports

## 6. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [ ] 6.1 Review tests that read the voice, alignment or video caps (`providerConfig.test.ts`, concurrency and restart-safe-concurrency tests) for hardcoded 3 / 2 / 5 values, and update any the decision changed
- [ ] 6.2 Make sure the probe script is outside the vitest include and lint scope, or excluded

## 7. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 7.1 Capture the pre-test baseline of a scratch database: run with a fresh `DB_PATH` and `PROJECTS_ROOT` in the scratchpad, never the real ones
- [ ] 7.2 Run the targeted tests (`providerConfig.test.ts`, concurrency tests)
- [ ] 7.3 Run the full backend suite and `tsc --noEmit`
- [ ] 7.4 Verify the post-test state matches the baseline and that the real `data/` and projects folder are untouched
- [ ] 7.5 Create `reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md`
- [ ] 7.6 Mark this step complete only after tests pass and the report exists

## 8. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Start the backend with scratch `DB_PATH` and `PROJECTS_ROOT`
- [ ] 8.2 `curl GET /admin/settings` and check that `maxSimultaneousRequests` shows the decided defaults
- [ ] 8.3 Check that a `settings.json` override (for example `"video": 1`) still wins over the default, then remove the override
- [ ] 8.4 Record the commands and responses in `reports/YYYY-MM-DD-step-8-curl-endpoint-testing.md` and confirm the scratch state was discarded

## 9. Frontend: E2E Testing with Playwright MCP

- [ ] 9.1 Not applicable: no frontend change. Record that in the step 8 report

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 Amend ADR 0005's request-cap section with the measured ElevenLabs and RunningHub limits and the derivation
- [ ] 10.2 Update `docs/development_guide.md` if a default it quotes changed
- [ ] 10.3 Run `graphify update .`
- [ ] 10.4 Comment on JOS-188 with the findings, the decision and the time spent, and check off its Definition of Done
