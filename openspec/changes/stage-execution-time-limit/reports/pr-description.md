## JOS-185: Per-phase maximum execution time, measured from send

Linear: JOS-185 (US-22b, part of JOS-154). Target: `feature/entrega-2-JAME`.

### What changed

- **The clock starts at send.** `attemptDeadline` (pure) is the persisted `sent_at` plus the stage's `PER_PHASE_MAX_TIME_SECONDS`. Time spent queued behind the request cap, held by a pause or waiting as a scheduled retry is never counted. A stage whose limit is `"undetermined"` (assembly today) has no deadline.
- **A timeout is a transient failure.** `AttemptTimeoutWatcher` sweeps stored in-flight attempts at startup (after resumption) and every second. A conditional `in-flight → timed-out` update decides any race with a result, and `recordAttemptTimeout` hands it to the existing retry policy, which schedules the next attempt or declares exhaustion. `startNewCycle` now treats a timed-out attempt as a failed one.
- **Late results are accepted once or discarded.** A result for a timed-out attempt goes through the same completion path as an on-time one: `late-success` (any scheduled retry is `cancelled`, an exhaustion failure is lifted) or `superseded` (stage already has a result, or a manual retry opened a new cycle). A late failure is only recorded. Confirmed by the product owner.
- **Migration 15** adds the outcomes `timed-out`, `late-success`, `superseded`, `cancelled` and the `late_result_at` column to `stage_attempts`.
- **Image stage.** It records no attempt row, so the Fal.ai adapter's default `timeoutMs` is now the image stage's maximum time, counted from the call (after its request-cap slot was taken). Video keeps its existing poll limit.
- **Opt-in per stage.** A stage registers `registerTimeoutHandler(stage, handler)`. Only voice-over registers: it is the one stage that records outcomes through the recorder and has no limit of its own. Alignment and decomposition already abort at the limit; they register when they adopt the recorder.
- **Test aids:** stub voice modes `hang-once-then-success` and `success-after-limit` (`USE_STUB_VOICE_PROVIDER`).
- **Docs:** `docs/data-model.md`, `docs/backend-standards.md`; the per-phase limits are now asserted against PRD §11.3.
- No API or frontend change.

### Verification

- `npx tsc --noEmit` clean; full backend suite 1256 passed, 4 skipped, also in a fresh worktree with no `backend/.secrets.json`.
- Real server runs (voice limit 10 s): a hung first attempt times out and the retry succeeds; a late answer is accepted and the retry cancelled; an always-hanging provider fails after four timed-out attempts (retryable); a retry held by a pause for longer than the limit is not timed out. Reports: `openspec/changes/stage-execution-time-limit/reports/`.
- Coverage: lines 91.52% to 91.86%, functions 98.50% to 98.59%, branches 92.47% to 92.38% (defensive null fallbacks), reported in the step 6 report.
- Known pre-existing flake, not caused by this change: `orchestrator.test.ts` cases with 5 ms stub latency fail now and then under load.

### Worth a look

- While a retry waits out its backoff (after a timeout, and equally after any transient failure) `GET /sessions/:id` reads `submitted`, because only `in-flight` attempts count as the voice attempt being in flight. It predates this change; `bounded-retry-policy` says the session should stay in its in-progress state.
- Product decision still assumed, from `pause-and-continue-session` Decision 9: a pause does not freeze the clock of a request already sent.

### Merge notes

`launch`/`release` and `orchestrator.ts` are untouched. The migration is numbered 15; a branch that also adds a migration needs to renumber.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01TGwptE7bqcPbkvrLaDgN6y
