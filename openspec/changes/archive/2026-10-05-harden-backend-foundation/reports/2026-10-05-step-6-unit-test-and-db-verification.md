# Step 6: unit tests and database verification (JOS-186, harden-backend-foundation)

Date: 2026-10-05. Branch `feature/jos-186-harden-backend-foundation`, after commit `39664c6`.

## 6.1 Baseline of the default store (`backend/data/skeleton.sqlite`)

This worktree is new (created for this change), and its default store was filled by my earlier test runs, which did not use a scratch path. So the baseline is the state those runs left, not a clean one. It is a throwaway store; the main checkout's `backend/data/` was never touched.

Read-only snapshot before the verification runs: 1 `runs`, 6 `scenes`, 6 `provider_requests`, 6 `scene_results`, 0 in `scene_video_results`, `voice_overs`, `narration_timestamps` and `stage_attempts`; 13 rows in `schema_migrations` (highest version 14); 17 triggers; `data/projects/` holding one folder (`restart concurrency ... 2026-10-05 12-07`).

All verification runs below used a scratch `DB_PATH` and `PROJECTS_ROOT` (`mktemp -d`).

## 6.2 Targeted tests

`concurrency`, `restart-concurrency`, `write-capacity`, `server-boot-log`, `video-provider`: 5 files, 35 tests passed.

## 6.3 Typecheck and full suite

| Check | Result |
| --- | --- |
| `npm run typecheck`, backend | clean |
| `npm test`, backend, run 1 | 1197 passed, 4 skipped (69 files passed, 3 skipped), 30.8 s |
| `npm test`, backend, run 2 | 1197 passed, 4 skipped (69 files passed, 3 skipped), 31.9 s |
| Backend, fresh worktree of HEAD with no `backend/.secrets.json` | 1197 passed, 4 skipped, 29.5 s |

The fresh worktree confirms local provider credentials do not mask a failure. This worktree never had a `.secrets.json` either.

### Flaky behaviour found and fixed

While writing the suite, `restart-concurrency.test.ts` failed in about one full-suite run in five (two different cases, a `waitFor` timeout). Cause: the stub provider's delivery timer can fire a millisecond before `sent_at + latency` on the wall clock; `handleProviderResult` then answers "not ready" and the delivery is dropped. With 10 to 80 ms latencies this showed up occasionally. The image-stage tests now deliver every due request inside their wait loop (`deliverDue`, idempotent). After the fix: 6 clean full runs, plus 15 runs of the two new files under 6 busy-loop processes, no failures. The stub's early-timer behaviour is older than this change and is left as it is.

## 300-scene write capacity (spec `concurrent-write-capacity`)

One session, 300 scenes, 600 deliveries (each request delivered twice, shuffled, one `setImmediate` each).

| Store | Runs (ms for 600 deliveries) | Min / median / max |
| --- | --- | --- |
| Default store | 578.1, 537.5, 541.2, 547.7, 538.9 | 537.5 / 541.2 / 578.1 |
| Scratch store (steps 6.2 and 6.3) | 754.7, 732.3, 712.5 | 712.5 / 732.3 / 754.7 |

All runs: 300 `scene_results` rows, 300 duplicate deliveries ignored, 300 applied, no store error, the same derived session state as the 3-scene case, and the same rows read through a second connection. The scratch store is slower because each run creates its database file from scratch; both are far below any limit that would matter at this scale. There was no failure, so no finding was recorded under task 4.2.

## 6.4 Post-test state

A second snapshot of the default store is identical to the baseline (row counts, migrations, triggers, `data/projects/` contents). Nothing needed restoring. The temporary fresh worktree was removed.

## Scenario coverage

| Scenario | Test |
| --- | --- |
| `restart-safe-concurrency`: pending requests occupy slots before new work launches | `restart-concurrency`: image stage, occupy slots before new work launches |
| More pending requests than the cap | `restart-concurrency`: video stage, count all of them and poll all right away |
| A slot frees when a resumed request settles | `restart-concurrency`: hand a freed slot to the waiting launch; video, send no new request until fewer than the cap are in flight |
| A request recorded as failed at boot holds no slot | `restart-concurrency`: a request the provider lost holds no slot, and its retry queues behind pending ones (also covers table order: the lost scene is reached first) |
| A release by a scene that holds no slot | `concurrency`: ignores a release by a holder with no slot |
| The same slot released twice | `concurrency`: frees one slot and starts at most one waiter |
| The cap holds across a restart and a burst of new work | `restart-concurrency`: never goes above the cap except for requests sent before the restart |
| The same scene is launched twice while queued | `concurrency`: queues a holder that is launched twice only once |
| A launch for a scene that already holds a slot | `concurrency`: ignores an acquire by a holder that already holds a slot |
| `concurrent-write-capacity`: 300 scenes complete at once with duplicate deliveries; the session reaches its final state | `write-capacity` |
| Measured write capacity is recorded | this report, table above |

Also covered: `occupy` (3 tests in `concurrency`), the stub video provider answering ids from before a restart (`video-provider`), and the boot log line (`server-boot-log`).
