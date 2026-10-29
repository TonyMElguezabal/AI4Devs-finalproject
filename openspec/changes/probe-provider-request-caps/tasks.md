## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create branch `feature/jos-188-probe-provider-request-caps` from `origin/main` with `--no-track` (worktree `../AI4Devs-finalproject-jos-188`)
- [ ] 0.2 Verify the branch has no upstream (`git branch -vv`) and record the start time for the DoD time-spent entry

## 1. Preparation

- [ ] 1.1 Re-check the RunningHub per-call price for a 5 s 2K job and the account balance (`POST /uc/openapi/accountStatus`, free). Stop and ask if 18 calls would exceed $10
- [ ] 1.2 Check the ElevenLabs subscription (`GET /v1/user/subscription`) for tier and remaining characters, and the published concurrency limit for that tier
- [ ] 1.3 Verify design Decision 4's assumption in `concurrency.ts` and the voice, alignment and video call sites: a retry never runs alongside its own earlier attempt, including one that timed out. Record the result (holds / does not hold, with file:line)
- [ ] 1.4 Write the probe script under `probe/` that drives the existing adapters with the stored keys, logs status, error body, `*concurrent*` headers and timings per call, and enforces the spend ceiling (design Decisions 1-3). Dry-run it at concurrency 1 per provider

## 2. ElevenLabs probe

- [ ] 2.1 Run voice-only at 5, 6 and 7 concurrent calls; record which return `429` and any concurrency headers
- [ ] 2.2 Run 3 voice + 3 alignment concurrently to confirm the pool is shared (design Decision 2)
- [ ] 2.3 Write `reports/YYYY-MM-DD-step-2-elevenlabs-concurrency.md`: raw results, measured limit, shared-pool finding, derived voice/alignment split, characters used

## 3. RunningHub probe

- [ ] 3.1 Take 2 sequential 5 s baseline samples in the same session
- [ ] 3.2 Run 4, then 6, then 8 concurrent 5 s jobs, stopping at the first level that is not clean (design Decision 3); repeat each clean level once at a different time
- [ ] 3.3 Write `reports/YYYY-MM-DD-step-3-runninghub-concurrency.md`: per-job time to `RUNNING`, status sequence, totals, highest clean level, spend from balance before and after

## 4. Decision

- [ ] 4.1 Write `reports/YYYY-MM-DD-step-4-recommendation.md`: findings, trade-offs, keep / raise / lower per stage, time spent, and next step (proceed / pivot / cancel)
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
