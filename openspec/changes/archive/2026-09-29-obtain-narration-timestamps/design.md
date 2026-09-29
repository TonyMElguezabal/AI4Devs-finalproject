# Design — Obtain narration timestamps for the script (JOS-139)

## Context

§5 step 3 and §11.1: timestamps come from the voice provider (native) or, when those are missing or unusable, from forced alignment of the generated MP3 against the known script, done by the alignment stage's own provider. §10.3: a timestamps failure is retried on the same audio, and if native timestamps were returned but unusable, both automatic and manual retries go straight to alignment; the voice provider is never asked again. §8.1 puts the whole decomposition phase (steps 3 and 4) under `chunk-decomposing`.

What exists on the base:
- `generate-voice-over` (JOS-136, groups 0-3 merged) created `voice_overs` (one row per session: relative `audio_path`, nullable `timestamps_path` holding the provider's **raw** timestamps, measured `duration_seconds`, `native_timestamps_available`), locked against update and delete by JOS-137, and the append-only `stage_attempts` table, whose `stage` is currently only `"voice-over"`. The voice launch itself (JOS-136 group 5) is not built.
- JOS-165 verified both mechanisms with real calls. ElevenLabs `/with-timestamps` returns an `alignment` object with parallel arrays `characters`, `character_start_times_seconds`, `character_end_times_seconds` for the exact text sent. `/v1/forced-alignment` (multipart `file` + `text`) returns `characters` (`text`, `start`, `end`) and `words`; its raw output is not a gapless partition (starts at 0.10 s, small gaps), which is D11's concern, not this story's. The recorded alignment phase limit is 5 s (observed 0.26-0.48 s on a 9 s clip).
- JOS-144 (stacked base) added `DecompositionFailure` and `deriveSessionState(scenes, failure)`.

## Goals / Non-Goals

**Goals:**
- One function that turns a completed voice-over into stored, checked, character-level timestamps, or a decomposition failure.
- A precise, testable meaning of "usable".
- The §10.3 retry rule enforced by the stage itself, whoever triggers the retry.

**Non-Goals:**
- Segmentation, intervals and silence allocation (JOS-140, JOS-143, D11).
- The retry budget, scheduling and the time-limit mechanism (JOS-184, JOS-185); the manual retry endpoint (JOS-156).
- Triggering the phase from the running app (JOS-136).

## Decisions

**Decision 1 — Nothing calls it yet; it is `obtainNarrationTimestamps(runId, alignmentProvider)`.**
Following the JOS-144 decision, the step is a function with an injected alignment port. JOS-136's voice phase calls it once a narration completes. It refuses a session without a voice-over (`no-voice-over`) and a session whose timestamps are already stored (`already-obtained`); it never calls the voice provider, so it cannot regenerate the MP3.

**Decision 2 — Each run is one `timestamps` stage attempt, recorded before any work.**
`stage_attempts` gains the stage `"timestamps"`. The attempt row is written `in-flight` first (with provider `elevenlabs-native` or `elevenlabs-forced-alignment`, whichever will be tried) and completed with its outcome. The mechanism tried is thus part of the append-only history, which is what Decision 5 reads.
*Alternative rejected:* a separate "decomposition started" flag on the session — a second source of truth next to the attempt records (the same reasoning as JOS-136 Decision 12).

**Decision 3 — "Usable" is checked the same way for both mechanisms, on a normalised form.**
Both provider shapes are parsed with Zod into `{ text, start, end }[]` per character. They are usable when: there is at least one character; the characters joined reproduce the locked script (exactly for native timestamps, since the script was sent unaltered; apart from whitespace for alignment, which may normalise it); every time is finite and non-negative; `end >= start`; starts never go backwards; and the last end is within the MP3's measured duration plus 0.5 s. Gaps between characters are allowed (partitioning is JOS-143's). Anything else is unusable, with a reason.

**Decision 4 — Native first, alignment in the same attempt when native is missing or unusable.**
If the voice-over has native timestamps and they pass Decision 3, they are used and no provider is called. If they are missing, the attempt calls the alignment provider directly. If they are present but unusable, the attempt records that finding and calls the alignment provider in the same attempt (§11.1: alignment "is also used when native timestamps are returned but unusable"), so a usable result does not wait for a retry.
*Alternative rejected:* failing the attempt on unusable native timestamps and relying on a retry to reach alignment — it makes every such session fail first and depend on a retry policy that does not exist yet.

**Decision 5 — After native timestamps were judged unusable, every later attempt goes straight to alignment.**
The attempt's recorded outcome keeps the finding (`error_code: "native-unusable"` on the attempt that used alignment or failed). A later attempt of the stage for the same session, automatic or manual, skips the native check and calls the alignment provider (AC5, §10.3).

**Decision 6 — The alignment adapter makes one request and classifies by HTTP status.**
`POST https://api.elevenlabs.io/v1/forced-alignment`, multipart with the stored MP3 as `file` and the locked script as `text`, `xi-api-key` from `ELEVENLABS_KEY` via `loadCredential`. One request, no retry, `fetch` only; the 5 s phase limit from `PER_PHASE_MAX_TIME_SECONDS.alignment` aborts it. Classification: not retryable for 4xx except 408 and 429; transient for 408, 429, 5xx, network errors and the time limit (the product owner's rule for voice). The response is validated with Zod; the reason never carries the raw body or the key.

**Decision 7 — The result is stored once and never replaced.**
Migration 8 adds `narration_timestamps` (primary key `run_id`, `mechanism` `native` | `alignment`, relative `path`, `character_count`, `obtained_at`), with `BEFORE UPDATE` and `BEFORE DELETE` triggers (JOS-137 convention; `resetAll()` lifts the delete trigger like the others). The normalised JSON is written with `writeArtefactOnce` to `narration-timestamps.json`. The row and the file are written only after the file exists, so a stored row always has its file.

**Decision 8 — A failure is a decomposition failure; the state is derived from the records.**
When neither mechanism yields usable timestamps, the attempt is completed as failed and the session gets a `DecompositionFailure` (phase `decomposition`) whose cause names the timestamps and says the script and the narration are unchanged; retryable unless the alignment provider answered a client error. The voice-over row is never touched. `deriveSessionState` gains, for a session with no chunks: a failure → `failed`; else stored timestamps or a `timestamps` attempt → `chunk-decomposing`; else a voice-over → `voice-over-complete`; else `submitted`. The session state machine allows `voice-over-complete -> chunk-decomposing` and `chunk-decomposing -> chunks-processing | failed`. JOS-136's task 5.15 adds `voice-over-generating` on top.

## Risks / Trade-offs

- **The 5 s alignment limit was measured on a 9 s clip.** A long narration may take longer to align and hit the limit, failing transiently every time. → Kept as recorded (JOS-165 owns the value); the timing of the first real long alignment should be checked, and the value revised in JOS-165 if needed.
- **The raw native-timestamp file format is assumed from JOS-165's verification**, since JOS-136 has not yet stored one. → The parser is one Zod schema; JOS-136 task 12.3 records the stored form, and a mismatch shows up as "unusable", which falls back to alignment rather than failing.
- **Exact text match for native timestamps may reject timestamps over a harmless difference** (for example Unicode normalisation). → It falls back to alignment, which compares apart from whitespace; the cost is one alignment call.
- **No caller in the app yet** → proven by tests and a manual run with a real MP3; wired by JOS-136.

## Migration Plan

Migration 8 creates `narration_timestamps` and its two triggers; no existing data changes. Rollback: drop the triggers and the table.

## Open Questions

None blocking.
