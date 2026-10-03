# Define the video and audio assembly tooling

Linear-Issue: JOS-182

## Why

The PRD fixes the final artefact precisely — a 16:9 MP4 at the hardcoded resolution and frame rate, H.264 video, AAC audio, clips joined in ascending scene order with no gaps, each retimed to its narration interval, and the voice-over as the only audio (§7.3, D08). It names no tooling, and no code exists to produce it.

The decisive unknown is not which tool: ffmpeg 8.1.2 is already installed here with `libx264`, `aac`, and the `setpts`, `concat`, `fps` and `scale` filters the job needs. It is **where output quality stops being acceptable as clips are retimed**, because nobody has measured it — and that number is what US-33 must hardcode as the speed-factor limit. Until it exists, §6.1's lower bound and §7.2's nearest-duration rule are tuned against a guess, and US-16 is experimentation rather than implementation.

## What Changes

- Confirm or reject ffmpeg as the assembly tool against the six PRD constraints, and record the fallback if it is rejected.
- Establish the exact command pipeline — filters, encoder settings, container flags — rather than leaving each of them to US-16.
- **Measure the speed-factor range where quality degrades**, in both directions, and recommend a limit with evidence for US-33.
- State and verify a duration tolerance per clip, and measure cumulative drift across a long session, since drift is what breaks the no-gaps requirement.
- Verify the voice-over is the only audio, is never retimed, and stays in sync from first scene to last.
- Verify clips of differing durations, resolutions and frame rates concatenate without artefacts at the joins.
- Measure wall-clock and CPU cost for a long assembly, so US-22's per-phase maximum time comes from data.
- Commit the sample assets and script as a fixture for US-16's tests.
- Add the pipeline to `docs/backend-standards.md`.
- No product behaviour ships, and no user-facing capability changes.

## Capabilities

### New Capabilities

- `media-assembly-foundation`: the guarantees this change establishes about producing the final video — a documented tool and pipeline, a measured quality threshold feeding the hardcoded speed-factor limit, a stated duration tolerance that holds across a full session, and a committed fixture so US-16 is tested rather than eyeballed.

The product behaviour this change's pipeline serves remains owned by its own stories and will be specified there: US-16 (assembling the final MP4), US-15 (recording the speed factor per scene), US-27 (retrying assembly from existing components).

### Modified Capabilities

None. `openspec/specs/` is still empty. The `backend-foundation`, `persistence-foundation` and `frontend-foundation` capabilities introduced by the sibling changes are not yet archived, so they are not existing specs this change can modify.

## Impact

- **Documentation**: the command pipeline added to `docs/backend-standards.md`; a new ADR.
- **Feeds US-33**: the recommended speed-factor limit is an output of this change and an input to the hardcoded-values spike. US-33 should not fix that number before this runs.
- **Feeds `define-backend-stack` (JOS-179)**: its gate 2.1 requires the chosen stack to invoke this tooling. Knowing what invoking it actually involves — a long-running subprocess producing large files — makes that gate testable rather than assumed.
- **Feeds US-22**: the measured assembly cost is what the per-phase maximum time should be set from.
- **Downstream tickets**: unblocks US-16 and US-27.
- **Blocked on D11 only at the end.** Silence allocation (US-09) decides what each clip must cover, so the *final* pipeline cannot be fixed until it closes. Every experiment here runs on synthetic intervals and does not wait: D11 changes the interval values, not whether the tooling can hit them.
- **Repository size**: the committed fixture adds binary media. This change states the size and keeps it to the minimum that still exercises concatenation and drift.
- **No deployed systems, external APIs or user data are affected.** Assembly is local and no provider is called, so no credentials are exercised.
