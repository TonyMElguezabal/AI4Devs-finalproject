# Design — Limit simultaneous provider requests per stage

## Context

§10.1: each stage has a hardcoded maximum of simultaneous provider requests, shared across sessions. Requests beyond it wait first come, first served, and waiting is neither a failed attempt nor execution time.

What already exists:

- `backend/src/concurrency.ts` is a FIFO semaphore keyed by stage and shared across runs. It has `acquire(stage, holder, onAcquired)`, `release`, `occupy` (requests already sent before a restart) and `stats`. `restart-safe-concurrency` (JOS-186) specifies how its holders and restarts behave.
- The **image** and **video** scene stages acquire before they send and release on every settle path. Their timers start inside the acquired callback, so waiting is never counted as execution time. The video limit is `PROVISIONAL_VIDEO_CONCURRENCY = 3` in `orchestrator.ts`. The image limit is set in `server.ts` from `MAX_SIMULTANEOUS_REQUESTS.image`, and only when the file runs as main.
- The **session-level** stages are recorded as `stage_attempts`: `voice-over` (ElevenLabs TTS), `timestamps` (ElevenLabs forced alignment, or the narration's native timestamps, which make no call) and `decomposition` (OpenAI). They have no cap. A first attempt is inserted `in-flight` with `sentAt = now`. A retry is persisted `scheduled` and is moved to `in-flight` by `retryScheduler.releaseAttempt` through `claimScheduledAttempt`, which stamps `sentAt`. JOS-185 measures the deadline from `sentAt`, and a `scheduled` attempt has none.
- `getScheduledAttempts()` orders by `due_at`, and `rebuildScheduler()` re-arms every scheduled attempt at boot.

The caps (product owner decision, 2026-10-09): decomposition 50, image 200 (JOS-165), voice 3, alignment 2, video 3.

## Goals / Non-Goals

**Goals:**

- Every stage that calls a provider is capped, and the values come from one constant.
- Session-level waiting uses the existing `scheduled` state, so pause, restart and the deadline already handle it correctly.
- One place takes a slot for session-level attempts, used by first attempts and by retries alike.

**Non-Goals:**

- Changing how the image and video stages acquire their slots: they already meet AC1–AC4.
- Rate limits in requests per time window. §10.1 caps simultaneous requests only.
- A visible "waiting for a slot" badge. AC4 only requires that waiting is not shown as `failed`.
- Probing RunningHub's real ceiling (declined).

## Decisions

**Decision 1: the cap values live only in `MAX_SIMULTANEOUS_REQUESTS`, and every semaphore limit is set from them when `concurrency.ts` loads.**
The type becomes `Record<CappedStage, number>`, so `undetermined` cannot come back without a compile error. `PROVISIONAL_VIDEO_CONCURRENCY` and the `setLimit` call in `server.ts` are removed. The `STAGE_CONCURRENCY_LIMIT` environment override for image is kept, because manual testing uses it. Tests still use `setLimit` and `resetAll` (`resetAll` restores the configured limits instead of clearing them).
*Alternatives:* setting limits next to each stage's launcher, as today (rejected: three places already disagree on where a limit is set, and a stage with no `setLimit` call silently gets `Infinity`).

**Decision 2: voice 3 + alignment 2, each with its own key, rather than one shared ElevenLabs pool.**
The ticket asks for a cap per stage. Two lines that add up to the account's documented 5 keep each stage's queue independent: a burst of voice-overs never delays alignment, and the account limit still holds. The value comes from documentation, which the comment on the constant records.
*Alternatives:* one `elevenlabs` key for both stages (rejected by the product owner: it adds a shared-key idea used by no other stage); 5 each (rejected: up to 10 at once against an account limit of 5).

**Decision 3: a waiting session-level attempt is `scheduled` (trigger `initial`, `dueAt = queuedAt`, no `sentAt`), and it is claimed only once it holds a slot.**
One helper in `retryScheduler.ts`, `sendWithSlot(attempt, send)`, is the only way a session-level attempt goes from `scheduled` to `in-flight`. It does four things in order:
1. Acquires the attempt's slot (holder = attempt id).
2. In the acquired callback, asks `admitLaunch`. If the session is paused, it releases the slot and leaves the attempt `scheduled`.
3. Claims with `claimScheduledAttempt`, which stamps `sentAt`.
4. Runs `send` and releases the slot when it settles.

`releaseAttempt` (retries, continue, boot rebuild) and the first-attempt entry points of the three phases both call it. A first attempt is therefore recorded `scheduled` and released at once. When a slot is free this behaves exactly as today. When none is free, the attempt simply waits.
This reuses what `scheduled` already guarantees. The JOS-185 watcher ignores it (no `sentAt`). Pause leaves it held and continue releases it (JOS-152). A restart re-arms it in `due_at` order, and nothing is recorded as failed. The conditional claim stops a timer and a continue from both sending it, and `acquire` ignores a holder that is already queued.
*Alternatives:* inserting `in-flight` with `sentAt = null` while waiting (rejected: boot settling would record an interrupted, failed attempt for a request that was never sent, which breaks AC3 across restarts); a new `queued` outcome (rejected: it would duplicate `scheduled` in every query, the watcher and pause handling).

**Decision 4: a slot covers exactly one provider call. A follow-on step takes its own slot once the first one is released.**
The `timestamps` attempt is followed by the `decomposition` step in the same sender (`sendDecompositionAttempt`). The alignment slot is released when the alignment call returns, before the decomposition attempt is recorded and waits for a `decomposition` slot. Otherwise an alignment slot would sit idle through an OpenAI call.

**Decision 5: the slot key comes from the attempt.**
`voice-over` uses `voice`, and `decomposition` uses `decomposition`. `timestamps` uses `alignment` when its `providerId` is the alignment provider, and **no slot** when it is the native-timestamps provider, because no request is sent. `assembly` uses no slot (local ffmpeg). An attempt with no key goes straight to the claim in step 3.

**Decision 6: the slot is released when the provider call returns, not when the attempt is closed.**
A timeout (JOS-185) closes the attempt while the request keeps running at the provider (§2.3). Releasing on timeout would let a retry plus the still-running request go over the cap. This is the voice-over late-result case: the slot stays taken until the original call settles.
*Trade-off:* a hung call that never returns would hold its slot forever. Each adapter already aborts its own call at the stage's maximum time (JOS-185), so the call always returns.

**Decision 7: AC4 needs no new display state.**
Waiting image and video scenes keep `submitted` and `image-complete`. A waiting session-level attempt is `scheduled`, which the snapshot already shows as pending work, not as a failure, and no failure is set on the run. Tests assert this rather than add UI.

## Risks / Trade-offs

- **The ElevenLabs value is documented, not measured.** → The constant's comment names the tier and the source. If the account tier changes, `voice + alignment` must be re-checked (spec scenario).
- **First attempts now go through `scheduled`.** → Diagnostics and the stage view show a `scheduled` initial attempt for a moment, even when a slot is free right away. They already handle `scheduled`, and the claim follows synchronously when a slot is free.
- **Phase tests await `generateVoiceOver` and `runDecompositionPhase` results.** → The helper resolves when `send` settles, so the awaited result is unchanged when a slot is free. Only waiting is new.
- **FIFO order across a restart follows `due_at`, not the lost in-memory order.** → For first attempts `due_at = queuedAt`, so the order is the order in which they became ready.

## Migration Plan

No schema migration. Deploy is a normal restart. Attempts left `scheduled` by an earlier version are re-armed and now take a slot. Rollback: revert the commit. Attempts that are `scheduled` stay valid under the old code.

## Open Questions

None. The cap values were decided on 2026-10-09.
