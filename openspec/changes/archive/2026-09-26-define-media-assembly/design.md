# Design — Define the video and audio assembly tooling

## Context

§7.3 fixes the output and the transformation: each clip's duration is matched to its narration interval by speeding it up or slowing it down, **without modifying audio or text**; clips are joined in ascending scene order with no gaps, omissions or duplications, covering narration pauses; the result is a horizontal 16:9 MP4 whose only audio is the complete voice-over, each clip's own sound removed. D08 fixes the container contents: the hardcoded resolution and frame rate, expected 1920×1080 at 30 fps, H.264 video and AAC audio. §7.2 requires the achieved speed factor to be recorded per scene, with a warning — not a failure — above the hardcoded limit. §7.1 says source images are 16:9 at ≥1920×1080, and §7.2 that clips arrive at provider-admitted durations. §10.3 and AC13 require an assembly retry to reuse what already exists.

Verified on this machine rather than assumed: **ffmpeg 8.1.2** and **ffprobe** at `/opt/homebrew/bin/`, with `libx264` and `aac` encoders and the `setpts`, `atempo`, `concat`, `fps` and `scale` filters all present. The codecs §7.3 requires are available. So the tool question is nearly settled before the spike starts; the quality question is wide open.

That reframes the work. This is not a tooling comparison — it is a measurement exercise whose primary output is **a number**: the speed factor beyond which the result stops being acceptable. US-33 must hardcode that limit, §6.1's lower bound is derived from it, and §7.2's warning threshold is it. Nobody has measured it.

## Goals / Non-Goals

**Goals:**
- Confirm or reject ffmpeg against the PRD constraints, with a recorded fallback.
- Fix the exact command pipeline, so US-16 implements rather than experiments.
- Measure where retiming quality degrades, in both directions, and recommend the limit.
- State a duration tolerance and prove it holds per clip *and* cumulatively across a long session.
- Measure assembly cost, so US-22's per-phase limit is set from data.
- Leave a committed fixture so US-16 is tested against real media.

**Non-Goals:**
- The assembly orchestration logic — which scene is ready, what triggers assembly, how retries are driven — which is US-16 and US-27.
- Deciding silence allocation, which is D11 (US-09); this change consumes interval values, whatever rule produces them.
- Fixing the hardcoded resolution, frame rate or speed limit; this change *recommends* the limit, US-33 fixes it.
- Choosing image or video providers (US-33), or the backend framework that invokes the tool (US-42a).

## Decisions

**Decision 1 — Retime video only; never touch the voice-over.**
Clip speed is changed with `setpts` on the video stream. The voice-over is copied at its native rate, and `atempo` has no place in the pipeline.
*Alternatives:* retiming audio alongside video (rejected: §7.3 says the clip is matched to the interval *without modifying audio*, and the narration is the fixed reference the whole product is built around — stretching it would change how the narrator sounds and break the alignment every interval was derived from).

**Decision 2 — Discard each clip's audio at the input stage, not by muting later.**
Only the video stream of each clip enters the graph; the voice-over is the single audio input to the output.
*Alternatives:* mixing all audio and setting clip volume to zero (rejected: §7.3 requires clip sound removed, and a zero-gain stream is still encoded, still capable of leaking through a mixing mistake, and costs bitrate for silence).

**Decision 3 — Normalise every clip to the output resolution and frame rate before concatenating.**
Each clip is scaled and `fps`-converted to the hardcoded target, then joined.
*Alternatives:* the concat demuxer on raw provider clips (rejected: it requires identical codec parameters across inputs, and §7.2's admitted durations say nothing about matching resolution or frame rate between providers or over time — the first mismatched clip fails the join or corrupts it); concatenating first and normalising after (rejected: it makes per-clip retiming and per-clip speed-factor reporting impossible, both of which §7.2 requires).

**Decision 4 — Measure duration accuracy against a frame-level tolerance, and measure cumulative drift separately.**
Per-clip tolerance is proposed at ±1 frame (33.4 ms at 30 fps); drift is measured across a long session independently.
*Alternatives:* checking only total output duration (rejected: equal and opposite per-clip errors cancel in the total while each scene still drifts out of sync with its narration — the failure §7.3's no-gaps rule exists to prevent); checking only per-clip accuracy (rejected: small same-signed rounding errors accumulate, so fifty scenes within tolerance individually can still end visibly out of sync).

**Decision 5 — Report the quality threshold as a recommendation with evidence, not as a fixed constant.**
The sweep produces sample outputs and an observation of where artefacts become objectionable; US-33 sets the value.
*Alternatives:* hardcoding the limit here (rejected: T6 put all hardcoded parameters in US-33's scope, and two changes fixing the same constant is how they drift apart).

**Decision 6 — Judge quality by inspecting output, and record the judgement as subjective.**
Where motion judder becomes objectionable is a perceptual call; the sweep keeps the samples so a human can confirm or overrule it.
*Alternatives:* an automated quality metric such as PSNR or SSIM (rejected: they compare a distorted image against a reference, but a correctly retimed clip is *supposed* to differ from its source — the metric would measure the intended change, not the artefact); asserting a threshold with no samples (rejected: it hands US-33 a number nobody can check).

**Decision 7 — Keep the fixture minimal but structurally real.**
Enough clips of differing durations, resolutions and frame rates to exercise mismatched joins, plus a voice-over — not a full fifty-scene session.
*Alternatives:* committing the full long-session assets (rejected: large binaries in the repository forever, for coverage the drift experiment can generate on demand); committing none (rejected: US-16's tests would have nothing real to run against, which is how assembly ends up verified by eye).

## Risks / Trade-offs

- **Slowing down is the harder direction and may be the real limit** → Sweep both directions independently and report them separately; a single symmetric limit may not be honest. Speeding up drops frames, slowing duplicates them, and the two degrade differently.
- **The quality call is subjective and made by one observer** → Decision 6 keeps every sample, and the ADR records the judgement as subjective so the human review can overrule it.
- **The threshold arrives after US-33 has already fixed the limit** → Sequence this before US-33, or have US-33 treat its limit as provisional until this lands. The proposal states the dependency direction explicitly.
- **Drift only appears at length** → Measure across a session long enough to expose it; a five-scene test will pass while the real case fails.
- **The fixture bloats the repository** → Decision 7 caps it, and the task records the actual size so the cost is visible rather than discovered later.
- **D11 changes what each clip must cover** → It changes interval *values*, which every experiment here already treats as inputs. Only the final pipeline fixing waits, and the tasks separate the two.
- **A provider clip arrives in an unexpected shape** → Normalisation in Decision 3 absorbs it, but the spike should record which input properties it actually saw, since providers are not yet chosen.

## Migration Plan

Nothing is deployed and no assembly code exists, so there is no migration. Rollback is discarding the scratch outputs; the fixture and the documented pipeline are the only lasting artefacts, and both are additive.

## Open Questions

1. **Is ±1 frame the right tolerance**, or does the perceptual result allow looser? Proposed here, confirmed by experiment 2.
2. **Do speeding up and slowing down need different limits?** Answer from the sweep rather than assuming symmetry.
3. **Should frames be interpolated when slowing down**, trading CPU for smoothness, or is frame duplication acceptable? Only worth answering if the sweep shows slowdown is the binding constraint.
4. **What hardcoded resolution and frame rate does US-33 actually settle on?** Expected 1920×1080 at 30 fps (D08); this change proves the pipeline at that target and notes what changes if it moves.
