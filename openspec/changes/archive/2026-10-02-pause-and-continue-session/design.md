# Design — Pause the session and continue explicitly

## Context

PRD §9 and D01: a pause applies to the whole session; every generation, phase and retry (automatic or manual) not yet sent is held until the User explicitly continues; a request already sent finishes and its result is kept; there is no per-scene pause. §8.1: the pause is a marker on top of the current state, never a state of its own.

What exists today, from the walking skeleton:

- `runs.paused` (a column), `setRunPaused`, `pauseSession` / `continueSession` in `orchestrator.ts`, `POST /sessions/:id/pause` and `/continue`, and a header button. The marker is already its own field in the session event (`define-live-updates` Decision 8).
- The hold itself is `if (run?.paused) return` in `launchScene` and `launchImageStage`, and the same check again inside the request-cap callback of each (`launchScene`'s callback and `runImageAttempt`), which releases the slot without consuming an attempt. That is three copies of one rule.
- `continueSession` removes the marker and relaunches every `submitted` scene, choosing between the stub stage (`launchScene`) and the real image stage (`launchImageStage`) by whether the scene has an `imageInstruction`. `manualRetry` and `applyOutcome` repeat that choice — except that `manualRetry` always calls `launchScene`, so a manual retry of a real chunk goes through the stub path. That is an existing inconsistency this change makes impossible to repeat by routing the choice through one function; it does not fix the retry stories (US-23 to US-27).
- Session state is derived (`deriveSessionState`), so nothing about "held" is stored, and nothing needs migrating.

What does not exist yet, and this change must be correct for anyway: the launchers for voice-over (JOS-136), video (JOS-146), retiming and assembly (JOS-149/150, US-16b), the retry scheduler (JOS-184), and manual-retry endpoints for stages other than a scene. `generate-voice-over` Decision 1 reserved "one phase-launch gate" for pause, the request cap and retries; this is the pause half. `bounded-retry-policy` Decision 4 already assumes retries "enter the same gate as a first attempt".

Constraints: the backend runs under Node's strip-only TypeScript (no parameter properties, no enums); the store is synchronous SQLite, so a function with no `await` is atomic with respect to every other request in the process.

## Goals / Non-Goals

**Goals:**

- One answer to "may this launch send now?", asked by every launch, so a stage added later is held by default behaviour and not by remembering.
- Pause and continue exact at the boundary: a request is sent before the pause (and finishes) or it is held, never both.
- Continue launches exactly the held work — including work that became startable during the pause — once, in a deterministic order.
- The User can tell held work from running work (§9), and what is shown held is what continue will launch.

**Non-Goals:**

- Cancelling or interrupting a sent request (§2.3, §9), a per-scene pause, or an automatic pause.
- The retry budget and scheduler (JOS-184), the per-phase maximum time (JOS-185), the request cap (US-37), resuming in-flight requests after a restart (US-28), and the manual-retry endpoints of US-23 to US-27 — each consumes the gate, none is built here.
- Writing the launchers for voice, video and assembly. This change defines how they plug in and makes it checkable.
- Fixing `manualRetry`'s use of the stub path for real chunks beyond routing it through the shared dispatcher.

## Decisions

**Decision 1 — One launch gate, asked at the last moment before the send.**
`admitLaunch(sessionId)` returns `{ admitted: true }` or `{ admitted: false, reason: "session-paused" }`. It is called twice by a launch that queues for a request-cap slot: on entry (so held work never occupies the queue) and again inside the slot callback, immediately before the attempt is recorded as in-flight. On *held* the caller sends nothing, records no attempt, starts no clock, and — if it holds a slot — releases it to the next waiter (what the image stage already does). It replaces the three inline checks.
*Alternatives:* leaving the check in each stage (rejected: that is how the rule is already written three times, and §9's "a pause means no new provider calls" would be only as true as the least careful stage); a global switch in the request-cap module (rejected: the cap is shared across sessions and pause is per session, so a paused session's queued waiters must give their slots away, not freeze the queue for everyone); checking only on entry (rejected: a scene waiting for a slot when the pause arrives would still send when its turn comes — the existing second check exists for this).

**Decision 2 — The send is exactly one synchronous step, and "sent" means the in-flight mark is persisted.**
Between the second `admitLaunch` and the store write that records the attempt as in-flight (`markSceneInFlight`, and the equivalent for each later stage) there is no `await`. Pause is a single store write handled in the same process, so it lands entirely before the step (the launch is held) or entirely after it (the request counts as sent and finishes). The adapter call that follows the mark is the already-sent request. This is the definition of "sent" that §9's rule about a request "already sent" needs, and it matches `generate-voice-over` Decision 2 (state and attempt record persisted before the provider is called).
*Alternatives:* treating "sent" as the provider's acknowledgement (rejected: it leaves a window where the User sees a launch that pause neither held nor let finish); a lock around the whole attempt (rejected: it would hold a lock for minutes of provider latency — the same objection `stage-execution-time-limit` Decision 3 records).
*Consequence for later stories:* a launcher that puts an `await` between the gate and the in-flight mark breaks AC07; the tasks add this to the backend standards, and the completeness test cannot see it, so a review checklist item covers it.

**Decision 3 — Held work is derived from stored records, never kept in a second list.**
Held work is work that is *startable but not started*: a scene `submitted` (a first generation, or a retry already recorded as pending), a scene `image-complete` with no video started, a session whose narration is complete with no decomposition started, a session whose assembly gate is open with no assembly started, and a retry already recorded as scheduled. The rule that makes this complete for retries is **record first, gate second**: an automatic or manual retry is persisted as scheduled work before it asks the gate, so a held retry is simply a scheduled one that was not sent. `manualRetry` already does this for scenes (`markScenePendingRetry` precedes `launchScene`); JOS-184's scheduled attempts and the later manual-retry stories must do the same.
Each stage registers a **launcher** with `registerStageLauncher({ stage, heldWork(sessionId), launch(sessionId) })`. `heldWork` is the derivation above for that stage; `launch` starts it through the stage's normal path (and so through the gate again). The registry is the only thing continue and the representation read.
*Alternatives:* a persisted `held_launches` table (rejected: it duplicates what the scene and session records already say and can drift from them — a row saying held for a scene that has since moved on, or a missing row for work that became startable during the pause — and it needs a migration); an in-memory queue of closures (rejected: lost on restart, and a restart during a pause is exactly when §12.1 needs the held work to still exist); one function that knows every stage (rejected: every later story would edit it, and a stage it forgets would be silently never resumed).

**Decision 4 — Continue is the one atomic paused-to-running transition, and it launches via the registry.**
`continueSession` clears the marker with a conditional write (`UPDATE runs SET paused = 0 WHERE id = ? AND paused = 1`) and sweeps only if a row changed. A second continue, or a continue on a session that is not paused, changes nothing and launches nothing. The sweep walks the registered launchers in pipeline order (voice, decomposition, image, video, assembly) and, within a stage, scenes in ascending index; each launch goes through the gate again, so a pause arriving mid-sweep holds the rest, and each launch re-reads its record, so the store state — not a flag — decides that a unit already claimed is not launched twice (`runImageAttempt` and the stub callback already return when the scene is no longer `submitted`).
Launches enter the request-cap queue behind work already queued, in the order of the sweep; §10.1's first-come, first-served is kept, and continue is the arrival time.
Due scheduled retries launch on continue; one whose delay has not elapsed keeps waiting for its own due time, which counts from when it was scheduled, not from continue.
*Alternatives:* relaunching every unfinished scene regardless of state (rejected: it would double-send a scene already in flight); resetting backoff on continue (rejected: elapsed time is elapsed, and a pause is not a failure); launching in scene-completion order (rejected: nothing in §9 asks for it, and ascending index matches how every other list is ordered, §6).

**Decision 5 — In-flight requests are untouched, and the work their results unlock is held.**
A result delivered while the session is paused is applied exactly as it would otherwise be: the record is written, the stored state advances, `broadcast` runs. What the result would have launched next (the video for an image that just completed, decomposition for a voice-over that just completed, an automatic retry for a transient failure) goes through the gate and is held; the unlocked work is startable and not started, so Decision 3 finds it. A late or duplicate delivery for an already-resolved request stays idempotent, which pause does not change. Boot reconciliation (`reconcileOnBoot`) applies the same rule: it may apply results and record a failed attempt, and every launch it triggers goes through the gate.
*Alternatives:* deferring the *application* of a result until continue (rejected: §9 says results of sent requests are kept, and a result held in memory is lost on restart).

**Decision 6 — The stage's in-progress state is entered at launch, so a held phase stays in the state before it.**
Because the gate sits before the state change (`generate-voice-over` Decision 1: the gate "moves the session to `voice-over-generating` and only then dispatches"), a held phase leaves the session in its previous state — `voice-over-complete` with decomposition held, not `chunk-decomposing` with nothing running. Pause itself changes no state; continue "leaves the state unchanged" (§8.1) and the next launch moves it. The one place a held unit already shows an in-progress state is a manual retry on a failed scene: §8.1 returns the session to `chunks-processing` when the retry is requested, and the scene's `held` flag (Decision 7) is what tells the User nothing is generating.
*Alternatives:* a paused-specific session state (rejected by §8.1 and D01 outright); moving to the in-progress state on request and showing it as held (rejected for first launches: the User would see `chunk-decomposing` with no request out, the "running vs waiting" confusion §9 warns about).

**Decision 7 — The representation says what is held, from the same function the sweep uses.**
`toSnapshot` computes, only while the session is paused, `held`: the stages with held work and the number of scene units (or `1` for a session-level stage), built by calling each launcher's `heldWork`. Each scene gets `held: boolean` — true when the session is paused and the scene is one of those units. Both are empty/false when the session is not paused, so a scene that is queued for the request cap (not paused) is never labelled held. The frontend shows them next to the paused marker; it does not compute them. The payload stays additive: `paused` remains its own field, and no consumer of `state` changes.
*Alternatives:* the frontend deriving "held" from `paused` plus scene status (rejected: it cannot see `image-complete` scenes awaiting video, or a session-level phase, without re-implementing each stage's start rule); a `held` session state (rejected, Decision 6).

**Decision 8 — Pause and continue are idempotent and allowed in every session state.**
Pausing an already-paused session, or continuing one that is not paused, answers `200 { ok: true }` and changes nothing (no broadcast, no sweep). An unknown session is `404`. Pause is accepted in every state, including `failed` (where it holds a manual retry before it is requested, D01) and `final-video` (harmless: nothing can launch). The marker is orthogonal to state (§8.1), so there is no table of states in which it is legal to maintain.
*Alternatives:* `409` for a redundant pause or continue (rejected: a double click, or a retried request after a network blip, is not an error, and the User's intent is already satisfied); refusing pause on terminal states (rejected: it adds a state table for no PRD rule, and a `failed` session is where holding a retry matters).

**Decision 9 — Held time is never counted; a sent request keeps its own clock.**
A held launch records no attempt and no `sentAt`, so when JOS-185's execution clock starts at `sentAt`, time spent held by a pause is excluded by construction. That is the ticket's assumption, met without extra code. A request already sent is not paused (§9), so its clock keeps running: it can still reach its maximum time while the session is paused; the timeout is recorded, the retry it triggers is scheduled and held, and nothing is sent until continue. Pausing does not freeze the clock of a request the provider is still working on.
*Alternatives:* freezing the clock of in-flight requests while paused (rejected: the provider is not paused, so a request that really hung would sit in flight for as long as the User stays away, which is the unbounded wait §10.1's limit exists to prevent). See Open Question 1.

**Decision 10 — Completeness is checkable: every stage has a launcher or is declared not yet launchable.**
`PIPELINE_STAGES` lists the stages in pipeline order; `NOT_YET_LAUNCHABLE` lists the ones with no launcher yet (today: voice-over, decomposition, video, assembly). A unit test asserts every stage is in exactly one of the registry and that list. A story that adds a launcher deletes its stage from the list in the same change, and so is forced to implement `heldWork`; a story that forgets leaves the stage declared as unlaunchable, which reviewers can see. The decomposition entry point (`runDecompositionPhase`) is wired to the gate now — it returns `{ ok: false, reason: "held" }` while paused — but its launcher is registered with JOS-136, which owns the dependencies it needs.
*Alternatives:* no check (rejected: the failure mode is silence — a phase that is never resumed after a pause); failing the test until every stage has a launcher (rejected: it would break the suite on this branch for stories that do not exist yet).

**Decision 11 — One dispatcher chooses the stage for a scene.**
`launchSceneStage(sceneId)` picks `launchImageStage` or the stub `launchScene` once; `continueSession`'s sweep, `manualRetry` and `applyOutcome` call it. The stub-versus-real choice was written three times. The dispatcher goes away when the stub path does; until then it is the single place that knows about it.

## Risks / Trade-offs

- **A later launcher adds an `await` between the gate and the in-flight mark** → the pause would be "mostly" respected. Mitigation: a rule in `docs/backend-standards.md` (task group 8), the launcher contract stated in the spec, and a test for each existing stage that pauses between a launch request and the attempt mark. Residual: not statically enforceable.
- **A stage registers `heldWork` that disagrees with what `launch` actually starts** → the User sees held work that continue does not launch, or the reverse. Mitigation: the representation and the sweep call the same function; a test per launcher continues and asserts held work becomes empty.
- **Held work derived from records can include work that was never going to launch** (a `submitted` scene of a session that is not paused but waits for the cap) → Mitigation: `held` is computed only while paused (Decision 7).
- **Restart while paused loses the cap queue** → Not a pause problem: held work is derived, so it is still found after restart; resuming unlaunched work for a *non*-paused session at boot is US-28's.
- **Continue with a very large session floods the request cap** → Intended: the cap queues them first-come-first-served (US-37); the sweep only enqueues.
- **The in-flight clock is not frozen during a pause** (Decision 9) → A User who pauses for a long time may return to a stage that timed out and whose retry is held. That is what §10.1 and §9 say together, and the representation shows it; confirmation requested in Open Question 1.

## Migration Plan

No schema change and no data migration: `runs.paused` exists and held work is derived. The two endpoints keep their paths and success shape; the session and scene schemas gain a response-only field, which existing consumers ignore. Rollback is reverting the change; no stored data depends on it.

## Open Questions

1. **Does "time a session spends paused is not counted toward per-phase maximum times" also freeze the clock of a request already sent?** This design says no (Decision 9) because the provider keeps working and a frozen clock would let a hung request wait indefinitely; held, unsent work is excluded anyway because its clock never starts. Product owner to confirm. If the answer is yes, JOS-185 must record when a pause began and ended and subtract the overlap from elapsed time; nothing in this change would need to be undone.
2. **Should continuing a session also offer to continue only some stages?** §9 says there is no per-scene pause and does not mention per-stage continue; this design offers none. Raise only if the product owner wants it.
3. **Should the session page confirm "N scenes will start" on continue?** Not required by §9; the `held` counts make it possible without backend change. Left to US-18's page design.
