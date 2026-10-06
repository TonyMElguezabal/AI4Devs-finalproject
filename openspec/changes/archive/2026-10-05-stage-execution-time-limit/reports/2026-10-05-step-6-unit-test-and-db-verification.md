# Step 6: unit tests and database verification (JOS-185, stage-execution-time-limit)

Date: 2026-10-05. Branch `feature/jos-185-stage-execution-time-limit`, after commit `b657cd6`.

## 6.1 Baseline of the default store (`backend/data/skeleton.sqlite`)

This worktree is new and its default store was filled by a few targeted runs I did not point at a scratch path, so the baseline is the state those runs left, not a clean one. It is a throwaway store; the main checkout's `backend/data/` was never touched.

Read-only snapshot before the verification runs: 1 `runs`; 0 in `scenes`, `provider_requests`, `scene_results`, `scene_video_results`, `voice_overs`, `narration_timestamps`; `stage_attempts` by outcome: 1 `scheduled`, 1 `success`, 4 `transient`; 14 rows in `schema_migrations` (highest version 15, the new migration); 17 triggers; one folder in `data/projects/`.

All verification runs below used a scratch `DB_PATH` and `PROJECTS_ROOT` (`mktemp -d`).

## 6.2 Targeted tests

`attempt-deadline`, `attempt-outcomes`, `attempt-timeout`, `late-result`, `image-time-limit`, `stage-attempt-recorder`, `stage-attempt-cycles`: 7 files, 80 tests passed.

## 6.3 Typecheck and full suite

| Check | Result |
| --- | --- |
| `npm run typecheck`, backend | clean |
| `npm test`, backend, run 1 | 1256 passed, 4 skipped (74 files passed, 3 skipped), 38.7 s |
| `npm test`, backend, run 2 | 1256 passed, 4 skipped (74 files passed, 3 skipped), 39.7 s |
| Backend, fresh worktree of HEAD with no `backend/.secrets.json` | 1256 passed, 4 skipped, 39.4 s |

The fresh worktree confirms local provider credentials do not mask a failure.

### Flaky behaviour

One test outside this change fails now and then under load: `orchestrator.test.ts` "pausing one session does not block another session's launch" (seen once in 8 full runs under CPU load), the same 5 ms stub-latency family as the "retry budget" case already recorded by JOS-186. Neither is touched by this change. The new test files were run 12 times together under 4 busy-loop processes and 8 times as part of full runs: no failure. The tests use an injected clock; the one place that needed care was the scheduler, which arms a real timer for a retry, so the shared fixtures start the clock a day ahead of real time (`voiceTimeoutFixtures.ts`).

## 6.4 Post-test state

A second snapshot of the default store is identical to the baseline (row counts, attempts by outcome, migrations, triggers, project folders). Nothing needed restoring. The temporary worktrees were removed.

## Coverage (`@vitest/coverage-v8` installed with `--no-save` for this measurement only)

| | Lines | Branches | Functions | Tests |
| --- | --- | --- | --- | --- |
| Base (`origin/feature/entrega-2-JAME`) | 91.52% | 92.47% | 98.50% | 1201 |
| This branch | 91.86% | 92.38% | 98.59% | 1256 |

Lines and functions rose; `voiceOverPhase.ts` lines went from 97.21% to 98.49%, and the new modules `attemptDeadline.ts` (100%), `attemptTimeoutWatcher.ts` (100% lines) and `stageAttemptRecorder.ts` (100% lines) are fully exercised. **Total branch coverage is 0.09 points lower**, from defensive null fallbacks (`sentAt ?? queuedAt`, `providerId ?? "unknown"`) and migration 15's rollback path, which has no test (migration 14's rollback has none either). Task 5.3 is ticked on that basis: nothing that existed lost coverage, and the dip is reported rather than hidden.

## Scenario coverage (`specs/stage-execution-time-limit/spec.md`)

| Scenario | Test |
| --- | --- |
| A scene waits behind the request limit | `image-time-limit`: a scene that waited behind the request limit |
| A session is paused before an attempt is sent | `attempt-timeout`: an attempt held by a pause |
| A stage with an undetermined limit | `attempt-deadline`: a stage whose maximum time is undetermined; `attempt-timeout`: a stage that has not registered a handler |
| A sent attempt never answers | `attempt-timeout`: a sent attempt that never answers (and the second sweep does not time it out twice) |
| The fourth attempt of a cycle times out | `attempt-timeout`, `stage-attempt-recorder`: A timeout |
| Each stage uses its own limit | `attempt-deadline`: each stage uses its own maximum time |
| The image provider never answers | `image-time-limit`: an image request that never answers |
| A late success arrives before the retry is sent | `late-result` |
| A late success arrives while the retry is in flight | `late-result` |
| A late success arrives after the stage already succeeded | `late-result` |
| A late success arrives after the cycle was exhausted | `late-result` |
| A late failure arrives | `late-result`: a late failure; a late result that cannot be used |
| The application restarts during an attempt | `attempt-timeout`: the clock survives a restart |
| The limit passed while the application was down | `attempt-timeout`: the clock survives a restart; the watcher at startup |

Also covered: the transitions and migration 15 (`attempt-outcomes`), a result racing a timeout (`attempt-timeout`), a late success after a manual retry opened a new cycle (`late-result`), and the log entries of a timeout and a late result (`attempt-timeout`: logging).
