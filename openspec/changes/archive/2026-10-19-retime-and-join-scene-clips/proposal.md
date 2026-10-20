# Retime and join scene clips into the video track

Linear-Issue: JOS-149 (US-16, sub-story US-16a)

## Why

The final MP4 (§7.3) needs every scene's clip retimed to its narration interval and joined in scene order with no gap, omission or duplication. That has to hold over narration pauses and across sessions of hundreds of scenes. `define-media-assembly` (JOS-182) already proved how: ffmpeg `setpts` retiming, each clip's audio dropped at input, every clip normalised to the output shape, and frame counts carried forward cumulatively so drift stays bounded. No application code does any of this yet. This change turns that proven pipeline into a tested backend module.

JOS-149 is labelled `needs-splitting`. Its enrichment splits it into US-16a (this change: a pure media function, clips + intervals → one silent video track) and US-16b (the assembly phase: trigger, voice-over mux, `final-video`, the stored `FinalVideo` record). US-16a depends only on JOS-182's pipeline and fixture. It does not need real clips (JOS-146), the all-complete gate (JOS-150) or the retry policy (JOS-184), so it can be built and verified now. US-16b keeps the existing `assemble-final-video` change, which still describes the whole phase and is revised when US-16b starts.

## What Changes

- **Assembly plan (pure)**: from each scene's index, clip path, narration interval and measured clip duration, plus the voice-over duration and output frame rate, build the ordered segments:
  - order is ascending scene index, never completion or input order (§6, AC11);
  - each segment's frame count is snapped to the cumulative target end (`round(end × fps) − previous end frame`, JOS-182 Decision 4), so every scene starts within ±1 frame of its interval start at any session length;
  - each segment carries its retiming multiplier and its applied speed factor (measured clip duration ÷ interval duration).
  - The plan refuses an input whose intervals do not partition `[0, voiceOverDuration]`, or that has a missing or duplicate scene index, a non-positive clip duration, or a scene that cumulative rounding would leave with zero frames (which would omit it). The refusal names the scene and the problem; nothing is repaired silently.
- **One partition rule**: the plan's partition check reuses registration's existing rule (exact comparisons, no tolerance), extracted so both call sites share it. It is not a second implementation.
- **Media probe**: measure a file's duration, video stream shape and audio streams with `ffprobe`.
- **Video track builder**: run JOS-182's documented pipeline for each segment and then join the results:
  - per segment: `-map 0:v:0`, `setpts` by the plan's multiplier, `scale` + `fps` to the hardcoded `FINAL_OUTPUT`, an exact `-frames:v`, `libx264`/`yuv420p`;
  - then concatenate in plan order into one silent H.264 track, video only.
  - Clips are sped up or slowed down, never trimmed. No clip audio enters the pipeline.
- **No shell**: every `ffmpeg`/`ffprobe` call uses an argument array (`execFile`), because project-folder names derive from the user's title (§12.2). A title with shell metacharacters is tested.
- **Measured, not assumed**: the built track is probed. Each scene's start and duration must be within ±1 frame of its interval, the total within ±1 frame of the voice-over, and there must be no audio stream.

## Capabilities

### New Capabilities

- `scene-video-track`: turning a session's ordered scene clips and their narration intervals into one silent video track. Covers the input invariants, ordering, cumulative-frame retiming, normalisation to the output shape, exclusion of clip audio, the ±1-frame accuracy per scene and in total, and shell-free process invocation.

### Modified Capabilities

(none). `narration-intervals` keeps its requirements; only the code that checks the partition is extracted, and its behaviour is unchanged.

## Impact

- **Depends on `define-media-assembly` (JOS-182) landing on `feature/entrega-2-JAME`**. PR #3 is still open. Until it merges, the documented pipeline (`scripts/assemble.sh`), the committed fixture (`fixture/`, about 485 KB, five scenes of mixed resolution, frame rate and audio), the `media-assembly-foundation` spec and its ADR exist only on that branch. The tasks gate stops on this rather than copying files across branches. The gate also checks two merge conflicts PR #3 will hit:
  - its ADR is numbered `0005`, which `0005-provider-selection.md` already uses on this branch;
  - its `docs/backend-standards.md` section was written against the pre-rewrite template.
- **Consumes, unchanged**: `FINAL_OUTPUT` (`config/providers.ts`, JOS-165) for 1920×1080 at 30 fps, and the narration intervals (JOS-143).
- **Backend**: new modules `assemblyPlan.ts` (pure), `mediaProbe.ts` and `videoTrackBuilder.ts`. The partition rule is extracted from `sceneRegistration.ts`. There are no schema, route or session-state changes, and nothing in the running app calls the builder yet; US-16b wires it into the assembly phase.
- **Tests**: pure plan tests, media integration tests against JOS-182's fixture (skipped with a clear message when `ffmpeg`/`ffprobe` are absent), and an opt-in drift test on 50 or more synthetic scenes (`RUN_SLOW_MEDIA_TESTS=1`), run in the mandatory verification step.
- **Out of scope**, handled by US-16b and others:
  - muxing the voice-over, the final MP4 and its stored record, and `final-video-generating`/`final-video`;
  - the launch gate (JOS-150), retries (JOS-184), assembly retry (US-27), download (US-32);
  - persisting `appliedSpeedFactor` on scenes. This change only computes it in the plan. Whether the scene-details panel shows it beside JOS-148's requested-duration factor is US-16b's decision.
