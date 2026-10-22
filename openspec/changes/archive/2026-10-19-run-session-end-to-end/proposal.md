# Run a session end to end

Linear-Issue: JOS-195

## Why

A session created from a script never gets past `voice-over-complete`, so Vid4You cannot produce a video through its own API: the only way to reach `final-video` today is the test endpoint `POST /internal/test/quick-scene`. Two bootstrap links are missing. Nothing starts decomposition after the narration is stored: JOS-139 left the trigger to JOS-136, and JOS-136 shipped without it; JOS-160 then deferred the matching boot rule. And the real ffmpeg assembly tool is never registered, so without a stub flag every session would fail at assembly with "no assembly tool is configured". Found by the JOS-194 spike while preparing a full script-to-video run of the packaged application; the decision to ship that application depends on it.

## What Changes

- When a session's voice-over is stored, decomposition starts automatically, once, through the decomposition launcher of the launch gate. All three ways a voice-over can be stored hand over: the first attempt, a retried attempt, and an accepted late result.
- A paused session waiting for decomposition is not started; continue starts it. This is the behaviour `paused-session-display` already describes for a paused `voice-over-complete` session.
- At boot, a session whose voice-over is stored and which has no scenes, no failure and no decomposition attempt starts decomposition (the rule JOS-160 deferred in `preserve-progress-across-restarts`, Decision 4). The boot candidate query stops excluding sessions without scenes; the launchers keep deciding what to start.
- The server registers the real ffmpeg assembly tool unless `USE_STUB_ASSEMBLY_TOOL` is set, through a small exported function the tests can reach.
- The voice-over and session tests that wait for `voice-over-complete` install stub decomposition dependencies, so the new hand-off never reaches real providers in tests.
- No new endpoint, field, state or migration. The state transition `voice-over-complete → chunk-decomposing` already exists (JOS-139), and decomposition already launches the image stage, which leads to video and assembly.

## Capabilities

### New Capabilities
- `pipeline-handoffs`: how a session moves from one phase to the next without user action: decomposition after the narration (including pause, continue and restart), and the assembly tool the running application uses by default; plus the guarantee that a session created through the API reaches its final video with no test endpoint.

### Modified Capabilities
<!-- None: no existing requirement changes. `paused-session-display` already expects a paused voice-over-complete session to report one held decomposition unit; `restart-safe-concurrency` covers scene work, not decomposition; `decomposition-manual-retry` keeps its rules. -->

## Impact

- **Backend:** `backend/src/decompositionPhase.ts` (launcher terms and a launch function), `backend/src/voiceOverPhase.ts` (hand-off after a stored voice-over), `backend/src/orchestrator.ts` (`recoverOnBoot` candidates), `backend/src/server.ts` (default assembly tool). Tests under `backend/test/`.
- **Frontend:** none. The session page already renders decomposition, scenes and the final video; it now progresses past `voice-over-complete` on its own.
- **API contract and data model:** unchanged (`docs/api-spec.yml`, `docs/data-model.md` need no change unless a state description says otherwise).
- **Cost:** with real keys every new session now calls OpenAI (visual instructions) and ElevenLabs (alignment) automatically, which is the intended product behaviour (PRD §5 step 3).
- **Related changes:** delivers `decompose-script-into-chunks` tasks 2.3, 9.1 and 14.1 and the deferred rule of `preserve-progress-across-restarts`; closes JOS-194 stories S1 and S6.
- **Out of scope:** configurable ffmpeg paths (JOS-194 story S2; assembly still calls `/opt/homebrew/bin/ffmpeg`), packaging and Windows (JOS-194 L1–L9), the clause-boundary rules of `decompose-script-into-chunks`.
