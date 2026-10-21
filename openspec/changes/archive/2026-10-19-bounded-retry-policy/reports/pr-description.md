# PR description draft — JOS-184 (US-22a) Bounded retry policy for provider stages

Target branch: `feature/jos-136-generate-voice-over` until PR #26 merges, then retarget to `feature/entrega-2-JAME`.
Not opened yet: opening needs an explicit ask.

## Summary

- Linear: JOS-184 (US-22a). OpenSpec change: `bounded-retry-policy`.
- A stage instance gets at most 4 attempts per cycle (1 initial + 3 automatic); the cap is enforced by the store (unique `(stage_instance_key, cycle, sequence_in_cycle)` plus a 1..4 check), not by code alone.
- A pure `decideRetry` policy, a `StageAttemptRecorder` (`recordAttemptOutcome`, `startNewCycle`) and a persisted `RetryScheduler` (rebuilt at startup, claimed by a conditional update so an attempt is sent once).
- Retries go through the launch gate, so pause (US-20) and the request cap (US-37) apply.
- Adapters are guarded against hidden HTTP-client or SDK retries; every attempt is logged with its cycle, sequence and trigger.
- The session failure now carries `cycle`, `attemptsInCycle` and `manualRetryAvailable`; migration 14 adds the attempt columns.

## Open items to know before reviewing

- Tasks 1.4 and 11.4 are open: PRD §11 records no retry delay values (US-33 did not record them). The delays are injected, with provisional values (`PROVISIONAL_RETRY_DELAY_SECONDS`: base 2 s, cap 30 s).
- Only voice-over is routed through the recorder. The image stage keeps its own scene-based retry in `orchestrator.ts`; the timestamps stage still records through `recordStageAttempt`. US-25, US-26 and US-24 adopt the recorder.
- Not investigated: how `reconcileOnBoot` treats a voice attempt that was in flight at a restart.
- Expected merge conflicts with JOS-149 / `feature/entrega-2-JAME`: migration 13 (JOS-149) vs 14 (this change), `AttemptStage` in `types.ts`, `routes.ts`, `server.ts`, `docs/api-spec.yml`, `docs/data-model.md`.
- Handoff comments are posted on JOS-185, JOS-155, JOS-156, JOS-157, JOS-158, JOS-152 and JOS-167. JOS-159 (US-27) is still to be posted; suggested text:

> From JOS-184 (US-22a) — `startNewCycle(ref, options)` in `backend/src/retry/stageAttemptRecorder.ts`, with `ref` = (session, `assembly`), returns `{ started: true, attempt }` or `{ started: false, reason: "not-failed" | "not-retryable" }`. It opens cycle+1 with a `manual`, due-now `scheduled` attempt and keeps earlier cycles readable. JOS-149 (PR #25) rebuilds `stage_attempts` in its own migration 13 (nullable `provider_id`, an `assembly` stage) while this change uses migration 14, so expect a conflict in `types.ts` and `db.ts`. The assembly stage is not routed through the recorder yet.

## Test plan

- [x] `npx vitest run` with an isolated DB: 1056 passed, 4 skipped; `tsc` clean
- [x] curl run against the stub voice provider (reports/…step-9…)
- [x] browser run of the session page (reports/…step-10…, limited: the page shows no failure cause)
- [ ] Human review (task 12.5)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011t4AfcPhpwACq5vPq8NLrM
