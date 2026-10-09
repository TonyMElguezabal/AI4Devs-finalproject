# Limit simultaneous provider requests per stage

Linear-Issue: JOS-167

## Why

PRD §10.1 requires that "each stage has a hardcoded maximum of simultaneous provider requests, shared across all sessions. Requests beyond it wait their turn and are sent first come, first served, regardless of session. Waiting counts neither as a failed attempt nor as execution time." Without this cap, several sessions starting together send more requests than the provider account allows. Calls then fail with rate-limit errors, use up the retry budget and fail scenes, even though nothing was wrong with them.

Part of this already exists. `backend/src/concurrency.ts` is a FIFO semaphore per stage, shared across runs, and the **image** and **video** scene stages already go through it. They queue before they send and start their clocks after. Two gaps remain:

- The session-level stages that call a provider, **voice-over** (ElevenLabs), **alignment** (ElevenLabs forced alignment) and **decomposition** (OpenAI), do not go through the semaphore at all. Their attempts are recorded in flight with `sentAt` set as soon as they start.
- Three caps are not settled. JOS-165 left voice, alignment and video `undetermined`. The video cap lives in the orchestrator as `PROVISIONAL_VIDEO_CONCURRENCY = 3`, and the image cap is set separately in `server.ts`.

## What Changes

- Settle the remaining caps in `MAX_SIMULTANEOUS_REQUESTS` (product owner decision, 2026-10-09):
  - **voice 3** and **alignment 2**. They add up to ElevenLabs' documented Creator-tier limit of 5 concurrent requests, which both stages share on one account. This value comes from ElevenLabs' documentation and was not measured.
  - **video 3**. This is the highest concurrency measured with no slowdown (JOS-165, step 8.2). It is now final, and `PROVISIONAL_VIDEO_CONCURRENCY` is removed.
  - Decomposition 50 and image 200 stay as JOS-165 recorded them.
- Set every stage's cap from that one constant, in one place, and stop setting limits in the orchestrator and the server.
- Send voice-over, alignment and decomposition attempts through the semaphore. A first attempt that cannot get a slot is recorded as **`scheduled`** (due now) instead of `in-flight`. Its `sentAt` is stamped only when it takes a slot. The existing retry scheduler is the single place that claims an attempt, and it now also takes the slot. Waiting therefore never starts the execution clock (JOS-185 measures from `sentAt`) and never uses up an attempt.
- Release a session-level slot when the provider call returns, not when the attempt is recorded as timed out. A timed-out request may still be running at the provider (§2.3), so it still counts against the cap.
- Show nothing as `failed` because it is waiting for a slot. Waiting scenes keep their current state. A waiting session-level attempt shows as waiting, not failed.

## Capabilities

### New Capabilities

- `provider-request-limit`: the per-stage maximum of simultaneous provider requests. Covers which stages it applies to, the cap values, the cross-session first-come-first-served order, waiting that does not count as an attempt or as execution time, and how waiting work is shown.

### Modified Capabilities

- `restart-safe-concurrency`: so far a slot always belonged to a **scene**. Session-level stages have no scene, so a slot can now also belong to a **stage attempt**. The rules about matching releases and at most one slot or queue place per holder now apply to both kinds of holder.

## Impact

- **Code**: `backend/src/config/providers.ts` (cap values), `backend/src/concurrency.ts` (limits set from config), `backend/src/retry/retryScheduler.ts` (slot taken before claim, released when the call returns), `voiceOverPhase.ts`, `decompositionPhase.ts` and `narrationTimestampsPhase.ts` (first attempts enter as `scheduled`), `orchestrator.ts` and `server.ts` (provisional and duplicate limits removed).
- **Data model**: no new column. A `scheduled` attempt with `trigger: initial` now means "waiting for a slot". `queuedAt` and `sentAt` already exist and get the meaning §10.1 implies.
- **API**: no new endpoint and no contract change. The boot log's `concurrency` block covers every capped stage, not only image and video.
- **Depends on**: JOS-165 (values), JOS-184 (scheduler and recorder), JOS-185 (clock from `sentAt`), JOS-152 (launch gate), JOS-186 (restart-safe semaphore).
- **Risk**: the ElevenLabs value comes from documentation. If the account tier changes, `voice + alignment` must stay at or below the new tier's limit.
- **Not included**: the assembly stage, which is local ffmpeg and calls no provider. Probing RunningHub's real ceiling (the product owner chose to keep 3). Rate limits in requests per minute: §10.1 asks for simultaneous requests only.
