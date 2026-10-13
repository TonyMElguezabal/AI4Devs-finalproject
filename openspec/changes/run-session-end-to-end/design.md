## Context

Every pipeline stage hands its work to a **stage launcher** registered with the launch gate (`backend/src/launchGate.ts`, JOS-152). A launcher has `heldWork(sessionId)` (what is waiting), `launch(sessionId)` (start it, through `admitLaunch`), and `settleInFlight()` (boot). Pause and continue (`launchHeldWork`) and boot recovery (`relaunchPendingWork`, called from `recoverOnBoot`) both go through the launchers, so a stage that is reachable through its launcher gets pause, continue and restart behaviour for free.

Today:

- `voiceOverPhase.ts` stores the voice-over in three places — `generateVoiceOver` (first attempt), `sendVoiceAttempt` (retried attempt) and the accepted late result — each followed by `broadcast(runId)`. Nothing starts the next phase.
- `decompositionPhase.ts` already registers `decompositionLauncher`, but only for a scheduled **retry**: `heldWork` counts a `scheduled` `timestamps`/`decomposition` attempt, `launch` releases it. Its comment says the start "directly after the narration" joins these terms "when it launches this phase itself". `runDecompositionPhase(runId, dependencies)` admits the launch, obtains the timestamps if missing (stored timestamps count as obtained), segments, registers the scenes and calls `launchImageStageForRun`.
- `getDecompositionDependencies()` defaults to the real ElevenLabs alignment and OpenAI visual-instruction providers.
- `recoverOnBoot` builds its candidates with `scenes s JOIN runs r` — an inner join, so a session without scenes is never a candidate. `preserve-progress-across-restarts` (JOS-160) deferred the decomposition pending rule for exactly this reason (its Decision 4, task 1.3).
- `server.ts` registers an assembly tool only when `USE_STUB_ASSEMBLY_TOOL` is set; `createFfmpegAssemblyTool()` has no caller. The bootstrap block runs only when `server.ts` is the entry point, so tests cannot reach it.
- `paused-session-display` already expects a paused `voice-over-complete` session to report one held decomposition unit; `pause-and-continue-session` task 7.1 tested it with a test launcher.

## Goals / Non-Goals

**Goals:**
- Decomposition starts after the narration through the existing launcher, exactly once, honouring pause, continue and restart.
- The running application uses the ffmpeg assembly tool unless a stub is configured.
- A session created through the API reaches `final-video` with stubbed providers and no test endpoint, proven by an automated test.

**Non-Goals:**
- Configurable ffmpeg/ffprobe paths (JOS-194 story S2); packaging and Windows (JOS-194 L1–L9).
- New stub flags for the decomposition or image providers in the running server.
- Any change to the decomposition rules themselves (segmentation, clause boundaries, retries).

## Decisions

**Decision 1 — Extend `decompositionLauncher` instead of calling `runDecompositionPhase` from the voice-over phase.**
`heldWork` gains a second term, "waiting after the narration": the session has a stored voice-over, no scenes, no failure, and no `timestamps` or `decomposition` attempt in any outcome. `launch` keeps releasing a scheduled retry when one exists; otherwise, when the new term holds, it runs `runDecompositionPhase(sessionId, getDecompositionDependencies())` in the background and logs a failure to start. A single exported `launchDecompositionFor(sessionId)` calls the launcher's `launch`.
Why: pause, continue and boot already work through launchers; a direct call would bypass the gate's held-work reporting and would need its own pause and boot code.
*Alternatives:* calling `runDecompositionPhase` directly from `voiceOverPhase.ts` (rejected: duplicates the gate, and a paused session would not report the held unit); an event bus for phase completion (rejected: one subscriber, one producer — a function call is enough).

**Decision 2 — "Any attempt in any outcome" is the at-most-once guard.**
The first thing `runDecompositionPhase` does with real work is record a `timestamps` attempt (or find stored timestamps and record a `decomposition` attempt), and a failure records a session failure. So "no attempt and no failure" is true only before the phase ever ran; afterwards every trigger — a second stored-voice-over signal, continue, boot — finds `heldWork` empty and starts nothing. A failed decomposition stays with `decomposition-manual-retry`.
*Alternative:* an in-memory "already launched" set (rejected: lost on restart, and the store already holds the answer).
*Check during apply:* stored timestamps without any attempt cannot exist (timestamps are written by an attempt); if a test finds such a state, the term counts "no scenes and no decomposition attempt" instead.

**Decision 3 — One hand-off helper in `voiceOverPhase.ts`, called after each successful store.**
After each `confirmVoiceOver(...).stored === true` and its `broadcast`, call `handOffAfterNarration(runId)`, which calls `launchDecompositionFor(runId)`. The import goes from `voiceOverPhase.ts` to `decompositionPhase.ts`; nothing `decompositionPhase.ts` imports reaches back into `voiceOverPhase.ts`, so there is no cycle.

**Decision 4 — Boot candidates include narrated sessions without scenes, and only those.**
`recoverOnBoot` builds its candidates with an inner join on `scenes`, so a session without scenes is never relaunched. The query is rewritten as a `FROM runs` query with `EXISTS` terms: today's two scene-based terms unchanged, plus "no final video and a stored `voice_overs` row". `relaunchPendingWork` then asks every launcher, and only the decomposition launcher's new term matches such a session. A paused session is filtered by `admitLaunch` as today.
Why only narrated sessions: the voice-over launcher's `heldWork` also matches a `submitted` session with no voice-over and no attempt in flight. Widening to every session without scenes would start relaunching voice-over generation at boot, a behaviour change this story does not need (and the product owner did not ask for). A pinning test (task 5.1) holds today's behaviour for a narration-less `submitted` session.
JOS-160's Decision 4 deferred exactly this rule to "the story that adds the live start", because it also changes `heldWork` so that continue starts decompositions; both are intended here.
*Alternative:* widening to all sessions without scenes (rejected: relaunches voice-over at boot, out of scope).

**Decision 5 — `configureAssemblyTool(env)` exported from a small module, called by the bootstrap.**
It registers `createAssemblyTool` for a stub mode (existing `assemblyStubModeFor`) or `createFfmpegAssemblyTool()` otherwise. Tests call it directly. The bootstrap keeps its other flags unchanged.

**Decision 6 — Voice-over tests run with the hand-off disabled; the hand-off has its own tests.**
With the hand-off, a stored narration is immediately followed by `chunk-decomposing` (or `failed`, with the real key-less providers). The tests of the voice-over phase in isolation assert `voice-over-complete`, "no failure" and the order of published states, which the next phase now changes. Rewriting those assertions would weaken what the voice-over tests check. Instead, each of those files mocks `launchDecompositionFor` as a no-op (`vi.mock` of `decompositionPhase.ts`, keeping every other export), so they keep testing the voice-over phase alone. The hand-off itself is covered by `narration-handoff-*.test.ts` and `session-end-to-end.test.ts`, which install the stub decomposition dependencies from `test/decompositionStubs.ts`.
*Alternatives:* a production seam to disable the hand-off (rejected: test-only code in the product); stub decomposition dependencies in every file (rejected: the session then leaves `voice-over-complete` and the assertions fail anyway).

## Risks / Trade-offs

- [Existing tests reach real providers] → Decision 6; the suite runs with no `.secrets.json` in CI, so a missed file fails loudly with "missing credential" rather than calling a provider.
- [Boot relaunches more than decomposition] → Decision 4's test pins the behaviour before the query changes.
- [Every real session now calls OpenAI and ElevenLabs alignment automatically] → intended (PRD §5 step 3); UAT has no spending cap (JOS-194).
- [Assembly still calls `/opt/homebrew/bin/ffmpeg`] → unchanged here; JOS-194 story S2. On a machine without it the session fails at assembly with a recorded cause, as before.

## Migration Plan

No data migration. Sessions already stuck at `voice-over-complete` in a developer's store start decomposition at the next boot (Decision 4) — the intended recovery. Rollback is reverting the commits.

## Open Questions

1. The mandatory manual endpoint run needs a running server that goes past the narration. The server's stub flags cover voice, video and assembly only; visual instructions (OpenAI) and images (fal) have no stub flag, so the manual run calls them for real (cost: cents) with the developer's keys. The product owner approves the key copy at apply time, or the manual run is limited to voice-over → `chunk-decomposing` with the decomposition failing on a missing key, which still proves the hand-off.
