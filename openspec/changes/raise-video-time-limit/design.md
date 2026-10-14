## Context

`PER_PHASE_MAX_TIME_SECONDS.video` is read by two places: the orchestrator's poll check (`orchestrator.ts`, `elapsed > limit * 1000` fails the request as transient) and the attempt-deadline watcher (`attemptDeadline`, which times out in-flight attempts). The value was 240 s, from 4-7 samples of 141-159 s (JOS-165). One real 5 s clip at 2K now takes 344 s (JOS-196, `reports/2026-10-14-step-5-live-api-check.md`). A timed-out attempt is retried, and each retry creates a new billable task.

## Decisions

**Decision 1 — 600 s for voice and decomposition, 1200 s for video.** Observed at the product's real scale: voice 151 s for 10,217 characters (4x margin), decomposition 208.6 s for 67 fragments (2.9x; 75 s for 11, so it grows with the number of scenes, sub-linearly), and video clips whose time grows with their duration: 394 s for 7 s, 454 s for 10 s, 528 s for 12 s, 546 s for 13 s and **over 610 s three times for 14 s**, with 15 s admitted. 1200 s is about twice the extrapolated time of a 15 s clip (about 600-700 s). One round value keeps the three rows easy to state and review; it leaves a slower tail without making a stuck task wait many minutes. Image (25 s, calls of about 10 s) and alignment (5 s, unused when native timestamps are usable) are unchanged. It stays provisional: JOS-165's rule ("set above the observed slow tail") is kept, and the row is revisited when a real session has produced 10 or more clips. *Alternative:* 900 s (rejected: delays a real failure by 15 minutes with one sample showing 344 s); keeping 240 s with more concurrency (rejected: does not remove the timeouts).

**Decision 2 — Only the constant changes in `src`.** Both readers take the value from the constant; the existing deadline tests derive their numbers from it.

**Decision 3 — The PRD comparison reads `docs/PRD.md`.** `providerConfig.test.ts` read the frozen `docs/PRD-v1.4.md`, which can never change, so a new value could not be recorded in the PRD and still pass. The current file is the one the test's own comment calls "the PRD's own row".

## Risks / Trade-offs

- [A 15 s clip is slower than extrapolated] → 1200 s is provisional; the timings of a full-size session are recorded and the row revisited. [A timed-out clip is resubmitted while the first task keeps running and is billed] → a retry policy that keeps polling the same task is out of scope here and recorded as a follow-up.
- [A genuinely stuck task now holds a cap slot for 10 minutes] → the video cap is 3 requests; accepted for one user.

## Open Questions

None.
