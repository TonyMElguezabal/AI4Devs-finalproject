# Step 8 — Unit tests and database verification (JOS-167)

Date: 2026-10-14. Branch `feature/jos-167-limit-provider-requests-per-stage`, rebased onto `origin/feature/entrega-2-JAME` (7c8d358).

## Results

| Check | Result |
|---|---|
| `backend`: `npm run typecheck` | clean |
| `backend`: `npm test` (scratch `DB_PATH` and `PROJECTS_ROOT`, no `.secrets.json`) | 98 files passed, 4 skipped; 1501 tests passed, 5 skipped |
| `frontend`: `npm run typecheck` | clean |
| `frontend`: `npm test` | 2 files, 167 tests passed |

One earlier full run showed a single timeout in `orchestrator.test.ts` ("a manual retry after failure starts a fresh cycle"). It passed alone, on the base commit, and in three further full runs. Treated as a timing flake, not caused by this change.

## Database state (8.1, 8.4)

Tests ran against a scratch store, so no default store was touched. The worktree's own `backend/data/` was created by earlier unscoped runs during development (gitignored, no user data). Its three files have the same SHA-1 before and after the final run. It was not deleted.

## Existing tests changed (7.1)

- `providerConfig.test.ts`: the three caps are numbers, no longer `undetermined`.
- `attempt-timeout.test.ts`, `late-result.test.ts`: hang several voice calls on purpose, and a timed-out call now keeps its slot (Decision 6). They reset the semaphore and run with room for every hung call (`resetVoiceSlots`).
- `voice-over-phase.test.ts`: the pause is applied after the first attempt, because a first attempt on a paused session is now held instead of sent.
- `server-boot-log.test.ts`: the boot log lists all five caps.

## Scenario to test map (7.2)

| Scenario | Test |
|---|---|
| Every capped stage has a numeric cap | `provider-request-limits.test.ts` (limits), `server-boot-log.test.ts` |
| ElevenLabs stages within the account limit | `provider-request-limits.test.ts` (sum <= 5) |
| Native timestamps take no slot | `retry-scheduler.test.ts` (takes no slot for ... no call) |
| Several sessions compete for the voice stage | `provider-request-limit-first-attempts.test.ts` 4.1, `retry-scheduler.test.ts` (FIFO across sessions) |
| Scenes share the image cap | `concurrency.test.ts`, `orchestrator.test.ts` (shared cap) |
| A timed-out request still holds its slot | `provider-request-limit-waiting.test.ts` 5.3 |
| Oldest waiter is sent next | `retry-scheduler.test.ts` (sends in the order the attempts became ready) |
| A due retry waits its turn | `provider-request-limit-waiting.test.ts` 5.3 (retry waits behind a held call) |
| A long wait does not time out | `provider-request-limit-waiting.test.ts` 5.1 |
| Waiting uses up no attempt | `provider-request-limit-waiting.test.ts` 5.1, `provider-request-limit-first-attempts.test.ts` 4.2 |
| Waiting survives a restart | `provider-request-limit-waiting.test.ts` 5.4 |
| A pause while waiting sends nothing | `retry-scheduler.test.ts` (releases the slot and leaves the attempt scheduled) |
| Scenes waiting for the video cap are not failed | `video-stage.test.ts` (shows a chunk waiting for the video cap) |
| A session waiting for its voice-over slot | `provider-request-limit-first-attempts.test.ts` 4.1, `provider-request-limit-waiting.test.ts` 5.5 |
| Release by a holder with no slot / released twice | `concurrency.test.ts`, `restart-concurrency.test.ts` |
| An attempt's slot is released once, when its call returns | `retry-scheduler.test.ts` (send throws, releaseSlot twice), `provider-request-limit-waiting.test.ts` 5.3 |
| The cap holds across a restart and a burst | `restart-concurrency.test.ts` |
| The same waiting attempt released twice | `retry-scheduler.test.ts` (timer and continue) |

## Not verified

- 7.3 module coverage: no coverage provider is installed in `backend`, so the comparison with the propose commit was not made.
- `docs/api-spec.yml` (11.4): no mention of concurrency, slots or caps. The boot log is not part of the API. No change needed.
