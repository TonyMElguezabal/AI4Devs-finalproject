# Design — Retime and join scene clips into the video track

## Context

`define-media-assembly` (JOS-182, ADR "Video and audio assembly tooling", Accepted 2026-09-26) chose ffmpeg and proved one pipeline, `scripts/assemble.sh`, against a committed five-scene fixture and a synthetic 200-scene session. Its decisions bind this change:

1. Retime video only, with `setpts`.
2. Drop each clip's audio at input with `-map 0:v:0`.
3. Normalise every clip with `scale` + `fps` before concatenation.
4. Carry frame counts forward from the cumulative interval end. Rounding each clip on its own drifted about 122 ms over 200 scenes. Carry-forward bounds every join to ±0.5 frame and a single clip to ±1 frame.

The spec `media-assembly-foundation` adds: "Implementation work SHALL follow that pipeline rather than composing its own."

The script is a bash proof, not application code. It shells out with interpolated paths, uses `python3` for arithmetic, and does the voice-over mux in the same step. This change ports stages 1 and 2 (minus the mux) into typed backend modules, with the arithmetic split into a pure, exhaustively tested plan.

Relevant current state on `feature/entrega-2-JAME`:

- `FINAL_OUTPUT` (`config/providers.ts`) holds 1920×1080, 30 fps, H.264, AAC.
- Intervals are stored per scene and checked at registration by `findPartitionProblem` (`sceneRegistration.ts`, private, takes `SegmentedFragment[]`).
- `ffmpeg`/`ffprobe` 8.1.2 are installed locally (`/opt/homebrew/bin`).
- No clip files exist yet (JOS-146 not implemented), so this change works from explicit inputs, not from the `scenes` table.

## Goals / Non-Goals

**Goals:**
- One pure function that turns scene inputs into an ordered, validated plan with exact frame counts. All the arithmetic that can go wrong lives here and is unit-tested without media.
- A builder that executes the plan with JOS-182's filters and flags and nothing else.
- Verification by probing the output, not by trusting the command line (the JOS-182 spec requires measurement).

**Non-Goals:**
- The voice-over mux, the final MP4, the `FinalVideo` record, and session states. That is US-16b, which keeps the existing `assemble-final-video` change.
- Reading scenes from the database, launching from the phase gate, retries and restart handling. All are US-16b, with JOS-150 and JOS-184.
- Persisting or displaying the applied speed factor. US-16b decides whether the scene-details panel shows it beside JOS-148's requested-duration factor.
- Changing JOS-182's pipeline. If implementation finds a flaw, the change pauses for an artifact update rather than diverging silently.

## Decisions

**Decision 1 — Split into a pure plan, a probe, and a builder.**
`buildAssemblyPlan(scenes, voiceOverDurationSeconds, fps)` returns `{ ok: true, segments } | { ok: false, reason }`. It does no I/O.

Each segment holds:
- `sceneIndex`, `clipPath`;
- `startFrame`, `frameCount`;
- `setptsMultiplier`;
- `appliedSpeedFactor`.

`probeMedia(path)` wraps `ffprobe`. `buildVideoTrack(plan, workDir, outputPath)` runs ffmpeg. The caller probes clips for their measured durations, builds the plan, then builds the track. US-16b composes the same three.
*Alternative rejected:* a single "assemble" function that probes, plans and encodes. The frame arithmetic is the part JOS-182 found broken in practice, and burying it behind ffmpeg calls would make every test of it a slow media test.

**Decision 2 — Extract the partition rule; do not write a second one.**
`findPartitionProblem` moves from `sceneRegistration.ts` into a small pure module, `narrationPartition.ts`, with the signature `(intervals: readonly NarrationInterval[], voiceOverDurationSeconds: number)`. Registration maps its fragments to intervals and keeps its existing messages. The plan calls the same function. Exact `!==` comparisons stay (backend-standards: "A tolerance would only hide a second boundary rule creeping in").
*Alternative rejected:* re-checking contiguity inside the plan with its own loop. That would be two definitions of one invariant, the drift this project's standards forbid.

**Decision 3 — The applied speed factor is measured ÷ interval, computed but not stored.**
`appliedSpeedFactor = measuredClipDuration / intervalDuration` is signed: above 1 is sped up, below 1 is slowed down. This matches JOS-182's fixture `speedFactor` field and the ticket's enrichment. It differs from JOS-148's `speed_factor`, which is unsigned (`max(a/b, b/a)`) and based on the requested duration. Both are legitimate: one is what was planned at registration, the other is what the real clip forced at assembly. This change only computes the applied factor. Storing it is a schema change that belongs with the phase that runs at assembly time (US-16b).
*Alternative rejected:* overwriting or reinterpreting JOS-148's `speed_factor`. It is locked by a trigger, and its meaning (decided at registration, against the limit) is specified.

**Decision 4 — Process launch through `execFile` with argument arrays; one helper.**
A small `runMediaTool(command, args)` wraps `node:child_process.execFile`. It never sets `shell: true`, captures stderr for the error message, and rejects on a non-zero exit. Both `probeMedia` and `buildVideoTrack` use it.

Paths are passed as single arguments. ffmpeg's concat filter takes inputs as `-i` arguments, so no concat list file with path quoting is needed. The 200-scene case passes about 400 arguments to one ffmpeg call, well within macOS's `ARG_MAX`.
*Alternative rejected:* the concat demuxer with a list file. It needs ffmpeg's own escaping rules for paths containing quotes, which brings back exactly the injection-shaped risk the security requirement closes.

**Decision 5 — Media tests skip when the tools are absent; the 50+ scene drift test is opt-in.**
Fixture-based integration tests run when `ffmpeg` and `ffprobe` are on `PATH` and skip with a stated reason otherwise, following the existing contract-test pattern (`describe.skipIf`). Most of a 50+ scene build's cost is normalising to 1080p, roughly 45 s for 40 scenes in JOS-182's measurement. That is too slow for the default suite, so the drift test runs only with `RUN_SLOW_MEDIA_TESTS=1`, and the mandatory verification step runs it explicitly and records the result.
*Alternative rejected:* lowering the output resolution in the drift test to make it fast. The pipeline under test always normalises to `FINAL_OUTPUT`. A test at another shape would prove a different command.

**Decision 6 — Intermediate files live in a caller-supplied working directory; the builder never writes outside it or the output path.**
Per-segment normalised clips go to `workDir`, which the caller owns and cleans up, so US-16b can place it inside the session folder. The builder writes the output to a temporary name beside `outputPath` and renames it on success. A failed build never leaves a partial output.

## Risks / Trade-offs

- **PR #3 is unmerged**, so the pipeline and fixture are not on this branch. The tasks gate stops on it rather than copying files across. → The gate names the two merge conflicts PR #3 will hit (the duplicate ADR number `0005`, and a `backend-standards.md` section written against the old template) so whoever merges it knows before resolving.
- **Two speed factors with similar names** (JOS-148's `speed_factor`, this plan's `appliedSpeedFactor`). → Decision 3 states their difference, and the plan's field name says "applied". Display is left to US-16b as an explicit open question.
- **Encoder output is not bit-identical across ffmpeg versions.** → Tests assert frame counts, stream shape and the absence of audio, never byte equality.
- **`round` is not the same function in both implementations.** `assemble.sh` uses Python's `round`, which rounds halves to even; JavaScript's `Math.round` rounds them up. On an interval end that lands exactly on a half frame, the two can differ by one frame. → The carry-forward bound (±0.5 frame at each join, ±1 per clip) holds under either rule, because each join is rounded once from the cumulative target. The plan uses `Math.round`, says so in a code comment, and has a test with a half-frame end.

## Migration Plan

No schema, route or state change. New modules plus an extracted function whose behaviour is unchanged (registration's existing tests must pass untouched). Rollback is reverting the change.

## Open Questions

1. **Does the scene-details panel show the applied factor, the requested factor, or both?** This is US-16b's decision once assembly stores the applied one.
2. **Is the copied fixture under `work/fixture-src/` on this branch identical to PR #3's `fixture/`?** The gate checks this. Tests use PR #3's `fixture/` once merged, never the `work/` scratch copy.
