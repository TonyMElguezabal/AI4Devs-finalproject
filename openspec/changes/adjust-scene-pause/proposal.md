# Adjust the pause after a scene and rebuild the final video

Linear-Issue: JOS-190

## Why

D11 (JOS-142) gives every narration pause to the scene before it, so that scene's picture holds the screen through the silence. The product owner judged 2 s comfortable and 3 s "starts dragging", and asked for a manual dial for the scene that still drags: shorten or lengthen it and regenerate the result. Today nothing can change once the final video exists. The narration is muxed unchanged, every per-scene timing is locked, and `final-video.mp4` is written once.

Product-owner decisions taken while scoping this change (2026-10-15):

1. **The dial trims or extends the silence in the narration at that pause.** Moving the cut to the next scene or regenerating only the clip were rejected: neither removes the silence the User hears.
2. **It is used after the final video exists.** A drag can only be heard in the assembled video. **Rebuild final video** assembles a new versioned file and keeps the previous one.
3. **Range: 0.2 s floor, 3.0 s cap, 0.1 s steps,** starting at today's pause.
4. **Clamped, never regenerated.** A scene's range is narrowed so its existing clip stays within the 2.0× speed-factor limit. No clip is regenerated and no lock is lifted.
5. **MVP.**

## What Changes

- **Pause per scene (derived, not stored):** the silence after a scene's speech = its interval end − its last spoken character, computed with the existing `sentenceSpeechSpans` from the stored timestamps and the scene's `PROMPT`. The last scene's pause runs to the MP3's end. The silence before the first word is not adjustable.
- **Pause edits (new, mutable):** one stored value per edited scene. Setting a scene back to its original pause removes the edit. The range is the 0.2–3.0 s window (widened to include today's pause), intersected with what the scene's clip covers at ≤ 2.0×. Values outside it, or not on a 0.1 s step, are refused (422).
- **Rebuild final video:** a new command, accepted only when a final video exists, no assembly is running, and the edits differ from those the current final video was built with. It runs a fresh assembly cycle that:
  - cuts or inserts each pause's silence at the pause's midpoint, sample-accurately;
  - shifts every later scene's interval by the accumulated change;
  - retimes clips to those intervals as today;
  - writes `final-video-<n>.mp4` without replacing any earlier file.
  A failed rebuild leaves the previous final video as the current one.
- **Narration audio:** with no edits, unchanged (stream copy, ADR 0005 Decision 4b). With edits, the edited narration is encoded once as AAC inside the output MP4. The stored voice-over MP3 is never modified.
- **Session read:** each scene carries `pause` (original, current, min, max, and whether the speed factor limits it) once a final video exists. The session carries the final video's version and whether edits are pending.
- **Page:** the expanded scene card gets a **Pause after scene N** field with a reset. The Final video card gets **Rebuild final video**, with the previous file still downloadable while the rebuild runs.
- **BREAKING (spec only):** the narration's duration can now change in the output (rate never changes), and the session can hold more than one final-video file.

## Capabilities

### New Capabilities

- `scene-pause-adjustment`: deriving each scene's pause, the allowed range per scene (floor, cap, step, speed-factor clamp), storing and resetting edits, the rebuild command and its preconditions, versioned final-video files, and how the read and the page expose all of it.

### Modified Capabilities

- `media-assembly-foundation`: "Voice-over is the only audio and is never retimed" now allows the User's pause edits to shorten or lengthen silences. Speech and rate stay untouched, sync is kept, and with no edits the narration is still copied as-is.
- `assembly-failure-recovery`: "The final video appears only on success and never replaces a file" now covers rebuilds: each success adds `final-video-<n>.mp4`, no earlier file is replaced, and a failed rebuild leaves the current final video in place.

## Impact

- **Backend:**
  - `db.ts`: a pause-edit table and a final-video-build table, plus migrations.
  - `orchestrator.ts`: effective intervals, the rebuild launch path, the session read, and the state while a rebuild runs.
  - `assemblyTool.ts` / `ffmpegAssemblyTool.ts` / `stubAssemblyTool.ts`: optional narration edits.
  - `routes.ts`: `POST …/scenes/:sceneId/pause` and `POST …/final-video/rebuild`.
  - Restart recovery for a rebuild that was in flight.
- **Frontend:** `types.ts`, `SceneRow.tsx` (pause field), `FinalVideoDownload.tsx` (rebuild, version), `api/client.ts`, tests.
- **Docs:** `docs/api-spec.yml` (regenerated), `docs/data-model.md`, `docs/adr/0005-provider-selection.md` (Decision 4b exception), `docs/PRD.md` §7.3, `docs/frontend-standards.md` (three new accessible names).
- **Not touched:** stored intervals, requested durations, speed factors, the voice-over MP3, clips, and D11's rule. Every existing lock trigger stays.
