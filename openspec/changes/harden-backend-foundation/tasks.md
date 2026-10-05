# Tasks — Harden the backend foundation (JOS-186)

Every code change starts with a failing test (TDD). Every scenario in `specs/restart-safe-concurrency/spec.md` and `specs/concurrent-write-capacity/spec.md` has at least one functional test. No real provider calls: every test uses the stub providers.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-186-harden-backend-foundation` from `origin/feature/entrega-2-JAME` (the MVP integration branch; MVP changes do not target `main`), with no upstream set
- [x] 0.2 Verify the branch was created and is the current branch

## 1. Gate: Confirm the starting point

- [x] 1.1 Re-fetch and confirm `reconcileOnBoot` on the base branch still has the three branches listed in design.md § Context (bound image, stub pending, video). Record any new branch an open stage PR added (for example a voice-over or assembly reconciliation) and add it to Decision 2's list before coding
- [x] 1.2 List every `concurrency.acquire`/`release` call site on the base branch, and on any open feature branch that adds one (`git grep` across `origin/feature/jos-*`). Record in design.md which holder key each will use

## 2. Semaphore: slots owned by a holder (design Decision 1; spec: every released slot has a matching slot that was taken)

- [x] 2.1 Failing tests in `test/concurrency.test.ts`: a release by a holder with no slot, at the cap with a waiter queued, starts nothing and leaves the count unchanged; releasing the same holder twice frees one slot and starts at most one waiter; a handed-over slot belongs to the waiter's holder (releasing the previous holder again does nothing); `acquire` for a holder that already holds a slot or is queued is ignored (queued once, in-flight count unchanged, and the single release frees exactly one slot)
- [x] 2.2 Change `acquire(stage, holder, onAcquired)` / `release(stage, holder)` to keep a holder set per stage; `stats` reports the set's size
- [x] 2.3 Pass the scene id as the holder at every `orchestrator.ts` call site (one mechanical commit, kept separate from 2.2 so rebases stay simple)
- [x] 2.4 Make the group 2 tests pass, plus the existing `orchestrator`, `image-stage` and `video-stage` suites

## 3. Requests already sent count at boot (design Decisions 2 and 3; spec: requests in flight at restart count against the cap)

- [x] 3.1 Failing tests in `test/concurrency.test.ts`: `occupy` adds a holder above the limit without queuing; `acquire` does not grant while the count is at or above the limit, and grants once it drains below
- [x] 3.2 Failing tests in `test/restart-concurrency.test.ts`, one per spec scenario: 2 stub image requests pending at boot with cap 2 → `stats("image").inFlight === 2` right after `reconcileOnBoot()` returns, and a new launch queues without sending; 5 video requests pending with cap 3 → all 5 count and all 5 poll right away, and no new video request is sent until fewer than 3 are in flight; delivering a resumed request hands its slot to the queued launch and the count never goes above the cap; a request the provider lost holds no slot and its retry queues normally; a full restart + burst + settle-all sequence never goes above the cap except for requests sent before the restart, and starts every queued launch exactly once
- [x] 3.3 Implement `occupy(stage, holder)` in `concurrency.ts`
- [x] 3.4 In `reconcileOnBoot`, call `occupy` in the stub-pending image branch (before re-arming the timer) and in the video branch (replacing `acquire`, so polling resumes right away)
- [x] 3.5 Failing test, then fix: the stub video provider answers a poll for an id it never saw (one submitted before a restart) with its own configured mode, instead of always `not_found`. `request-lost` stays `not_found`. Today a restart can never be shown, by hand, resuming a pending clip or settling it afterwards
- [x] 3.5a The same stub hands out request ids that are unique across restarts (found in the curl step: ids restarted at 1, collided with stored `provider_requests` rows and crashed the server)
- [x] 3.6 Failing test, then add: after `reconcileOnBoot()`, `server.ts`'s boot log line includes each stage's `inFlight`/`limit` from `concurrency.stats`, so the curl step can observe the restart-time count
- [x] 3.7 Add failing restart tests for waiting image/video scenes and paused sessions; relaunch admitted held work after in-flight reconciliation, preserving cap accounting and holder deduplication
- [x] 3.8 Make the group 3 tests pass

## 4. Write capacity at MVP scale (design Decision 4; spec: result recording holds at MVP session scale)

- [x] 4.1 Write `test/write-capacity.test.ts` (requests are recorded straight as resolved zero-latency stub requests, not through `launchScene`, whose own delivery timer would add deliveries the test cannot count): one session, 300 scenes, image cap raised above 300, zero-latency stub, two `handleProviderResult` calls per request id in shuffled order, each wrapped in `setImmediate`; assert 300 `scene_results` rows, 300 duplicate-ignored notes, no thrown store error, the same derived session state as the small-scale all-complete case, and the same rows read through a second connection; log the elapsed time
- [x] 4.2 Run it. If it fails, stop and record the failure as a finding before changing any store code. A failure here is the risk ADR 0002 named, and it needs its own design decision, not a quiet fix
- [x] 4.3 Run it 5 times and record the min/median/max elapsed time for the report. Recorded 2026-10-05, 600 deliveries for 300 scenes: 578.1, 537.5, 541.2, 547.7, 538.9 ms, so min 537.5 / median 541.2 / max 578.1 ms

## 5. Backend: Review and Update Existing Unit Tests (MANDATORY)

- [x] 5.1 Review the restart cases in `orchestrator.test.ts`, `image-stage.test.ts` and `video-stage.test.ts` for assumptions about anonymous `release` or the old `acquire`-on-boot video path; update them to the holder API without weakening any assertion
- [x] 5.2 Make sure every test resets the semaphore (`concurrency.resetAll`) and the store (`db.resetAll`) so holder sets cannot leak between cases
- [x] 5.3 Run `npx tsc --noEmit` (type-check gate) and fix any errors

## 6. Backend: Run Unit Tests and Verify Database State (MANDATORY)

- [x] 6.1 Capture a pre-test baseline of the local database (`backend/data/`): row counts for `runs`, `scenes`, `provider_requests`, `scene_results`, `scene_video_results`
- [x] 6.2 Run the targeted tests (`concurrency`, `restart-concurrency`, `write-capacity`) and record the results
- [x] 6.3 Run the full suite (`npm test`) and record totals, runtime and any flaky behaviour
- [x] 6.4 Re-check the same row counts and restore the database if anything changed
- [x] 6.5 Also run the suite in a fresh worktree with no `backend/.secrets.json`, so local credentials cannot mask a failure
- [x] 6.6 Create report `openspec/changes/harden-backend-foundation/reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md`, including the 300-scene timings from 4.3
- [x] 6.7 Mark this step complete only after the tests pass and the report exists

## 7. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Start the backend with `ALLOW_TEST_ENDPOINTS=1 USE_STUB_VIDEO_PROVIDER=pending` (video cap: the provisional 3); note the database baseline
- [x] 7.2 Create a session (`POST /sessions`), then 5 scenes through `POST /internal/test/quick-scene`; confirm through `GET /sessions/:id` that 3 are `video-generating` and 2 wait
- [x] 7.3 `kill -9` the server, restart it with the same environment, and check in the boot log (3.6) that video `inFlight` is 3 right after reconciliation, before any new launch; add a 6th scene and confirm it waits
- [x] 7.4 Restart once more with `USE_STUB_VIDEO_PROVIDER=success-bytes` so pending clips settle; confirm each scene ends with exactly one clip and every waiting launch ran exactly once
- [x] 7.5 Error cases: unknown session id → 404; repeated delivery has no visible effect on the scene
- [x] 7.6 Delete the created session data / project folder and confirm the database matches the 7.1 baseline
- [x] 7.7 Write report `openspec/changes/harden-backend-foundation/reports/YYYY-MM-DD-step-7-curl-restart-concurrency.md` with every command and response

## 8. Frontend: E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 8.1 Not applicable: this change touches no frontend code and no API contract. Record that in the step 7 report, and note that the SSE reconnect resync carry-forward from JOS-179 is already in `useLiveSession.ts` (verified during proposal)

## 9. Update Technical Documentation (MANDATORY)

- [ ] 9.1 `docs/backend-standards.md` § Project Structure: describe the real flat `backend/src/` layout grouped by role (design Decision 6); fix the "still models one generic stage" sentence and § Not Yet Decided
- [ ] 9.2 `docs/backend-standards.md` § Core components → `concurrency`: document holder-owned slots, `occupy` for requests already sent, and that the count may sit above the cap after a restart
- [ ] 9.3 `docs/adr/0001-backend-stack.md` § Consequences: mark the concurrency-after-restart check resolved, with links to the step 6 and step 7 reports
- [ ] 9.4 `docs/adr/0002-persistence.md` § Risks: mark the scale risk resolved with the 300-scene timings; add the artefact-modelling decision (design Decision 5)
- [ ] 9.5 `docs/data-model.md`: one note on why per-scene artefacts are two columns, not a table
- [ ] 9.6 Confirm `docs/api-spec.yml` needs no change (no API change)

## 10. Linear and delivery

- [ ] 10.1 Comment on JOS-186: the narrowed scope and why (bootstrap done by JOS-134, stages owned by their own stories, SSE resync and `scene.result` already done), and a link to this change
- [ ] 10.2 Comment on JOS-167 that restart-time accounting is now enforced
- [ ] 10.3 Commit the finished work on the feature branch; ask before pushing or opening the PR into `feature/entrega-2-JAME`, and list the open branches that need a rebase in the PR description
