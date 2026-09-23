# Bounded retry policy for provider stages

Linear-Issue: JOS-184

## Why

Every stage that calls a provider — voice, decomposition, image, video, assembly — can fail for reasons that go away on their own: a timeout, a 5xx, a rate limit. §10.1 gives each stage a fixed answer: up to three automatic retries after the initial attempt, never more, and none at all for a failure the provider says will never succeed. §10.2 and D06 add that each manual retry starts a fresh cycle. Without a single policy, each stage story would implement its own loop, and §10.1's warning that "internal recovery mechanisms must not multiply the functional limit" would be violated the first time an HTTP client, an SDK or a queue redelivery retried underneath one of them.

`generate-voice-over` (JOS-136) is the first stage to need this, and deliberately stops short: it classifies each failure and hands it to a retry hook whose default fails the session (its Decision 10). This change replaces that hook with the real policy, once, for every stage.

## What Changes

- Introduce the **stage instance** as the unit of the retry budget: `(sessionId, stage)` for voice, decomposition and assembly; `(sessionId, sceneId, stage)` for image and video.
- Allow at most **4 attempts per stage instance per cycle** (1 initial + 3 automatic), and **enforce the cap in the store**, so concurrent failures, duplicate notifications, restarts or redeliveries cannot produce a fifth (§10.1, AC08).
- On a **transient** failure with budget left, schedule the next attempt with a delay and send it back through the phase-launch gate, so pause (US-20) and the request cap (US-37) apply to retries exactly as to first attempts (§9, §10.1).
- On **exhaustion**, set the stage instance to `failed` with a readable cause, `retryable: true` and `manualRetryAvailable: true`; schedule nothing further (§10.1).
- On a **not-retryable** failure, set `failed` at once with the cause and `retryable: false`, whatever the attempt count (§4.1, §10.1).
- Provide `startNewCycle(stageInstanceKey)` for the manual-retry stories (US-23 to US-27): a new cycle of up to 4 attempts, with earlier cycles kept for diagnostics (§10.2, D06).
- **Disable** HTTP-client and SDK automatic retries in every provider adapter, so one provider call is exactly one recorded attempt (§10.1).
- **Persist** scheduled retries (`dueAt`) so a restart neither loses nor duplicates them (§12.1).
- Keep the session or scene in its in-progress state during automatic retries; add no user-visible states (§8.1, §8.2).
- Expose `cycle`, `attemptsInCycle` and `manualRetryAvailable` on the failure in the session representation and in live-update events.

## Capabilities

### New Capabilities

- `stage-retry-policy`: how a provider stage's failures are retried — the stage instance and its per-cycle budget, what happens on transient, not-retryable and exhausted failures, how manual retries open a new cycle, and the guarantees that no mechanism can exceed the budget and no scheduled retry is lost.

### Modified Capabilities

None. `openspec/specs/` is still empty. `voice-over-generation` (from `generate-voice-over`) is not yet archived; its requirement "A transient failure is classified and handed to the retry policy" already anticipates this capability and is satisfied by it, without a delta.

## Impact

- **Blocked on**: `define-backend-stack` (JOS-179) and `define-persistence` (JOS-181); `define-provider-configuration` (JOS-165) for the not-retryable signal per provider and the **retry delay values**, which PRD §11 does not yet list (JOS-154 open question 1); `generate-voice-over` (JOS-136), which introduces the StageAttempt record and the phase-launch gate this change extends.
- **Data model**: StageAttempt gains `stageInstanceKey`, `cycle`, `sequenceInCycle`, `trigger` and `dueAt`, with a uniqueness and a check constraint; the failure object gains `cycle`, `attemptsInCycle`, `manualRetryAvailable`.
- **Every stage story** (US-03, US-06/07, US-12, US-13, US-16) records outcomes through this policy rather than changing state directly; every provider adapter is configured with its own retries disabled.
- **PRD**: the delay between automatic attempts is a new hardcoded parameter and must be added to §11 through US-33 as a version bump, not invented in code.
- **Cost**: the store-enforced cap bounds spend at 4 paid calls per stage instance per cycle.
- **Not included**: the per-phase maximum execution time and late results after a timeout (US-22b, JOS-185); manual-retry endpoints (US-23 to US-27); session aggregation when a scene fails (US-19); pause itself (US-20) and the request cap itself (US-37).
