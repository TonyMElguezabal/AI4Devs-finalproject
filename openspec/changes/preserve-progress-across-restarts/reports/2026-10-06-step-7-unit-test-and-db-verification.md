# Step 7 Report - Unit Tests and Database State Verification

- Date: 2026-10-06
- Change: preserve-progress-across-restarts (JOS-160)
- Agent: Claude Sonnet 5.5

## Commands Executed

```
cd backend
D=$(mktemp -d); export DB_PATH=$D/t.sqlite PROJECTS_ROOT=$D/projects
npx vitest run test/restart-recovery.test.ts test/restart-settle.test.ts test/restart-assembly.test.ts \
  test/restart-no-duplicates.test.ts test/restart-concurrency.test.ts test/orchestrator.test.ts \
  test/image-stage.test.ts test/video-stage.test.ts test/launch-gate.test.ts \
  test/obtain-narration-timestamps.test.ts test/server-boot-log.test.ts test/assembly-launch.test.ts \
  test/assembly-phase.test.ts
npx vitest run                                  # full suite
npx tsc --noEmit
npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/**'   # at the merge base and at head
cd ../frontend && npm run typecheck && npm test
```

Every backend run used an isolated store. `PROJECTS_ROOT` is a sibling folder of the store file, not the same folder: `resetAll()` clears `PROJECTS_ROOT`, and pointing both at one folder deletes the store file under the test (the first full run failed `write-capacity.test.ts` with "no such table" for that reason, and passed once the folders were separated).

The worktree used for this change (`../AI4Devs-finalproject-jos-160`) has no `backend/.secrets.json`, and no `ELEVENLABS_KEY`, `FAL_API_KEY` or `OPENAI*` variable was set, so every run above is the "without local secrets" run task 7.3 asks for.

## Database State Verification

| | Before | After |
|---|---|---|
| Default store `backend/data/skeleton.sqlite` of the main checkout (read-only counts) | 2 runs, 0 scenes, 0 stage_attempts, 0 provider_requests, 13 migrations, 17 triggers; `data/projects/` has 2 entries | identical, not touched |
| Isolated store | absent | migrations 1-14 applied, 17 triggers; each test file ends on whatever its last test left (1 run, 2 attempts after the final file); discarded |

The worktree's own default store `backend/data/skeleton.sqlite` was created and dirtied by the first test runs, before the isolated store was used. It is git-ignored and was deleted with the worktree. Cleanup actions: the temporary base worktree `../AI4Devs-finalproject-jos-160-base` was removed; the isolated directories are under the OS temp folder.

## Unit Test Results

- Targeted: 13 files, 169/169 passed.
- Full backend suite: 80 files passed, 3 skipped; 1312 passed, 4 skipped, 0 failed. The merge base has 1295 passed, so this change adds 17 tests (plus the pins that existed before).
- Frontend: 2 files, 101/101 passed. Typecheck clean for both packages.

## Coverage (task 6.3)

Compared against `11fbec1` (the propose commit merged with the integration branch), each on its own isolated store.

| | Statements | Branches | Functions |
|---|---|---|---|
| Base | 92.04% | 92.48% | 98.64% |
| Head | 92.19% | 92.78% | 98.68% |

`orchestrator.ts` rose from 88.13/88.25/98 to 88.62/89.3/98.21, `launchGate.ts` stays at 100%, `decompositionPhase.ts` branches did not decrease once the two skip branches of the new settle were tested. The only per-file decrease in the last run is `db.ts` branches, 93.05% to 93.02%. This change does not touch `db.ts`, so it is run-to-run variation in time-dependent branches.

## Scenario to test map (task 6.2)

| Scenario in `specs/restart-recovery/spec.md` | Test |
|---|---|
| Every state survives | `restart-recovery.test.ts` "every state survives..." |
| Paused session | `restart-recovery.test.ts` "a paused session sends nothing at boot..."; `restart-concurrency.test.ts` "launches both stages with free capacity while holding paused sessions" |
| Clip request still held by the provider | `restart-concurrency.test.ts` "video stage: requests pending at boot"; `video-stage.test.ts` "Reconciliation on boot" |
| Image request lost | `restart-settle.test.ts` "an exhausted attempt becomes failed..."; `orchestrator.test.ts` "records exactly one failed attempt..."; `image-stage.test.ts` "Restart reconciliation" |
| Voice-over attempt lost | `restart-settle.test.ts` "an in-flight voice-over attempt is timed out..." |
| Timestamps attempt lost | `restart-settle.test.ts` "an in-flight timestamps attempt..." |
| Instructions attempt lost | `restart-settle.test.ts` "an in-flight decomposition attempt..." |
| Assembly attempt lost | `restart-settle.test.ts` "an in-flight assembly attempt..." |
| Scenes queued for a request slot | `restart-concurrency.test.ts` "waiting work survives a restart" |
| Clip not yet sent | `restart-concurrency.test.ts` "launches waiting video scenes once as restored slots drain" |
| Assembly interrupted with attempts left | `restart-assembly.test.ts` "is launched once as the next attempt of the same sequence..." |
| Assembly with its budget spent | `restart-assembly.test.ts` "keeps counting the budget across the restart..." and "is not launched when the latest attempt was not retryable" |
| Settled unit relaunched once | `restart-no-duplicates.test.ts` "an image attempt settled with budget left..." |
| Assembly settled and relaunched once | `restart-assembly.test.ts` first test (attempts are exactly `[1 transient, 2 success]`) |
| Held, continue and boot agree | `restart-recovery.test.ts` "launches the scenes it reports held..." |
| Unregistered stage reported | `server-boot-log.test.ts` "names the stages that have no restart recovery" |

Ticket acceptance criteria as the design states them (the ticket text itself is in Linear): AC1 and AC3, a session reads the same after a restart: "Every state survives" and "Paused session". AC2, pending work continues without User action: the scenes-queued, clip-not-sent and assembly rows. AC4, interrupted requests are awaited or recorded as failed attempts: the clip-held, image-lost, voice-over, timestamps, instructions and assembly rows.

## Part of the work that already passed

Group 2 (consultation) and the image and clip parts of group 3, and 4.1, passed on the first run as pinning tests: JOS-186 and the earlier stories already covered them. The voice-over pin passed once the test imported `voiceOverPhase.ts`, which registers its timeout handler. Group 5 passed as written, so no duplicate-send fix was needed.

## API contract (task 10.1)

No route or schema changed, so `docs/api-spec.yml` needs no change.
