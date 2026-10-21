# Design — Bounded retry policy for provider stages

## Context

§10.1 fixes the budget — up to three automatic retries after the initial attempt — and three constraints around it: a not-retryable failure skips retries; waiting before a stage starts is neither a failed attempt nor execution time; and internal recovery must not multiply the functional limit. §10.2 and D06 make each manual retry open a new cycle of up to three automatic retries. §9 extends a pause to "every not-yet-launched generation, phase, and retry (automatic or manual)". §8.1 and §8.2 define no "retrying" state: a session or scene stays in its in-progress state until it completes or fails. §11.2 keeps a stage on its bound provider for all retries. §12.1 requires that progress survives restarts.

Three proposed changes shape this one. `generate-voice-over` (JOS-136) introduces the append-only StageAttempt record written before each request (after `define-persistence` Decision 2), the single phase-launch gate (its Decision 1), provider adapters that return an already-classified error (its Decision 4), and a retry hook whose default fails the session (its Decision 10). `define-persistence` (JOS-181) settles that invariants are enforced by the store rather than by a prior read (Decision 3), and that queues are rebuilt at startup from persisted state (Decision 5). `define-provider-configuration` (JOS-165) owns every hardcoded value and the not-retryable signal per provider.

The ticket was split: this change is US-22a. The per-phase maximum execution time and late results after a timeout are US-22b (JOS-185), which depends on this one.

## Goals / Non-Goals

**Goals:**
- One retry policy for every provider stage, replacing the placeholder hook in `generate-voice-over`.
- A budget no combination of concurrency, redelivery or restart can exceed.
- Retries that obey pause and the request cap without their own code for either.
- Scheduled retries that survive a restart.

**Non-Goals:**
- Classifying failures — the adapters do it, from US-33's recorded signals.
- The per-phase maximum execution time and late results (US-22b).
- Manual-retry endpoints and the IMAGE/VIDEO correction (US-23 to US-27); they call `startNewCycle`.
- Session-level aggregation when a scene fails (§8.1; US-19).
- Implementing pause (US-20) or the request cap (US-37); this change only routes retries through the gate they extend.
- Provider switching of any kind (§11.2, D03).

## Decisions

**Decision 1 — The unit of budget is the stage instance, keyed explicitly.**
`stageInstanceKey` is `(sessionId, stage)` for voice, decomposition and assembly, and `(sessionId, sceneId, stage)` for image and video. Decomposition covers timestamps, alignment, segmentation and instructions as one instance, because §5 makes them share one state and one retry policy.
*Alternatives:* a budget per session (rejected: one bad scene would exhaust the budget of two hundred healthy ones); a separate budget for alignment within decomposition (rejected: §5 and §10.3 put the switch to alignment inside the decomposition retry, not beside it).

**Decision 2 — The policy is a pure function; everything with side effects sits around it.**
`RetryPolicy.decide(outcome, attemptsInCycle, retryAfter?) → Complete | ScheduleNext(dueAt) | Fail(retryable)`. `StageAttemptRecorder` persists the outcome and applies the decision; `RetryScheduler` releases due attempts into the gate.
*Alternatives:* retry logic inside each stage (rejected: six copies of the same loop, each a new chance to break §10.1); a retry decorator around adapter calls (rejected: it retries in memory, which loses the budget on restart and bypasses the gate — exactly the "internal recovery" §10.1 forbids).

**Decision 3 — Enforce the cap in the store.**
A unique constraint on `(stageInstanceKey, cycle, sequenceInCycle)` and a check `sequenceInCycle BETWEEN 1 AND 4`. The recorder allocates the next sequence number in the same transaction that inserts the attempt; a collision means another path already recorded it and is treated as "already handled".
*Alternatives:* reading the attempt count before inserting (rejected: `define-persistence` Decision 3 — two concurrent failures both read 3 and both insert a fourth, or worse, a fifth); an in-memory counter (rejected: lost on restart).

**Decision 4 — Retries go through the phase-launch gate, never around it.**
A scheduled retry becomes due, then enters the same gate as a first attempt. Pause (US-20) and the per-stage request cap (US-37) are applied by the gate, so a retry cannot overtake queued first attempts or bypass a pause.
*Alternatives:* sending retries directly (rejected: §9 explicitly holds retries during a pause, and §10.1's first-come, first-served cap would be bypassed by exactly the traffic most likely to be hitting a rate limit).

**Decision 5 — Delay retries with capped exponential backoff, honouring the provider's own wait instruction.**
`dueAt = now + max(retryAfter, min(base × 2^(sequence−1), cap))`, with `base` and `cap` hardcoded per stage in the constants module.
*Alternatives:* retrying immediately (rejected: a rate limit or a brief outage would consume all four attempts in seconds, turning a recoverable failure into a manual one); a fixed delay (not adopted: simpler, but either too short for outages or needlessly slow for blips).
**This is a new hardcoded parameter the PRD does not list.** It must be added to PRD §11 through US-33 as a version bump before implementation (task 1.4); the design fixes the shape, not the numbers.

**Decision 6 — Disable every retry below the policy.**
Each adapter configures its HTTP client and SDK with automatic retries off, and has a test proving it. The job that sends an attempt is idempotent on the attempt record: a redelivered job finds the attempt already `in-flight` or finished and does nothing. A request resumed after restart (US-28) keeps its attempt record.
*Alternatives:* leaving library retries on "for resilience" (rejected: §10.1 — a library that retries three times under each of four attempts sends sixteen paid requests).

**Decision 7 — A manual retry is a new cycle on the same stage instance.**
`startNewCycle(stageInstanceKey)` requires the instance to be `failed`, increments `cycle`, records the next attempt with `trigger = manual` and `sequenceInCycle = 1`, and returns the instance to its in-progress state. The earlier cycles stay in the append-only record for US-34.
*Alternatives:* resetting the attempt count in place (rejected: it destroys the history US-34 must display and §8.1 says stays visible).

**Decision 8 — No new user-visible states.**
While automatic retries run, the session or scene stays in its in-progress state; the attempt record, not the state, carries "retrying". The failure object gains `cycle`, `attemptsInCycle` and `manualRetryAvailable`.
*Alternatives:* a `retrying` state (rejected: §8.1 and §8.2 enumerate the states, and a new one would ripple into every UI and state-machine story).

**Decision 9 — Scheduled retries are persisted, and rebuilt at startup.**
A scheduled attempt is recorded with `dueAt` and outcome `scheduled`; at startup the scheduler loads every scheduled attempt and releases those due. Sending is guarded by the attempt's state, so a retry is sent exactly once even if the scheduler runs twice.
*Alternatives:* in-memory timers (rejected: a restart silently drops every pending retry, leaving stage instances in an in-progress state forever — a hang no rule in the PRD would ever resolve).

## Risks / Trade-offs

- **Retry delays are unset because PRD §11 is silent** → Task 1.4 blocks implementation until US-33 records them; the tests use injected values so the policy can be built and verified independently.
- **An adapter misclassifies a permanent failure as transient** → It costs three extra paid attempts, bounded by Decision 3. The adapter's classification tests (from US-33's signals) are the mitigation; this change does not second-guess them.
- **Backoff delays a stage behind a pause or a busy queue** → Intended: §10.1 excludes waiting from execution time, and US-22b measures time from send.
- **Scheduler and gate race on a due retry** → The send path claims the attempt by moving it from `scheduled` to `in-flight` in one conditional update; only the claimant sends.
- **Every stage story must adopt the recorder** → Documented as a standard (task group 8), and `generate-voice-over`'s placeholder hook is removed so there is no second path to copy.
- **History grows without bound** → The MVP sets no retention limit (`define-persistence` records the consequence); attempts are small rows.

## Migration Plan

The migration adds the StageAttempt fields and constraints. Existing attempt rows, if any, are backfilled as `cycle = 1` with `sequenceInCycle` in `sentAt` order; rows beyond four in one cycle would indicate a pre-existing violation and fail the migration loudly rather than being truncated. Rollback drops the new columns and restores the `generate-voice-over` placeholder hook.

## Open Questions

1. **Retry delay values (blocking).** Base and cap per stage, and whether a provider's `Retry-After` may exceed the cap. Owned by US-33, recorded in PRD §11.
2. **Should `Retry-After` beyond the per-phase time limit fail the stage early?** Interacts with US-22b; decided there.
3. **Which story owns the session aggregation rule when a scene fails (§8.1)?** Recommended: US-19; this change only sets the scene's stage instance to `failed`.
4. **"Keeps retrying until it recovers" (§11.2).** Read as "across manual retries", consistent with AC08's bounded budget; to be confirmed by the product owner.
