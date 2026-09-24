# Design — Assemble the final video from completed scenes

## Context

Every earlier story in this flow (`decompose-script-into-chunks`, `generate-chunk-image`, `generate-chunk-video`) has produced one piece of the guarantee this story finally has to exercise in combination: an ordered, gapless set of chunks (decomposition's invariant), each with a completed, speed-adjusted clip (video generation's output) and a completed voice-over (an earlier story entirely). Nothing has yet combined them, and nothing has needed the video provider's admitted-durations bookkeeping or the reasoning provider's segmentation logic to also be correct *together* until now — a bug in either upstream story surfaces here as a broken final video, which is exactly why AC19's partition property is treated as a precondition to trust, not a computation to repeat.

Two things distinguish assembly from every stage instance so far: it is the only session-level stage with no named external provider in §11's capability table (reasoning, voice, alignment, image, video — five, not six), and its concrete implementation depends on `define-media-assembly`, a sibling spike still open. This design specifies the *contract* assembly must satisfy so implementation can proceed the moment that spike lands, without guessing at its answer.

## Goals / Non-Goals

**Goals:**
- Specify assembly as a pure consumer of already-computed state (chunk order, intervals, speed-adjusted clips, voice-over) — it recomputes nothing decomposition or video generation already guarantee.
- Specify the audio-replacement and format rules (D08) as fixed, non-negotiable outputs of this stage, not configurable choices.
- Specify the failure-isolation guarantee (AC13) precisely: a failed assembly attempt must be provably free of side effects on voice, image, or video records.
- Leave an explicit seam for `define-media-assembly`'s tool choice, so this change's tests can run against a stand-in exactly as `define-backend-stack`'s and `define-frontend-stack`'s did against theirs.

**Non-Goals:**
- Choosing the assembly/editing tool — `define-media-assembly`'s decision.
- Resolving D11 (how narration silence is allocated to a chunk) — this story treats the persisted partition as given, whatever rule produced it.
- Any UI for downloading or presenting the final video — `define-frontend-stack`'s concern.

## Decisions

**Decision 1 — The all-scenes-complete check is a launch precondition evaluated on every chunk-completion event, not a periodic poll.**
Each time a chunk reaches `chunk-complete` or `failed`, the system checks whether every chunk of that session is now `chunk-complete`; if so and none has failed, assembly launches through the phase-launch gate.
*Alternative rejected:* polling all sessions on an interval. It adds latency between the last scene completing and assembly starting, and duplicates state-change detection the live-update mechanism already performs for every other transition in this project.

**Decision 2 — Assembly consumes the chunk list sorted by `sequence_number` and the voice-over's stored duration as its only inputs beyond the clip files themselves; it does not re-derive timing from the clips.**
Each clip's placement point and duration come from its chunk's `narration_start_seconds` and `narration_duration_seconds` (already the interval the clip was speed-adjusted to match, per `generate-chunk-video`). Assembly trusts this partition rather than measuring clip durations and re-deriving intervals from them.
*Alternative rejected:* measuring each rendered clip's actual duration and re-aligning from there. A speed-adjusted clip's actual duration should already equal its requested duration; re-deriving from measurement would let a rounding difference silently redefine the partition AC19 already fixed, and would make an assembly bug indistinguishable from a video-generation bug.

**Decision 3 — Audio replacement (discard each clip's track, use only the voice-over) and the output format (H.264/AAC, 1920×1080@30fps) are hardcoded constants of the assembly step, not parameters.**
D08 already closed this as a product decision, not an option; this story's job is to apply it, not to expose it as configurable.
*Alternative rejected:* making format a parameter for forward flexibility. §2.3 already excludes runtime configuration of parameters from the MVP; this stage is not the exception.

**Decision 4 — A failed assembly attempt is provably isolated by never writing to any voice, image, or video record — only to the `assembly` `StageExecution` row and, on success, to `Session.final_video_path`.**
No code path in this stage acquires write access to a `Chunk` row or a voice-over record; a retry re-reads their already-persisted results.
*Alternative rejected:* trusting convention (agreeing not to write those fields without enforcing it structurally). AC13's guarantee is strong enough ("sin volver a generar voz, imágenes ni clips") that it deserves a check a test can assert, not just a docstring.

**Decision 5 — `StageExecution.provider` for the `assembly` stage instance is nullable, and the diagnostic record still applies fully otherwise.**
§11's five-capability table has no assembly row; whatever tool `define-media-assembly` picks is local tooling, not a credentialed external provider in the sense the other four stage kinds are. `attempts`, `status`, `not_retryable`, and `error_message` are populated exactly as for any other stage instance.
*Alternative rejected:* inventing a synthetic provider identifier (e.g., `"local"`) to keep the column non-null. It would misrepresent a local tool as a provider selection `define-provider-configuration` never made, and a reader of the diagnostics later could mistake it for a real vendor choice.

## Risks / Trade-offs

- **`define-media-assembly` has not landed** → Decision 1–4 specify the contract independent of the tool; implementation runs against a stand-in exactly as the stack spikes' own harnesses do, and the ADR from that spike is what fills in the concrete tool.
- **A partition bug from an earlier story surfaces here as a visibly broken video, not where it originated** → Decision 2 makes assembly's trust in the partition explicit and testable in isolation (feed it a deliberately broken partition in a test and confirm assembly either detects the gap/overlap and fails cleanly, or is documented as trusting it unconditionally) — the design leans toward the former, since AC19's guarantee is exactly what a corrupted upstream state would violate.
- **D11's silence rule changes after this ships** → Decision 2's contract (trust the persisted interval, don't re-derive) is written to survive that: whichever rule D11 adopts still produces a partition this story consumes the same way.
- **Coupling with the stack spikes** → Same acceptance as every sibling story.

## Migration Plan

Nothing is deployed and no assembly code exists yet. This change adds the `final-video-assembly` capability and, once implemented, the first `Session.final_video_path` values and `assembly`-named `StageExecution` rows. Rollback before implementation is deleting the change directory.

## Open Questions

1. **Does assembly re-validate the partition (fail loudly on a gap/overlap) or trust it unconditionally?** The risk section leans toward validating; final call belongs to whoever implements this alongside `define-media-assembly`'s chosen tool, since the tool's own error surface on a malformed input may make one option cheaper than the other.
2. **What does `define-media-assembly` choose as the concrete tool, and what stand-in does this story's test suite use until then?** Not this change's decision — tracked as a blocking dependency.
