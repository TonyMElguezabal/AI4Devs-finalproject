# Tasks — Define the video and audio assembly tooling

Timebox: 2 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk.

Runs independently of the other E13 spikes — it needs no framework, no store and no frontend. It *produces* inputs for US-33 (the speed-factor limit), `define-backend-stack` (what invoking the tool involves) and US-22 (assembly cost).

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-182-define-media-assembly` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Establish the baseline

- [ ] 1.1 Record the installed ffmpeg and ffprobe versions and paths, and confirm `libx264` and `aac` are present
- [ ] 1.2 Record the target output format being proven against: 16:9, expected 1920×1080 at 30 fps, H.264 video, AAC audio (D08)
- [ ] 1.3 Note that the target is US-33's to fix, and record what would change here if it moves
- [ ] 1.4 State the proposed per-clip duration tolerance (±1 frame, 33.4 ms at 30 fps) as the value experiment 4 will confirm or revise

## 2. Build the sample material

- [ ] 2.1 Generate or obtain clips of differing durations matching plausible provider-admitted durations
- [ ] 2.2 Include clips differing in resolution and frame rate, to exercise the normalisation in Decision 3
- [ ] 2.3 Give some clips their own audio track, so audio exclusion is actually tested rather than assumed
- [ ] 2.4 Produce a voice-over audio file and a set of synthetic narration intervals that partition its full duration
- [ ] 2.5 Record how the material was produced, so it can be regenerated

## 3. Establish the command pipeline

- [ ] 3.1 Retime a clip's video with `setpts` to hit a target interval, leaving audio untouched (Decision 1)
- [ ] 3.2 Exclude each clip's own audio at the input stage rather than muting it later (Decision 2)
- [ ] 3.3 Normalise a clip to the target resolution and frame rate with `scale` and `fps` (Decision 3)
- [ ] 3.4 Concatenate normalised clips in ascending scene order
- [ ] 3.5 Mux the voice-over as the single audio stream and encode to H.264 / AAC in an MP4
- [ ] 3.6 Capture the full pipeline as a repeatable script, with every filter and encoder flag explicit

## 4. Run the experiments and record evidence

- [ ] 4.1 Factor sweep: assemble the same clip across roughly 0.5× to 2.0×, reporting speed-up and slow-down separately, and identify where artefacts become objectionable
- [ ] 4.2 Keep every sweep output so the subjective judgement can be reviewed (Decision 6)
- [ ] 4.3 Recommend a speed-factor limit with its evidence, and state explicitly that the quality call is subjective
- [ ] 4.4 Duration accuracy: verify with ffprobe that each assembled clip lands within the stated tolerance of its target interval
- [ ] 4.5 Cumulative drift: assemble a long session and measure the accumulated offset per scene, not only the total duration
- [ ] 4.6 Audio integrity: verify the voice-over is the only audio, its duration and rate are unchanged, no clip audio survives, and A/V are in sync at the final scene
- [ ] 4.7 Mixed inputs: verify clips of differing durations, resolutions and frame rates join without artefacts into one compliant file
- [ ] 4.8 Cost: measure wall-clock and CPU for the long assembly on this machine, and hand the figure to US-22
- [ ] 4.9 Record every outcome including failures, and note which input properties the sources actually had
- [ ] 4.10 If ffmpeg fails a PRD constraint, stop and record the failing constraint and the fallback rather than working around it

## 5. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 5.1 Confirm which test suites exist at this point, including any added by the sibling spikes; record the finding rather than assuming it
- [ ] 5.2 Write automated checks asserting output duration against target intervals, output codecs and resolution, and the absence of clip audio — all verifiable with ffprobe
- [ ] 5.3 Write a check asserting cumulative drift stays within tolerance across the long session
- [ ] 5.4 Document the test command that runs them

## 6. Run Unit Tests and Verify State (MANDATORY)

No database is involved: this change writes media files, not records. The state to verify is therefore the filesystem, and the step is adapted accordingly rather than skipped — `define-persistence` owns the ruling on whether the database wording in `docs/openspec-tasks-mandatory-steps.md` binds at all.

- [ ] 6.1 Capture the pre-test state of the working and output directories (file list and sizes)
- [ ] 6.2 Run the targeted assembly checks and capture the pass/fail summary
- [ ] 6.3 Run the full check set and record totals, failures and runtime
- [ ] 6.4 Verify the post-test filesystem state matches the baseline, removing scratch outputs the tests produced
- [ ] 6.5 Create the report `openspec/changes/define-media-assembly/reports/YYYY-MM-DD-step-6-unit-test-and-state-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 6.6 Mark this step complete only after the checks pass and the report file exists

## 7. Manual Endpoint Testing with curl (NOT APPLICABLE)

- [ ] 7.1 Record that this step does not apply: the change adds no HTTP surface. Assembly runs as a local subprocess, and the endpoints that will eventually trigger it belong to US-16 and to `define-backend-stack`, whose task 7 covers its own surface

## 8. E2E Testing with Playwright MCP (NOT APPLICABLE)

- [ ] 8.1 Record that this step does not apply: the change touches no UI and adds no user workflow. Frontend work is owned by US-42b (JOS-180), and the assembly progress views belong to US-18 and US-19

## 9. Record the decision

- [ ] 9.1 Write the ADR: chosen tool, rejected alternatives with reasons, and the evidence behind each conclusion
- [ ] 9.2 Record the recommended speed-factor limit, per direction, marked as a recommendation for US-33 rather than a fixed value
- [ ] 9.3 Record the confirmed duration tolerance and the observed cumulative drift
- [ ] 9.4 Record the measured assembly cost, and state that US-22's per-phase maximum should derive from it
- [ ] 9.5 State what remains unproven until D11 closes, and what would have to be re-run once it does
- [ ] 9.6 Record anything else the timebox left unproven as an explicit risk

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 Add the assembly pipeline to `docs/backend-standards.md`: filters, encoder settings, container flags, and the order the stages run in
- [ ] 10.2 Document that the voice-over is never retimed and clip audio is excluded at input, so a later change does not reintroduce either
- [ ] 10.3 Document the normalisation step and why concatenating un-normalised provider clips is not safe
- [ ] 10.4 Confirm the result stays consistent with what the sibling spikes wrote to the same file, resolving any contradiction rather than layering over it

## 11. Commit the fixture

- [ ] 11.1 Reduce the sample material to the minimum that still exercises mismatched joins and audio exclusion (Decision 7)
- [ ] 11.2 Commit it with the script that produced the verified output, so US-16's tests have real media to run against
- [ ] 11.3 Record the fixture's total size, so its cost to the repository is visible
- [ ] 11.4 Document how to regenerate it rather than relying only on the committed binaries

## 12. Close out

- [ ] 12.1 Answer design open question 1 (is ±1 frame the right tolerance) from experiment 4.4
- [ ] 12.2 Answer design open question 2 (do the two directions need different limits) from experiment 4.1
- [ ] 12.3 Answer design open question 3 (frame interpolation when slowing down) only if the sweep showed slowdown is the binding constraint; otherwise record it as not needed
- [ ] 12.4 Hand the speed-factor recommendation to US-33 and the cost figure to US-22, confirming both were received
- [ ] 12.5 Create follow-up items for anything the spike revealed, linked to epic E13 (JOS-177)
- [ ] 12.6 Record time spent, to calibrate future spikes
- [ ] 12.7 Obtain review by at least one human, not only AI agents — the quality threshold in particular is a subjective call that needs confirming
