# Per-phase maximum execution time, measured from send

Linear-Issue: JOS-185

## Why

A provider request can hang: no error, no result, no end. Without a limit, the stage instance waiting on it stays in its in-progress state forever and the bounded retry budget from `bounded-retry-policy` (JOS-184) never gets the failure it needs to act on. §10.1 and §11 answer this with a hardcoded maximum time per phase.

§10.1 is just as clear about what that limit must not measure: waiting before a stage starts "must not be confused with execution time nor cause a premature failure of scenes that start later", and waiting behind the per-stage request cap "counts neither as a failed attempt nor as execution time". With two hundred scenes queued behind a cap of a few simultaneous requests, a clock started at queue time would fail most of them without ever calling the provider. The clock has to start when the request is sent.

A timeout also creates a case nothing else handles. The MVP cannot cancel a request already sent (§2.3, §9), so a timed-out request may still finish — after a retry has been scheduled, or even after it succeeded. That result is paid for, and §12.1 forbids a second confirmation from duplicating a result or completing a stage twice.

## What Changes

- Start the execution clock at the attempt's persisted `sentAt`; time spent queued behind the request cap or held by a pause is never counted (§10.1, AC4).
- When a sent attempt exceeds its stage's hardcoded maximum time, record it as **`timed-out`**, classified **transient**, and hand it to the retry policy (JOS-184), which schedules the next attempt or declares exhaustion.
- Accept a **late result** from a timed-out attempt when the stage instance has no successful result yet, and cancel any retry not yet sent; record it as **`superseded`** and discard it when the stage instance already has one. The stage never completes twice (§12.1).
- Measure elapsed time from the recorded `sentAt` across restarts, so a restart neither resets nor extends the clock (§12.1).
- Read each stage's maximum time from the constants module, where `define-provider-configuration` (JOS-165) records it from measured latency (§11).

## Capabilities

### New Capabilities

- `stage-execution-time-limit`: when a sent provider attempt is considered too slow — where the clock starts, what a timeout records, how it feeds the retry policy, and what happens to a result that arrives after its attempt timed out.

### Modified Capabilities

None. `openspec/specs/` is still empty. `stage-retry-policy` (from `bounded-retry-policy`) is not yet archived; this change consumes its recorder and scheduler and adds outcomes to the attempt record without changing its requirements.

## Impact

- **Blocked on**: `bounded-retry-policy` (JOS-184) for the recorder, scheduler and attempt record; `define-provider-configuration` (JOS-165) for the per-phase maximum times; `define-backend-stack` (JOS-179) and `define-persistence` (JOS-181).
- **Product confirmation needed**: accepting a late result when the stage has no successful result yet — including a stage already `failed` by exhaustion — is the recommended behaviour but has not been confirmed (JOS-154 open question 2).
- **Data model**: StageAttempt outcomes gain `timed-out`, `superseded` and `late-success`, plus `lateResultAt`; scheduled attempts gain a `cancelled` outcome.
- **Every stage adapter** must deliver a late result through the same completion path as an on-time one, so the idempotent completion rule applies to both.
- **Cost**: a timeout does not stop the provider's work; a late result that is accepted avoids paying for it twice.
- **Not included**: the retry budget itself (JOS-184); resuming in-flight requests after restart (US-28); the general duplicate-confirmation rule (US-29), which this change relies on.
