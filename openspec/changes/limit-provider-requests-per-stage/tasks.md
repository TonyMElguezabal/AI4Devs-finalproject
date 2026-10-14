# Tasks — Limit simultaneous provider requests per stage (JOS-167)

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create branch `feature/jos-167-limit-provider-requests-per-stage` from `origin/feature/entrega-2-JAME` (the MVP integration branch), in the worktree `../AI4Devs-finalproject-jos-167`
- [x] 0.2 Verify the branch was created and is the current branch of that worktree

## 1. Gate

- [x] 1.1 `git fetch`. Confirm the base still matches design.md § Context: image and video acquire through `concurrency.ts`; voice-over, timestamps and decomposition first attempts are inserted `in-flight` with `sentAt`; `releaseAttempt` claims before sending; `getScheduledAttempts` orders by `due_at`. If JOS-156 (retry-decomposition) or another branch touching `decompositionPhase.ts` or `retryScheduler.ts` has merged since, update the artifacts before coding.
- [x] 1.2 Check which `providerId` a scheduled `timestamps` retry carries (alignment or native), since Decision 5 keys the slot on it. Record the finding in design.md if it differs.

Gate result (2026-10-14): the branch was 152 commits behind the integration branch and was rebased onto it (the propose commit was unpushed). JOS-156 and JOS-195 changed the three phases; design.md § Context and Decisions 3-6 were updated. The `timestamps` `providerId` is not a reliable key (design Decision 5).

## 2. Backend: cap values from one constant (TDD; design Decisions 1, 2)

- [x] 2.1 Write failing tests: after module load, `stats()` reports decomposition 50, image 200, voice 3, alignment 2, video 3; `voice + alignment <= 5`; `resetAll()` restores the configured limits.
- [x] 2.2 Set `MAX_SIMULTANEOUS_REQUESTS` to numbers (voice 3, alignment 2, video 3) with source comments (ElevenLabs Creator documented limit; JOS-165 step 8.2), typed so `undetermined` no longer compiles.
- [x] 2.3 Set every limit in `concurrency.ts` from the constant; make `resetAll()` restore them. Remove `PROVISIONAL_VIDEO_CONCURRENCY` and its `setLimit` from `orchestrator.ts`, and the image `setLimit` from `server.ts` (keep the `STAGE_CONCURRENCY_LIMIT` override). Make 2.1 pass and keep the image and video tests green.

## 3. Backend: one slot-taking claim for session-level attempts (TDD; design Decisions 3, 5, 6)

- [x] 3.1 Write failing tests for `sendWithSlot` in `retry-scheduler.test.ts`, with a voice limit of 1:
  - a second attempt stays `scheduled` with no `sentAt` while the first is in flight, and is claimed when the first's call returns;
  - FIFO across two sessions;
  - a pause while queued releases the slot and leaves the attempt `scheduled`;
  - a timer and a continue releasing the same attempt send it once;
  - a native-timestamps attempt and an assembly attempt take no slot;
  - the slot is released when `send` settles, including when it throws, and earlier when `send` calls `releaseSlot()`; calling it twice releases once;
  - a `timestamps` attempt takes an `alignment` slot unless a stored or usable native timestamps file means no call is made;
  - the result is `{ sent: false }` for a paused session, and `{ sent: true, value }` otherwise.
- [x] 3.2 Implement `sendWithSlot(attemptId, send, now)` and the stage-to-key mapping. Route `releaseAttempt` through it. Make 3.1 pass.

## 4. Backend: first attempts enter as scheduled (TDD; design Decisions 3, 4)

- [x] 4.1 Write failing tests: with the voice limit at 1 and one voice call in flight, a second session's `generateVoiceOver` records a `scheduled` initial attempt, sends nothing and sets no failure. When the first call returns, it is sent with `sentAt` later than `queuedAt`.
- [x] 4.2 Same for timestamps through alignment (limit 1) and for decomposition (limit 1). The alignment slot is free before the follow-on decomposition attempt waits for its own slot (Decision 4).
- [x] 4.3 Change the first-attempt entry points (`generateVoiceOver`, `obtainNarrationTimestamps`, `segmentStoredTimestamps`) to record the attempt `scheduled` (trigger `initial`, `dueAt = queuedAt`) and send it through `sendWithSlot`, keeping their awaited return values when a slot is free. `runDecompositionPhase`, `sendDecompositionAttempt` and `sendVoiceAttempt` pass `releaseSlot` through and call it right after `align` / `synthesize` return. The decomposition attempt recorded after a timestamps attempt is also `scheduled` and goes through `sendWithSlot`. Make 4.1 and 4.2 pass.

## 5. Backend: waiting is not execution time, not an attempt, not a failure (TDD; spec "Waiting is neither…", "Waiting work is never shown as failed")

- [x] 5.1 A voice attempt that waits longer than the voice maximum time and then returns in time is a success, not `timed-out` (watcher test with injected clock).
- [x] 5.2 A waiting attempt uses no attempt in the cycle: after it is sent, the cycle shows exactly one attempt.
- [x] 5.3 A timed-out voice attempt keeps its slot until its call returns. A retry scheduled by the timeout waits for that slot (Decision 6).
- [x] 5.4 Restart while a session-level attempt is waiting: after boot it is still `scheduled`, no failed attempt is recorded, and it is sent once a slot is free.
- [x] 5.5 The session snapshot for a session waiting for its voice-over slot, and for scenes waiting behind the video cap, shows no `failed` state and no run failure.
- [x] 5.6 Make any of 5.1–5.5 that fail pass, without new display states (Decision 7).

## 6. Backend: boot log

- [x] 6.1 `bootLogFields` reports `inFlight` and `limit` for every capped stage, not only image and video. Update its test.

## 7. Review and Update Existing Unit Tests (MANDATORY)

- [x] 7.1 Review the tests that set or rely on limits and first-attempt shape: `concurrency`, `restart-concurrency`, `retry-scheduler`, `attempt-timeout`, `voice-over-*`, `decomposition-*`, `restart-*`, `orchestrator`, `video-stage`, `image-stage`. Update any that assumed an uncapped session stage, `PROVISIONAL_VIDEO_CONCURRENCY`, or an `in-flight` first attempt.
- [x] 7.2 Map every scenario in `specs/provider-request-limit/spec.md` and `specs/restart-safe-concurrency/spec.md`, and AC1–AC4 of JOS-167, to at least one test. List the mapping in the step 8 report.
- [ ] 7.3 Confirm module test coverage has not decreased (compare against this change's propose commit).

## 8. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline of the default store: row counts per table (including `stage_attempts` by outcome), applied migrations, and `data/projects/` contents.
- [x] 8.2 Run the targeted tests from 7.1.
- [x] 8.3 Run `npm run typecheck` and the full `npm test` in both `backend` and `frontend`, with no `backend/.secrets.json` in the checkout.
- [x] 8.4 Verify the post-test state matches the baseline; restore it if not.
- [x] 8.5 Create the report `openspec/changes/limit-provider-requests-per-stage/reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`.
- [x] 8.6 Mark this step complete only after the tests pass and the report file exists.

## 9. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Start the real server on a scratch store and scratch projects folder with stub providers, `ALLOW_TEST_ENDPOINTS=1`, and a slow stub voice provider. Confirm `GET /health` and that the boot log lists all five caps.
- [ ] 9.2 Start 5 sessions at once with `POST /sessions`. `GET /sessions/:id` on each shows at most 3 voice attempts `in-flight`, the rest `scheduled` and none failed. As calls return, the waiting sessions are sent in creation order.
- [ ] 9.3 `POST /sessions/:id/pause` on a waiting session; confirm it is skipped when a slot frees; `POST /sessions/:id/continue` sends it.
- [ ] 9.4 Clean up the scratch store and folder; confirm the default store is untouched; save `openspec/changes/limit-provider-requests-per-stage/reports/YYYY-MM-DD-step-9-manual-endpoint-testing.md`.

## 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Decide applicability: no UI change, but AC4 is visible on the session page, so it applies.
- [ ] 10.2 Run backend (scratch store, slow stub voice, voice limit 1) and frontend. Open two sessions started together: the waiting one shows its voice-over as pending, not failed, and completes after the first.
- [ ] 10.3 Restore the environment and save `openspec/changes/limit-provider-requests-per-stage/reports/YYYY-MM-DD-step-10-e2e.md`.

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 `docs/PRD.md` §11: record the final per-stage caps, with the ElevenLabs value marked as documented, not measured.
- [x] 11.2 `docs/data-model.md`: a `scheduled` attempt with trigger `initial` means "waiting for a slot". `queuedAt` is when it became ready and `sentAt` is when it took its slot.
- [x] 11.3 `docs/backend-standards.md`: the cap rule. Every provider call takes a slot keyed by stage; session-level attempts go through `sendWithSlot`; a slot covers one call and is released when the call returns, not when the attempt closes.
- [x] 11.4 `docs/api-spec.yml`: confirm no change is needed; record that in the step 8 report.

## 12. Close out

- [ ] 12.1 Ask the user before commenting on the related tickets (JOS-184, JOS-185, JOS-136) that first attempts now enter as `scheduled`.
- [ ] 12.2 Ask before pushing; open the PR against `feature/entrega-2-JAME` with a description linking to JOS-167.
- [ ] 12.3 Obtain review by at least one human, not only AI agents.
- [ ] 12.4 Archive the OpenSpec change after merge.
