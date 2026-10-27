# Step 7: manual endpoint testing (JOS-223, report-provider-usage)

Date: 2026-10-22. The real server (spike's `poc/launch.ts`: real routes, orchestrator, retry scheduler and store, stub providers) ran on a scratch store, projects folder and key file in the session scratchpad, port 3911, `ALLOW_TEST_ENDPOINTS=1`, with a test Administrator password. The spike's `poc/seed.py` drove seven sessions: successes, transient failures recovered and exhausted, a not-retryable voice failure, a clip stage rebound to `stub-b` after failing on `stub-a` (what a JOS-172 move does), and a switch of every active provider. The spike's seed has no timed-out attempt and no native-timestamps session, so on the scratch store only one voice attempt was set to `timed-out` and one `timestamps` attempt to `elevenlabs-native` with `sqlite3`.

## Results

| Step | Request | Result |
|---|---|---|
| 7.2 | no `Authorization`; `Bearer nope` | 401; 401 |
| 7.3 default (no params) | `GET /admin/reports/provider-usage` | 200, `from: null`, `to` = now, `sceneAttemptsFollowCurrentProvider: true`, 10 rows (5 stages x `stub-a`, `stub-b`), 56 attempts |
| 7.3 `from` 7 days ago | | 10 rows, 30 attempts |
| 7.3 `from` 30 days ago | | 10 rows, 42 attempts |
| 7.3 custom `from` 30 days ago, `to` 7 days ago | | 5 rows, 12 attempts |
| 7.3 `from` with offset `2026-09-22T22:45:27.000+02:00` | | `from` echoed as `2026-09-22T20:45:27.000Z`, 10 rows (same as the UTC form) |
| 7.4 | `from` after `to`; `from` = `to`; `from=yesterday`; `to=tomorrow`; `from=2026-10-01` | 400 each, message names `from` or `to` |
| empty period | `from=2099-01-01…&to=2099-02-01…` | 200, `rows: []` |

## Comparison with the spike's R1 query (7.3)

The R1 select of `poc/queries.sql` was run with `sqlite3` on the same store for the same four periods and compared on attempts, successes, transient, not-retryable, timed-out, success rate, median, 95th percentile, unit and billed units for every row.

- With the query as written: all counts, rates, units and billed units match; **median and 95th-percentile latency are 1 ms lower in the query for some session-level rows**. Cause: the query takes `CAST((julianday(finished) - julianday(sent)) * 86400000 AS INTEGER)`, which truncates a floating-point result (for example `20:44:50.901` to `20:44:50.970` is 69 ms, the query gives 68). The endpoint subtracts the two instants exactly.
- With the query's latency expression rounded instead of truncated: **0 mismatches** in all four periods (10, 10, 10 and 5 rows).
- The timed-out attempt appears as `timedOut: 1` on `stub-a` voice; the native-timestamps attempt is in no alignment row (`stub-a` alignment has 4 attempts, not 5).
- Video `stub-b` shows 12 attempts (4 successes, 8 transient): the eight failed attempts ran on `stub-a` and follow the scene's current binding, the documented limit until JOS-222 (the response flag and the section note say so).

## Content and side effects (7.5)

- Searching all four response bodies for the session scripts, the stub failure texts (`stub voice answered HTTP 503`, `rejected the input`), the generated image and video instructions and the password: 0 matches each.
- Row counts before and after the report calls: `runs` 7, `scenes` 12, `stage_attempts` 30, `provider_requests` 33, `voice_overs` 6, `provider_profiles` 5; identical.

## Cleanup (7.6)

The server was stopped (ports 3911 and 5173 free), the scratch folder was deleted, and `backend/data/` does not exist in the worktree: the default store was not touched. The scratch store was kept until step 8 finished, as task 8.2 reuses it.
