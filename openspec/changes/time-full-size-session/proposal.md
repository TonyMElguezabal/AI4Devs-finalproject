## Why

The per-phase maximum times (voice and decomposition 600 s, video 1200 s) are provisional: the product's real workload, a 1,500-1,800 word script with 30-50 clips, has never been run end to end (README 2.4 and 4.1, MVP closure item M1, JOS-209). Without a full-size timing, the limits and the video stage's concurrency are guesses, and a long session can fail at a limit nobody measured.

## What Changes

- Add a read-only report that turns one session's stored attempts into the tables the ticket asks for: per stage the elapsed time, attempts and timed-out attempts; per clip the requested duration, generation time, attempts and outcome; and, for any attempt that reached its limit, the margin (limit divided by the slowest successful time).
- Run one full-size session with the real providers on the packaged Windows build, after the product owner approves the spend, and keep the report with the change.
- Decide, from the report, whether the limits and the stage concurrency stay. A change of limit is a separate OpenSpec change; this one only records the recommendation.
- Mark the README "provisional" wording confirmed or removed, and post the result on JOS-197.

Non-goals: changing any limit or the concurrency (follow-up change if the report recommends it), a new endpoint or screen, a general performance dashboard.

## Capabilities

### New Capabilities

- `session-timing-report`: a read-only report of one session's per-stage and per-clip timings with limit margins, produced offline from a copy of the database.

### Modified Capabilities

None.

## Impact

- New: one script under `backend/scripts/` and its test; a report under this change's `reports/`.
- Changed: `readme.md` sections 2.4 and 4.1 (Spanish), a comment on JOS-197.
- No change to the application at runtime, to the API or to the database schema. The paid run needs the owner's approval, a funded RunningHub balance and the real keys in the data folder of the build under test.
- The same Windows session also validates the packaged build for JOS-205 (task 7.2 of `package-executables-build`).
