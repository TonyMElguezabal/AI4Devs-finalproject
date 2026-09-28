# Obtain narration timestamps for the script

Linear-Issue: JOS-139 (US-06)

## Why

Segmentation (§6.1) cuts the script where sentences end in the narration, so it needs to know where every part of the script sits in the MP3. §5 step 3 obtains those timestamps as the first act of the decomposition phase, and §11.1 fixes the order: the voice provider's native timestamps first, forced alignment of the MP3 against the script when native ones are missing or unusable. Nothing in the backend does this yet, so a narrated session could never move on to segmentation (JOS-140) or to scene registration (JOS-144).

This change is carved out of the umbrella change `decompose-script-into-chunks`, which bundled this ticket with segmentation and intervals. Its timestamps requirements move here so the two changes don't state the same rules twice.

## Mechanism (product owner decision, 2026-09-28)

The spike JOS-138 (US-05, "which mechanism does the voice provider need?") is answered by the real calls already made in JOS-165 (reports step 4 and step 5a): ElevenLabs returns **character-level** native timestamps that locate every sentence end and clause boundary, so native timestamps are the normal mechanism; ElevenLabs Forced Alignment (`/v1/forced-alignment`, same account) is the verified fallback. No new spike runs; JOS-138 is closed on that evidence.

## What Changes

- **AC1 — Phase start:** obtaining timestamps records a `timestamps` stage attempt before anything else; while it is under way, or after it succeeded and before chunks exist, a session with a voice-over derives to `chunk-decomposing`.
- **AC2 — Native timestamps:** when the voice-over has native timestamps and they are usable, they are used and the alignment provider is not called. Usable means: they parse, their characters reproduce the script exactly, and their times are non-negative, ordered and within the MP3's duration.
- **AC3 — Forced alignment:** when there are no native timestamps, or they are unusable, the alignment provider receives the stored MP3 and the locked script and its answer is used, after the same checks.
- **AC4 — Failure attribution:** when neither mechanism yields usable timestamps, the session records a **decomposition** failure (state `failed`, failed phase `decomposition`), never a voice failure; the voice-over and its MP3 are untouched.
- **AC5 — Retry after unusable native timestamps:** once native timestamps were judged unusable, every later attempt of the stage goes straight to the alignment provider. No attempt ever calls the voice provider or regenerates the MP3.
- The obtained timestamps are normalised to one format (per character: text, start, end, plus the mechanism used), stored once in the project folder, and never replaced: segmentation and a later decomposition retry use the same timestamps (§10.3).

## Trigger

As with JOS-144, nothing in the running app calls this step yet. It is `obtainNarrationTimestamps(runId, alignmentProvider)`; the voice-over phase (JOS-136) calls it when a narration completes, since that phase does not exist yet either.

## Out of Scope (owned by other tickets)

- The voice-over itself and storing its raw native timestamps: JOS-136.
- Cutting the script into fragments, and turning timestamps into a gapless partition of the audio (silence allocation, D11): JOS-140, JOS-141, JOS-143, JOS-142.
- The automatic retry budget and scheduling (JOS-184/JOS-154), the per-phase time limit mechanism (JOS-185), and the manual retry of the timestamps stage (JOS-156).

## Capabilities

### New Capabilities

- `narration-timestamps`: obtaining the character-level position of the script in the narration — when the phase starts, when native timestamps are used and what makes them usable, when forced alignment is used, how the result is stored, and how a failure is attributed and retried.

### Modified Capabilities

None in `openspec/specs/`. The umbrella change `decompose-script-into-chunks` (not archived) loses its timestamps requirements in this same change, with a pointer here.

## Impact

- **Depends on** JOS-136's records on `feature/entrega-2-JAME` (`voice_overs` with the MP3 path and the raw native-timestamps path, `stage_attempts`), JOS-165 (alignment provider, `ELEVENLABS_KEY`, 5 s phase limit) and JOS-144's `DecompositionFailure` (branch stacked on `feature/jos-144-assign-scene-identifiers`, PR #10, until it merges).
- **Backend:** the `timestamps` stage; a usability check for native timestamps; an ElevenLabs forced-alignment adapter; a write-once record of the obtained timestamps (migration 8); `deriveSessionState` gains `voice-over-complete` and `chunk-decomposing`; the session state machine allows `voice-over-complete -> chunk-decomposing -> failed`.
- **API:** no new route; the session read shows the new states.
