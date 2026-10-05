# Design — Per-phase maximum execution time, measured from send

## Context

§10.1 sets hardcoded per-phase maximum times and states twice that waiting before a stage starts is not execution time: neither queued waiting behind the per-stage request cap nor waiting before a phase launches may count, or cause scenes that start later to fail prematurely. §9 holds new work during a pause while letting sent requests finish, and §2.3 excludes cancelling a request already sent. §12.1 requires that a restart does not lose progress and that a repeated success confirmation never duplicates a result or launches the next stage twice.

`generate-voice-over` (JOS-136) persists `queuedAt` and `sentAt` on every attempt before the request goes out. `bounded-retry-policy` (JOS-184) provides `StageAttemptRecorder` (records an outcome and applies the retry decision), `RetryScheduler` (persists scheduled attempts with `dueAt` and claims them with a conditional `scheduled → in-flight` update), and the store-enforced four-attempt cap. `define-provider-configuration` (JOS-165) sets each stage's maximum time from a distribution of real runs measured from send (its Decision 7). US-28 owns resuming in-flight requests after restart; US-29 owns the general duplicate-confirmation rule.

## Goals / Non-Goals

**Goals:**
- A timeout that starts at send, never at queue time.
- A timed-out attempt handled exactly like any transient failure, through the existing retry policy.
- A late result that is neither lost nor allowed to complete a stage twice.
- A clock that survives restarts without resetting.

**Non-Goals:**
- Cancelling the provider request on timeout — excluded by §2.3; the request runs to its end.
- The retry budget, backoff and cycles (JOS-184).
- Recovering an in-flight request's result after a restart (US-28); this change only times it.
- Choosing the per-phase values (JOS-165).

## Decisions

**Decision 1 — The deadline is derived from `sentAt`, not held in a timer.**
`deadline = sentAt + maxExecutionTime(stage)`. A single `AttemptTimeoutWatcher` periodically selects in-flight attempts whose deadline has passed and times them out. Attempts not yet sent have no `sentAt` and are never selected.
A stage whose maximum time is `"undetermined"` in the constants module (assembly today, pending `define-media-assembly`) has no deadline and is never selected; filling in the value turns the watcher on for it with no code change (product owner decision, 2026-10-05).
*Alternatives:* an in-memory timer per attempt (rejected: lost on restart, and at two hundred scenes it is two hundred timers to keep consistent with the store); starting the clock at `queuedAt` (rejected: §10.1 — this is exactly the premature failure the PRD forbids).

**Decision 2 — A timeout is recorded as its own outcome and classified transient.**
The watcher claims the attempt with a conditional `in-flight → timed-out` update and passes a transient failure to `StageAttemptRecorder`. The retry policy then decides, as for any transient failure.
*Alternatives:* a separate timeout policy (rejected: a second path to the retry budget is how §10.1's "internal recovery must not multiply the limit" gets broken); classifying a timeout as not retryable (rejected: a slow provider is the textbook transient failure).

**Decision 3 — The conditional update decides the race between a timeout and a result.**
Both the watcher and the result handler move the attempt out of `in-flight` with a conditional update. Whichever wins defines the outcome; the loser sees the attempt already moved and takes the late-result path.
*Alternatives:* locking the stage instance for the whole attempt (rejected: it holds a lock for minutes of provider latency and serialises unrelated work).

**Decision 4 — A late result goes through the same completion path as an on-time one.**
Late results are delivered to the ordinary result handler, which completes the stage instance through its idempotent completion (the store-enforced one-result-per-stage-instance rule, as `generate-voice-over` does for the voice-over). If completion succeeds, the attempt becomes `late-success` with `lateResultAt`; if it collides with an existing result, the attempt becomes `superseded`.
*Alternatives:* a special late-result handler (rejected: a second completion path is a second place for duplication bugs); discarding every late result (not adopted: it throws away a paid, valid generation and pays again — JOS-154 open question 2 recommends accepting it, pending product confirmation).

**Decision 5 — Accepting a late result cancels only what has not been sent.**
On acceptance, any scheduled attempt for the stage instance is moved `scheduled → cancelled` with the same conditional update the scheduler uses to claim it, so exactly one of "cancel" and "send" wins. A retry already in flight cannot be cancelled (§2.3); when it answers, its result collides with the accepted one and is recorded as `superseded`.
*Alternatives:* waiting for the in-flight retry and choosing between results (rejected: it adds latency for no gain; the first valid result is as good as the second).

**Decision 6 — A late success can lift a `failed` stage instance, but not after a manual retry.**
If the cycle was exhausted and no manual retry has started, a late success completes the stage instance and clears its failure. Once a manual retry has opened a new cycle, the new cycle owns the outcome and results from earlier cycles are recorded as `superseded`.
*Alternatives:* never lifting `failed` (not adopted: the User would be asked to retry a stage whose result already exists); letting earlier cycles race the new one (rejected: two cycles competing for one stage instance makes US-34's diagnostics unreadable).
This is the part of JOS-154 open question 2 most in need of product confirmation.

**Decision 7 — A late failure is recorded, and changes nothing else.**
A failure arriving for a timed-out attempt is stored as detail on that attempt; it consumes no budget and schedules nothing, because the timeout already did.

**Decision 8 — The watcher runs at startup and on a short fixed interval.**
At startup it immediately times out every in-flight attempt whose deadline passed while the application was down, unless US-28's resumption recovers its result first; afterwards it runs on an interval well below the smallest per-phase maximum time, so a timeout is detected within a bounded lag.
*Alternatives:* scanning only on demand (rejected: a hung attempt with no other activity would never be noticed).

**Decision 9 — The watcher times attempt rows; the scene-level image stage is limited at its adapter.**
`AttemptTimeoutWatcher` selects `stage_attempts` rows that are `in-flight`. Those exist for the session-level stages (voice-over, timestamps, decomposition, assembly). The scene-level image and video stages do not record attempt rows: they track attempts on `scenes` and retry through `scenes.attempts`. So the image stage gets the same limit where its request is made: the Fal.ai adapter's default `timeoutMs` is the image stage's maximum time, started when the call is made (after the request-cap slot is taken, so queue time is excluded by construction). The video stage keeps its existing poll limit in `pollVideoRequestOnce`. A stage opts into the watcher by registering a timeout handler that presents its failure (`registerTimeoutHandler`); a stage without one is never timed out there, because its attempt would end `timed-out` with nothing on the session saying so. Today only **voice-over** registers: it is the one stage that records its outcome through the recorder and has no limit of its own. Timestamps and decomposition close their attempts directly and already abort their request at the limit (alignment 5 s, decomposition 20 s); they register when they adopt the recorder. An aborted call is a transient failure through the stage's own retry path. Because the call is aborted, a result cannot arrive late for image; late results apply where the call keeps running after the watcher marks the attempt (voice-over). Decided by the product owner on 2026-10-05.
*Alternatives:* moving image and video onto `stage_attempts` and the recorder (rejected for this change: it is a migration of two stages' retry paths owned by JOS-145 and JOS-146, not a time limit); leaving image without a limit (rejected: a hung Fal.ai call would wait forever).

## Risks / Trade-offs

- **The per-phase values are too tight** → Healthy requests time out and burn budget. JOS-165 Decision 7 sets them above the slow tail of measured runs; this change reads them, it does not choose them.
- **Accepting a late result is not confirmed by the product owner** → Decisions 4–6 isolate it in the result handler's collision branch; switching to "always discard" is a one-branch change, and the tests name the behaviour explicitly.
- **The watcher and US-28's resumption both act at startup** → The ordering is fixed: resumption first, then the watcher. Both use conditional updates, so the worst case is a timeout recorded moments before a recovered result arrives, which then takes the late-result path.
- **Detection lag** → A timeout is detected up to one watcher interval late. Acceptable: the limit is a safety net measured in minutes, not a precise deadline.
- **Stages whose adapter cannot receive a late result** → Some providers only answer on the open connection. For those, a late result is impossible and the design degrades to "timeout, then retry". The adapter records which case applies.

## Migration Plan

The migration adds the outcomes `timed-out`, `superseded`, `late-success` and `cancelled`, and the `lateResultAt` column. No existing rows change. Rollback removes the watcher; in-flight attempts then wait indefinitely, as before this change.

## Pre-implementation findings (group 1 gate, 2026-10-05)

**1.1 Foundations landed.** `bounded-retry-policy` (JOS-184, PR #27) is in the integration branch: `recordAttemptOutcome` (`retry/stageAttemptRecorder.ts`), `RetryScheduler` (`retry/retryScheduler.ts`) and the conditional `scheduled → in-flight` claim (`claimScheduledAttempt`, `db.ts`). The attempt table's outcome check allows only `scheduled`, `in-flight`, `success`, `transient`, `not-retryable`; group 3 adds the new outcomes.

**1.2 Per-phase maximum times.** PRD §11.3 and `PER_PHASE_MAX_TIME_SECONDS` (`config/providers.ts`) record decomposition 20 s, image 25 s, voice 10 s, alignment 5 s and video 240 s. **Assembly is `"undetermined"`** (waiting on `define-media-assembly`'s measurement; JOS-185's own thread suggests a limit proportional to the video's duration, because 40 scenes took 44 s and 200 scenes 166 s). The watcher has no value to read for assembly.

**1.4 Which adapters can receive a late result, and what already times out.** The premise that a hung request waits forever is only true for some stages today:

| Stage / adapter | Client-side limit today | Late result possible after the limit? |
| --- | --- | --- |
| Decomposition, reasoning (`visualInstructions.ts`) | `AbortSignal.timeout(20 s)` by default | No: the call is aborted, the failure is transient |
| Alignment (`alignmentProvider.ts`) | `AbortSignal.timeout(5 s)` by default | No: aborted |
| Voice (ElevenLabs, `voiceProvider.ts`) | Only if `timeoutMs` is passed; the default registry passes none | Yes while the call is still awaited (nothing aborts it) |
| Image (Fal.ai, `imageProvider.ts`) | Only if `timeoutMs` is passed; the default registry passes none | Yes while the call is still awaited |
| Video (RunningHub) | Inline check in `pollVideoRequestOnce`: stops polling after 240 s and records a transient failure | A result could still be fetched by task id, but polling has stopped |
| Assembly (local ffmpeg) | None; no maximum time defined | n/a |

So the watcher is the only timeout for voice and image (and for any attempt whose process died), and it overlaps with the inline limits of decomposition, alignment and video. Recommended: leave those inline limits in place as the first line of defence (they abort a hung socket, which the watcher cannot), and let the watcher's conditional claim decide any race. A race between an adapter's own timeout failure and the watcher is already handled by Decision 3.

**1.3 confirmed 2026-10-05** (accept late results, Decisions 4-6 as written); **assembly's missing limit decided 2026-10-05** (stage not timed until defined, Decision 1). **Still unconfirmed:** `pause-and-continue-session` Decision 9 (a pause does not freeze the clock of a sent request) is still marked as awaiting confirmation (its Open Question 1).

## Open Questions

1. ~~Product confirmation for accepting late results~~ — **confirmed 2026-10-05**: accept it, including lifting an exhausted `failed` stage instance before any manual retry (Decisions 4-6 stand as written).
2. **Can every chosen provider deliver a result after the client stopped waiting?** Depends on each provider's API (polling or webhook vs a single blocking call); recorded per adapter.
3. ~~Watcher interval~~ — **decided**: 1 s, a constant in the watcher module (`CHECK_INTERVAL_MS`), well below the smallest per-phase maximum time (alignment, 5 s). It is an implementation detail with no user-visible effect, so it does not join PRD §11.
