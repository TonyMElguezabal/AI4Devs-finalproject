## Context

`PER_PHASE_MAX_TIME_SECONDS.video` is read by two places: the orchestrator's poll check (`orchestrator.ts`, `elapsed > limit * 1000` fails the request as transient) and the attempt-deadline watcher (`attemptDeadline`, which times out in-flight attempts). The value was 240 s, from 4-7 samples of 141-159 s (JOS-165). One real 5 s clip at 2K now takes 344 s (JOS-196, `reports/2026-10-14-step-5-live-api-check.md`). A timed-out attempt is retried, and each retry creates a new billable task.

## Decisions

**Decision 1 — 600 s for voice, decomposition and video.** Observed at the product's real scale: video 344 s for a 5 s clip (1.7x margin), voice 151 s for 10,217 characters (4x), decomposition 208.6 s for 67 fragments (2.9x; 75 s for 11, so it grows with the number of scenes, sub-linearly). One round value keeps the three rows easy to state and review; it leaves a slower tail without making a stuck task wait many minutes. Image (25 s, calls of about 10 s) and alignment (5 s, unused when native timestamps are usable) are unchanged. It stays provisional: JOS-165's rule ("set above the observed slow tail") is kept, and the row is revisited when a real session has produced 10 or more clips. *Alternative:* 900 s (rejected: delays a real failure by 15 minutes with one sample showing 344 s); keeping 240 s with more concurrency (rejected: does not remove the timeouts).

**Decision 2 — Only the constant changes in `src`.** Both readers take the value from the constant; the existing deadline tests derive their numbers from it.

**Decision 3 — The PRD comparison reads `docs/PRD.md`.** `providerConfig.test.ts` read the frozen `docs/PRD-v1.4.md`, which can never change, so a new value could not be recorded in the PRD and still pass. The current file is the one the test's own comment calls "the PRD's own row".

## Risks / Trade-offs

- [A 10 s or 15 s clip takes longer than a 5 s one] → 600 s is provisional; the first real session's timings are recorded and the row revisited.
- [A genuinely stuck task now holds a cap slot for 10 minutes] → the video cap is 3 requests; accepted for one user.

## Open Questions

None.
