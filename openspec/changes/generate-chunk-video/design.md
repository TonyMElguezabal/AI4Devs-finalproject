# Design — Generate a chunk's video clip

## Context

This story mirrors `generate-chunk-image`'s shape (per-chunk provider call, phase-launch gate, `StageExecution` diagnostics, one correction exception) with one addition that has no counterpart in image generation: a duration must be chosen from a hardcoded discrete set before the provider is ever called, and that choice determines a speed factor the PRD requires recorded and shown (§7.2, AC23).

§7.2's definition of "closest" is easy to get wrong: it is the admitted duration requiring the **smallest speed change** to match the narrated interval, not the one with the fewest seconds of difference from it. A provider admitting {5, 10, 15}s against a 9-second narrated interval makes this concrete: 10s needs a 1.11× slow-down (10/9), 5s needs a 1.8× speed-up (9/5) — 10s is closer by seconds (1 vs 4) *and* by speed change, so that example doesn't separate the two readings. A narrated interval of 6 seconds against the same set does: 5s needs a 1.2× speed-up, 10s needs a 1.67× slow-down — 5s is the correct answer under "smallest speed change" despite 10s being closer in raw seconds (4 vs 1). The design has to make this the only implementable reading.

## Goals / Non-Goals

**Goals:**
- Specify the duration-selection function precisely enough that its "closest by speed change, not by seconds" rule and its tie-break are unambiguous and independently testable.
- Specify that the resulting speed factor is *derived*, not chosen — it falls out of the segmentation rule (already applied) and this duration selection, never set directly.
- Confirm the video stage instance and correction path reuse `generate-chunk-image`'s pattern without a second implementation of the same mechanisms.

**Non-Goals:**
- Assembly, which consumes `chunk-complete` chunks but is a separate change.
- Choosing the video provider or its admitted-durations set — `define-provider-configuration`'s decision.
- Re-litigating the segmentation rule that bounds narrated durations — `decompose-script-into-chunks` already guarantees no interval exceeds the provider's maximum, except the one documented unsplittable-sentence exception.

## Decisions

**Decision 1 — Implement duration selection as a pure function over (narrated duration, admitted-durations set) → (selected duration, speed factor), tested in isolation from the provider call.**
Speed change for slowing down is `selected / narrated`; for speeding up it is `narrated / selected`. The function picks the admitted duration minimizing that ratio (always ≥ 1), and on an exact tie between two candidates' ratios, picks the longer duration.
*Alternative rejected:* selecting by minimizing `abs(selected - narrated)` in seconds. This is the misreading §7.2 explicitly rules out ("no los menos segundos de diferencia") and the worked example above shows it picks a different, wrong answer at realistic values.

**Decision 2 — The floor case (narrated duration below the smallest admitted duration) is a boundary of the same function, not a separate branch invoked earlier.**
When the narrated duration is below every admitted duration, every candidate ratio is a slow-down, and the smallest admitted duration always yields the smallest such ratio — so the general minimization already produces the right answer without a special case.
*Alternative rejected:* checking "is narrated below the minimum?" as a guard clause before running the general selection. It duplicates a conclusion the minimization already reaches, and a future change to the admitted-durations set could let the guard clause and the general rule drift apart.

**Decision 3 — `speed_factor` stores the ratio actually applied (≥ 1 always), with a `slowed_down` / `sped_up` direction implicit in whether `selected_duration > narrated_duration`.**
This keeps `speed_factor` a single comparable number for the acceptable-limit check (§7.2), while the direction remains derivable from the two duration fields already on `Chunk` (`narration_duration_seconds`, `requested_duration_seconds`) without a fourth field.
*Alternative rejected:* a signed factor (< 1 for speed-up, > 1 for slow-down). It would require every consumer of the acceptable-limit check to branch on sign before comparing magnitude, for no information the two duration fields don't already carry.

**Decision 4 — The video stage instance, its correction path, and its diagnostics reuse exactly `generate-chunk-image`'s Decisions 1–3, substituting `stage = video` and the precondition `image-complete` for `stage = image` and no precondition.**
No new mechanism is introduced for concurrency, retry keying, temporary-link persistence, or the correction-as-manual-retry pattern.
*Alternative rejected:* none seriously considered — inventing a second mechanism for the same three concerns this close to `generate-chunk-image` would be the kind of duplication the project's standards already flag as a pattern to detect and avoid.

## Risks / Trade-offs

- **The duration-selection function is misimplemented as seconds-based** → Decision 1's worked example becomes a required unit test case (6s narrated against {5, 10, 15}s admitted, expecting 5s selected), so the wrong implementation fails immediately rather than passing on values where both readings happen to agree.
- **The acceptable speed-factor limit isn't final until `define-media-assembly` measures it** → Same provisional-value risk `define-provider-configuration`'s own design already records; this story consumes the constant, it does not fix it.
- **Coupling with the stack spikes** → Same acceptance as every sibling story.

## Migration Plan

Nothing is deployed and no per-chunk video code exists yet. This change adds the `chunk-video-generation` capability and, once implemented, the first populated `video_result_path`, `requested_duration_seconds`, `speed_factor` and `speed_factor_warning` values, plus `video`-named `StageExecution` rows. Rollback before implementation is deleting the change directory.

## Open Questions

1. **What is the final acceptable speed-factor limit?** Owned by `define-provider-configuration` (fixed) and `define-media-assembly` (measured); this story treats it as a named constant, provisional until both land.
