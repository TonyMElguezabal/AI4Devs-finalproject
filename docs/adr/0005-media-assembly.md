# ADR 0005 — Video and audio assembly tooling

- Status: Accepted
- Date: 2026-09-26
- Change: `define-media-assembly` (JOS-182, US-42-adjacent spike)
## Context

PRD v1.3 §7.3 and D08 fix the final artefact precisely — a 16:9 MP4 at (expected) 1920×1080/30fps, H.264 video, AAC audio, clips joined in ascending scene order with no gaps, each retimed to its narration interval without touching the voice-over, which is the only audio in the output. No tooling existed, and nobody had measured where retiming quality degrades — the number US-33 needs to hardcode the speed-factor limit.

ffmpeg 8.1.2 was already installed (`/opt/homebrew/bin/`) with `libx264`, `aac`, and every filter the job needs (`setpts`, `atempo` unused, `concat`, `fps`, `scale`) confirmed present before this spike began. So this was framed from the start as a measurement exercise, not a tooling bake-off.

## Decision

**ffmpeg**, confirmed against all six PRD constraints (16:9 output, target resolution/frame rate, H.264, AAC, ascending-order no-gap concatenation, voice-over-only audio) — no candidate was rejected, no fallback needed.

**The experimental reference pipeline** (`openspec/changes/archive/2026-09-26-define-media-assembly/scripts/assemble.sh`):

1. **Per clip**: `setpts` retimes video only (never audio); `-map 0:v:0` excludes the clip's own audio at the input stage, never by muting after decode; `scale` + `fps` normalise to the target shape; the exact output frame count is stated directly (`-frames:v`), not derived from a time cutoff.
2. **Concatenate**: the `concat` filter joins all normalised clips in ascending `sceneId` order (read from the interval data, never filesystem listing order).
3. **Mux**: the voice-over is muxed as the output's only audio stream via `-c:a copy` — **not** re-encoded (see Decision 4 below for why this specific detail is load-bearing, not cosmetic).

## Decision 1 — Retime video only; never touch the voice-over

Implemented via `setpts` on the video stream alone; the voice-over passes through untouched, never `atempo`. Confirmed live: the assembled output's audio stream duration and sample rate matched the source voice-over file exactly (`reports/`).

*Alternative rejected*: retiming audio alongside video — would change how the narrator sounds and break the alignment every interval was derived from.

## Decision 2 — Discard each clip's audio at the input stage

`-map 0:v:0` means the clip's audio stream is never even read by the filter graph, not decoded-then-discarded. Verified: the fixture's scenes 1/3/5 each carry a distinct-frequency tone, and the assembled output has exactly one audio stream matching the voice-over precisely — no trace of any clip tone.

*Alternative rejected*: mixing all audio and zeroing clip gain — still encodes silence, still one mixing mistake away from leaking through.

## Decision 3 — Normalise every clip before concatenating

Every clip is `scale` + `fps`-converted to the target shape before `concat`. Proven against a fixture spanning three resolutions (1280×720, 1920×1080, 960×540) and three frame rates (24, 25, 30fps): the assembled output is one constant-parameter 1920×1080@30fps stream, frame count exactly equal to the sum of each normalised clip's own frame count (no join dropped or duplicated a frame).

*Alternative rejected*: the concat demuxer on raw provider clips — requires identical codec parameters across inputs, which nothing here guarantees.

## Decision 4 — Cumulative frame accounting, not independent per-clip rounding

**This is the central finding of this change**, not an implementation footnote.

The obvious approach — round each clip's own duration to the nearest frame independently — was tried first and **failed at the scale the MVP actually targets**. Measured: at 40 scenes (~112s), cumulative drift reached 26.8ms (within the proposed ±1-frame/33.3ms tolerance); at 200 scenes (~564s — the "hundreds of scenes" scale §4.1's uncapped script length can reach), cumulative drift reached **122.5ms, nearly 4 frames**, at scene 73 — well past tolerance, even though every individual clip's own rounding stayed within it. This is a random walk (confirmed against the theoretical model for independent uniform rounding error: predicted std ≈136ms at N=200, matching the observed magnitude), not a rare edge case — it gets *worse*, not better, as a script gets longer, which is exactly the direction the MVP's own "no cap on scenes" requirement pushes.

**Fix**: each clip's frame count is derived from its *cumulative* target position — `round(cumulative target end × fps) − previous clip's own rounded end frame` — never from that clip's duration in isolation. This bounds drift to ≤0.5 frame (≤16.67ms) **at every join, by construction, regardless of session length**, proven not just by argument but by the assembled output's own total frame count exactly matching `round(target total × fps)` at both 40-scene (3359 frames) and 200-scene (16905 frames) scale.

This also resolves design open question 1 precisely: **±1 frame is the right per-clip tolerance, and not by convenience** — carry-forward accounting trades a tighter *per-clip* bound (±0.5 frame, achievable independently) for a *cumulative* bound of the same size, and the net worst case for an individual clip under this scheme is exactly ±1 frame (two independent half-frame roundings can partly cancel or add). A tolerance tighter than ±1 frame would be incompatible with the only technique that keeps cumulative drift bounded at all.

*Alternative rejected*: checking only total output duration — the design's own anticipated risk, and this change found a sharper version of it: not just "equal and opposite errors cancel in the total," but an *intermediate* cumulative point (scene 73 of 200) can be the worst point, one a total-only check would never see even if the final total happened to look fine.

## Decision 4b — A second, independently-found bug: audio re-encoding

While tracing the last few milliseconds of an early (post-fix) drift measurement, re-encoding the voice-over at the final mux (`-c:a aac`, i.e. decode-then-re-encode an already-AAC source) was found to shift its own reported duration by ~7-11ms via AAC's encoder-priming delay — a direct violation of Decision 1's "copied at its native rate." Fixed by using `-c:a copy` (stream copy, no re-encoding). This is now load-bearing: the voice-over's duration/rate guarantee (spec "Voice-over is the only audio and is never retimed") depends on this specific flag, not on Decision 1's *intent* alone.

**Methodological finding, recorded so it isn't rediscovered expensively later**: `ffprobe`'s per-file `format=duration` on an intermediate container is not reliable evidence for frame-accurate accumulation — it carries its own container-metadata rounding, independent of the actual frame content. `nb_frames` on the final concatenated output is the correct signal, and is what every bound in this ADR is actually checked against.

## Decision 5 — Speed-factor threshold: 0.5×-2.0×, asymmetric in basis

Swept a clean `testsrc` source (already at the 1920×1080@30fps target, no normalisation confound) across factors 0.5×-2.0×, measuring exact byte-identical consecutive-frame duplication on the raw filter output (encoder-noise-free — see Decision 4b's methodological note; the same container-duration pitfall was checked for here too).

**Result is sharply asymmetric**: speed-up (factor > 1.0) produced **0% duplicate frames at every tested factor up to 2.0×** — ffmpeg drops source content rather than duplicating it, so there is no mechanical duplication artefact in this direction, at least within the tested range. Slow-down (factor < 1.0) produced duplication growing exactly as `1 − factor` predicts mathematically: 0.9×→9.8%, 0.8×→20.0%, 0.7×→29.8%, 0.6×→40.0%, 0.5×→50.0%.

**Recommendation for US-33: 0.5× (floor) to 2.0× (ceiling)** — the full tested range. The 0.5× floor is where duplication reaches exactly 50% (every other frame a repeat), at the edge of what conventional frame-hold retiming (no optical-flow interpolation) is generally considered acceptable for cutaway-style content; 2.0× is a *tested-clean* ceiling (zero mechanical artefact anywhere in range), not a measured breaking point.

**Subjective element, stated explicitly (Decision 6, `design.md`)**: whether 50% duplication *looks* acceptable is a perceptual judgement this synthetic sweep cannot make on its own — judder is a temporal artefact invisible in a still frame, so extracted stills could only rule out gross encoding corruption (confirmed clean at both extremes), not confirm or deny perceived stutter. All 11 sweep outputs are kept (not committed — scratch, regenerable via `scripts/sweep.sh`) for a human to watch and confirm or overrule this recommendation, per task 12.7.

**Fixture limitation, stated honestly**: `testsrc`'s content is a continuously-driven synthetic pattern with no discrete real-world motion or motion blur. It is well-suited to objectively measuring frame duplication but may understate perceptual speed-up artefacts (strobing, choppy panning) that real footage with genuine discrete motion could show. This recommendation should be revisited once real provider footage (US-33) is available.

## Design open questions, answered

1. **Is ±1 frame the right tolerance?** Yes — see Decision 4's precise justification (it is the exact cost of the only technique that bounds cumulative drift).
2. **Do speeding up and slowing down need different limits?** Data says the *mechanism* is sharply asymmetric (0% vs. growing duplication), but the *recommended numeric range* (0.5×-2.0×) happens to match the tested bounds in both directions — asymmetric in basis, not (yet) in the recommended number, pending real-footage validation of the speed-up side.
3. **Should frames be interpolated when slowing down?** Design's own condition for asking this at all — "only worth answering if the sweep shows slowdown is the binding constraint" — is met (question 2), so: **not needed within the recommended 0.5×-2.0× range.** The recommendation in Decision 5 already accepts frame-hold duplication up to 50% (at the 0.5× floor) as the edge of acceptable for cutaway-style content; interpolation would only become worth its CPU cost if a future need pushed *past* 0.5× (slower), which this change does not recommend doing. Not evaluated for that hypothetical case, since it isn't the recommended range — a real gap, not this change's to close, but correctly scoped to only matter if the recommendation itself is later widened.
4. **What resolution/frame rate does US-33 settle on?** Proven at the expected 1920×1080@30fps (D08); only the `scale`/`fps` filter arguments change if it moves — the pipeline shape, Decision 4's frame math, and the speed-factor measurements are all resolution/frame-rate-independent.

## Cost (feeds US-22)

Machine: Apple M1 Max, 10 cores (8P+2E). 40 scenes (~112s of assembled content): 44.3s wall clock. 200 scenes (~564s of assembled content — the scale the MVP's uncapped script length can actually reach): **166.5s (2m 46s) wall clock**. Cost scales roughly linearly with content duration (~0.30-0.40× realtime on this machine) — assembly is markedly faster than the material it produces. US-22's per-phase maximum for this stage should be set as a fraction of the assembled video's own duration, not a fixed constant independent of session length.

## Risks left unproven within the timebox

- **Real (non-synthetic) footage was never tested.** No image/video provider is chosen yet (US-33); the speed-factor recommendation in particular may need revisiting once real footage — with genuine motion and motion blur — is available, per Decision 5's stated fixture limitation.
- **Frame interpolation for slow-down (open question 3) was not evaluated** — flagged as a follow-up, not answered.
- **D11 (silence allocation) was not yet closed** at the time of this change; every experiment here treats interval *values* as inputs, which is unaffected by D11's eventual rule, but the *final* pipeline parameters cannot be considered fully fixed until D11 closes, per the proposal's own stated dependency.
- **The perceptual quality judgement (Decision 5) is a single AI agent's provisional read of objective duplication data and clean-still spot-checks — not a human watching the sweep clips play.** Task 12.7 flags this explicitly as the one item most needing human confirmation before this ADR's recommendation is treated as settled.

## Consequences

- `docs/backend-standards.md` gains the assembly pipeline section (this change) — **note**: on this branch (based on `main`), that file is still the pre-rewrite inherited template; `define-backend-stack`'s full rewrite exists only on `feature/entrega-2-JAME`. This change's section was added additively rather than assuming a rewritten file that isn't present here — reconcile at merge time.
- `openspec/changes/archive/2026-09-26-define-media-assembly/scripts/assemble.sh` is the experimental reference pipeline, with its specification in `openspec/changes/archive/2026-09-26-define-media-assembly/specs/media-assembly-foundation/spec.md`.
- `openspec/changes/archive/2026-09-26-define-media-assembly/fixture/` (5 scenes, ~492KB) is the committed synthetic test fixture, with `scripts/generate-fixture.sh` documenting exact regeneration.
- The speed-factor recommendation (0.5×-2.0×, evidence above) is an input to US-33, not a value US-33 must re-derive.
