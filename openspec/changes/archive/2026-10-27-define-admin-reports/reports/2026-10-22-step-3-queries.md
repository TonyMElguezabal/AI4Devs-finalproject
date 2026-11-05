# Step 2-3: the scratch store and the report queries (JOS-175, define-admin-reports)

Date: 2026-10-22. Branch `feature/jos-175-define-admin-reports`. No product code was changed; the files used are `poc/launch.ts` (the real server with stubbed providers and a call log written by the stubs), `poc/seed.py` (the driver) and `poc/queries.sql`. The scratch store, projects folder and key file were in the session scratchpad and were deleted afterwards; the default store was not touched. The raw output of the queries is in `step-3-queries-output.txt`.

## 2. The scratch store

Seven sessions, run through the real server code (HTTP, orchestrator, retry scheduler, store), with `stub-a` failing on demand and `stub-b` always succeeding:

| Session | What it exercised |
|---|---|
| S1 clean on stub-a | a normal run, every stage on `stub-a` |
| S2 voice recovers | the first voice call fails transiently, the automatic retry succeeds |
| S3 voice exhausted then retried | four transient voice failures (budget exhausted), then a manual retry that succeeds |
| S4 voice not retryable | a not-retryable voice failure: the session fails with no manual retry |
| S5 image recovers | one transient image failure, recovered by an automatic retry |
| S6 clip exhausted then rebound and retried | both clips fail until the budget is exhausted (eight transient attempts); the scenes' clip binding is then rewritten to `stub-b`, as a JOS-172 move does, and the manual retries succeed |
| S7 clean on stub-b | after every active provider was switched to `stub-b` |

Their timestamps were then shifted back by 40, 20 and 5 days (S1-S2, S3-S4, S5-S6) so that they fall on four different days (the narration tables' update locks were lifted in the scratch store only to do this). Row counts: `runs` 7, `scenes` 12, `stage_attempts` 30, `provider_requests` 33, `voice_overs` 6, `narration_timestamps` 6, `scene_results` 12, `scene_video_results` 12, `provider_profiles` 5, `active_providers` 5. `stage_attempts` holds only `voice-over` (11), `timestamps` (5), `decomposition` (5) and `assembly` (4) rows: **no image or video rows**, confirming that scene-level attempts live only in `provider_requests`.

The call log written by the stubs (an independent record) held 57 calls: alignment 5 `stub-a` and 1 `stub-b`; image 10 success and 1 transient on `stub-a`, 2 on `stub-b`; reasoning 5 and 1; video 8 success and 8 transient on `stub-a`, 4 success on `stub-b`; voice 5 success, 5 transient and 1 not-retryable on `stub-a`, 1 on `stub-b`.

## 3. The queries against the known counts

| Report | Result | Matches the call log? |
|---|---|---|
| R1 Provider usage | counts, success rates, median and 95th-percentile latency and billed units for ten stage and provider groups | Every group matches **except video**: the log has `stub-a` 8 success + 8 transient and `stub-b` 4 success, while R1 shows `stub-a` 8 attempts and `stub-b` 12 attempts (4 success, 8 transient). The eight failed clip attempts ran on `stub-a` but are attributed to `stub-b`, the scene's current binding after the rebinding. This is the gap of design Decision 2 (no provider id on scene attempts), shown on real data. Billed units match: voice 320 and 64 characters, image 10 and 2, clip seconds 68 and 34, alignment 84.8 and 17.0 audio seconds. |
| R3 Failures and retries | failed attempts per stage and outcome (voice 5 transient and 1 not-retryable, image 1, video 8); the session stages' failure wording (`stub voice answered HTTP 503` 5, `stub voice rejected the input` 1); cycles whose fourth attempt failed (voice 1) and manual retries (voice 1) | Yes. The video failures carry the same misattribution as R1. No scene-stage manual retries or exhausted cycles are recorded (the query can only show scenes that are failed now: none). |
| R4 Sessions | seven rows with the derived state (`final video ready`, `failed: voice-over`), scenes, failed scenes, attempts (7, 8, 11, 1, 8, 15, 7), seconds to the voice-over and to the final video, and a scene drill-down | Yes: the seven attempt counts add up to 57, the number of calls in the log; the not-retryable session shows 1 attempt and no phase times. |
| R2 Estimated cost (sketch) | units per provider with `pricePerUnit` read from the profile's parameters | Computable once a price exists: with none, every provider shows `unpriced`, which is what the report must show. |
| R6 Pipeline time (sketch) | voice-over and assembly durations exact; decomposition and scene phases approximate | Partly: decomposition ends only at the first image request and the scene phase has no start stamp of its own. |
| R7 Provider changes (sketch) | `active_providers` holds only the last choice and its time | Not computable: five rows, no history. |

## Findings for the catalogue

1. The per-provider numbers of the scene stages are wrong after a provider move until `provider_requests` carries the provider (Decision 2, confirmed by the video row).
2. `error_code` is not usable; the failure wording is (Execution Record §1.2).
3. Scene-stage manual retries and exhausted cycles are not recorded; R3 shows them only as scenes failed now.
4. R4's state is derived (no state column): failed phase from `runs.failure`, final video from the successful assembly attempt; `paused` is a separate flag that a story may add as a column.
5. Percentiles need the window-function form used here (SQLite has no percentile function); it is fast for the sizes involved.
