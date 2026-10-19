# Assemble the final video from completed scenes

## Why

`generate-chunk-video` leaves every chunk in `chunk-complete` with its own clip, but no session ever produces the deliverable the product exists to make: one narrated MP4. §7.3 makes this phase the only route to `final-video`, gated strictly on every scene completing, and it is where three requirements that have been true in isolation since earlier stories must hold true *together* for the first time: ascending-identifier ordering (§6, AC11), the interval partition earlier stages already guarantee (§7.3, AC19), and a failure that must never touch an already-successful component (§10.3, AC13).

## What Changes

- Launch assembly automatically once every chunk of a session reaches `chunk-complete`, moving the session `chunks-processing → final-video-generating`, through the shared phase-launch gate. A session with any scene `failed` or still processing SHALL NOT reach this phase (§7.3).
- Order clips by ascending `sequence_number`, never by the order in which their generation finished (§6, AC11).
- Place each already speed-adjusted clip at its chunk's persisted narration interval, treating the interval partition `decompose-script-into-chunks` already guarantees (contiguous, no gap, no overlap, AC19) as the source of truth — this story does not recompute or resolve it, and does not need D11's silence-allocation POC to be closed to consume it correctly.
- Discard each clip's own audio; the output's only audio track is the session's complete voice-over (§7.3, D08).
- Produce the output in the hardcoded format already closed by D08: H.264 video, AAC audio, expected 1920×1080 at 30 fps.
- Guarantee the result contains every narrated moment and every scene, in sequence, with no omission, no duplication, and no visual gap (§7.3).
- On success, persist the MP4 in the session's project folder (§12.2), move the session to `final-video` (terminal), and make the file available for download (§12.3) — the only session-level artifact downloadable alongside per-scene images and clips; the MP3, timestamps, and generated texts remain non-downloadable.
- On failure, preserve the voice-over and every successful scene; retry only the assembly stage instance, reusing (not reimplementing) `stage-retry-policy` and `stage-execution-time-limit`, never regenerating voice, images, or clips (§7.3, §10.3, AC13).
- Record the stage's diagnostics in a `StageExecution` row (`owner_type = session`, `stage_name = assembly`).

## Capabilities

### New Capabilities

- `final-video-assembly`: turning a session's completed scenes and voice-over into the single downloadable MP4 — the all-scenes-complete gate, the ordering and audio-replacement rules, the output format, and how an assembly failure is retried without touching already-successful work.

### Modified Capabilities

None. `openspec/specs/` is still empty; `chunk-video-generation`, `stage-retry-policy` and `stage-execution-time-limit` are consumed, not modified.

## Impact

- **Blocked on the same three stack spikes as every sibling story**: `define-backend-stack`, `define-frontend-stack`, `define-persistence`.
- **Blocked on `define-media-assembly` (JOS-182), a still-open spike**: the concrete assembly/editing tool this story delegates to (an ffmpeg-equivalent or similar) is not yet chosen. This change specifies the *behaviour* the tool must satisfy; it does not name the tool.
- **Depends on `generate-chunk-video`** for `chunk-complete` chunks with their result paths, requested durations and speed factors already computed.
- **Reuses, without modification, `bounded-retry-policy` and `stage-execution-time-limit`** for the `assembly` stage instance.
- **Consumes `decompose-script-into-chunks`'s interval partition as given** — this story is explicitly not where D11 (silence allocation) is resolved; it is written to hold under whichever rule D11 eventually adopts, per that change's own risk section.
- **Data model**: fills `Session.final_video_path` and introduces one `StageExecution` row per session (`stage_name = assembly`), per `readme.md` §3.
- **Downstream**: this is the terminal producing story of the MVP flow — nothing in the pipeline consumes its output within the MVP; it is delivered to the User.
- **The `assembly` stage instance may have no external provider identity to record** (§11's five-capability table does not list assembly among them) — `StageExecution.provider` may be null or a local marker for this stage, a nuance this change's design records rather than papering over.
