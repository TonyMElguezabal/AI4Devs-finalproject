# Step 4 Report — Rendered Comparison and Threshold Sweep

- Date: 2026-09-29
- Change: decide-silence-allocation (JOS-142)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-142-decide-silence-allocation`

## Method

### Task 4.1 — the pick

Narration: `english-exclamation-paragraph` (native shape), the English survey script with the longest natural pause (1.115 s, step 2). Rule B's real fragment0 (sentences 0-1, 11.448 s) contains that pause but fails the "<8 s, so rule A's +4 s stays under 15 s" safety margin (11.448+4 = 15.448 s, over the clip max), so the sweep uses the two individual sentences flanking that boundary instead: sentence1 alone ("Waves crashed…night.", 6.06 s tight speech) and sentence2 (="Ropes were checked…fall." = fragment1, 7.023 s tight speech), both comfortably under 8 s. The base comparison (4.3) keeps the real rule-B grouping.

### Task 4.2 — assets generated

One real reasoning call (`gpt-6-astra`, needed a 60 s timeout override — the product's own 20 s decomposition limit timed out twice on 5 scenes with detailed instructions; **a real finding**, noted below and handed to JOS-136/JOS-165). 5 real Fal.ai images (fragment0-3, and "sentence1 alone" for the sweep — fragment1's image is reused for the sweep's second clip, since it's the same text as sentence2). 6 real RunningHub clips, submitted concurrently and polled together:

| Clip | Requested | Measured (ffprobe) | Cost |
|---|---|---|---|
| fragment0 | 11 s | 11.542 s | $0.847 |
| fragment1 | 8 s | 8.000 s | $0.616 |
| fragment2 | 14 s | 14.375 s | $1.078 |
| fragment3 | 13 s | 13.667 s | $1.001 |
| sweep-before (sentence1) | 15 s | 15.083 s | $1.155 |
| sweep-after (sentence2) | 15 s | 15.083 s | $1.155 |
| **Total** | | | **$5.852** |

Consistent with JOS-140's finding: none of the 6 clips came back at exactly the requested duration. A submission crashed on the first attempt (the image-id lookup bug below); task ids are now persisted to disk immediately on submission, so the retry resumed polling the 4 already-in-flight (already-paid-for) tasks instead of resubmitting them.

### Task 4.3 — base comparison

`assemble.sh` (JOS-182, commit `3989ae6`) run twice on the same 4 clips and the same voice-over (transcoded to AAC, `english-exclamation-paragraph-voiceover.m4a`, matching JOS-182's own fixture convention; drift from the source MP3 was 0.16 ms), once per rule's `intervals.json` — only the four scenes' `start`/`end`/`durationSeconds` differ between the two files; everything else (clips, voice-over, grouping) is identical, isolating the cut position per Decision 3.3.

| | Scene 1 | Scene 2 | Scene 3 | Scene 4 | Total |
|---|---|---|---|---|---|
| Rule A durations | 12.005 s | 7.627 s | 13.770 s | 12.852 s | 46.254 s |
| Rule B durations | 11.448 s | 7.882 s | 13.770 s | 13.154 s | 46.254 s |
| Rule A rendered (actual) | 12.000000 s | 7.633008 s | 13.766016 s | 12.866016 s | 46.265040 s |
| Rule B rendered (actual) | 11.433008 s | 7.900000 s | 13.766016 s | 13.166016 s | 46.265040 s |

Both renders' actual total (46.265040 s) matches the MP3's 46.254 s within 11 ms (a third of a frame at 30 fps) — `assemble.sh`'s own frame-accounting (Decision 4) at work, not a defect. Rule A's first cut (12.000 s) lands 0.567 s later than rule B's (11.433 s), exactly reflecting rule A absorbing the pause into the preceding scene. Files: `work/base-comparison-rule-A.mp4`, `work/base-comparison-rule-B.mp4` (20.1 MB, 20.06 MB).

### Task 4.4 — threshold sweep

Isolated two-scene snippets, not the full narration. For each of 5 target pause lengths, `scripts/sweep.ts` built a swept audio track (sentence1's real speech, digital silence of the target length, sentence2's real speech) and, for each rule, trimmed the two 15 s source clips (never retimed — a straight `-t` cut after the same `scale`/`fps` normalisation `assemble.sh` uses) to that rule's scene durations, so every sweep render plays at exactly 1.0×:

| Pause | Rule A scene1 / scene2 | Rule B scene1 / scene2 | Rendered (both) |
|---|---|---|---|
| 1 s | 7.060 s / 7.023 s | 6.560 s / 7.523 s | 14.1 s |
| 1.5 s | 7.560 s / 7.023 s | 6.810 s / 7.773 s | 14.6 / 14.567 s |
| 2 s | 8.060 s / 7.023 s | 7.060 s / 8.023 s | 15.1 s |
| 3 s | 9.060 s / 7.023 s | 7.560 s / 8.523 s | 16.1 s |
| 4 s | 10.060 s / 7.023 s | 8.060 s / 9.023 s | 17.1 s |

Confirms the derivation in design Decision 1: under rule A, only the preceding scene (scene1) grows with the pause length; scene2 stays fixed at its own 7.023 s regardless. Under rule B, both grow, each by half the pause. 10 files: `work/sweep-{1,1.5,2,3,4}s-rule-{A,B}.mp4` (11.5-14.3 MB each).

## Task 4.5 — checks

- **Duration:** every render's measured duration matches its expected total within one encoded frame (≤ 1/30 s), consistent with `assemble.sh`'s own stated ±1-frame tolerance (JOS-182's ADR, Decision 4).
- **Audio is the voice-over/constructed track only:** every clip's own audio was excluded at the input stage (`-map 0:v:0`, base comparison) or never muxed in (`-an`, sweep trims); `ffprobe` on 4 sample files (both base comparisons, two sweep renders) shows exactly one H.264 video stream (1920×1080, 30 fps) and one AAC audio stream each — no extra streams, no leftover clip audio.
- **Scene changes fall at the expected boundary:** the base comparison's per-scene actual durations (above) cumulatively sum to each rule's own target boundaries; rule A's cut is later than rule B's by the expected amount at every boundary this render exercises.

## Real finding: the reasoning provider's default timeout is tight for 5 scenes

`createOpenAiVisualInstructionGenerator()` with its production default (`PER_PHASE_MAX_TIME_SECONDS.decomposition`, 20 s) timed out twice in a row on this real call (5 scenes, detailed cinematic instructions requested). A 60 s override succeeded. This is a POC-only override — no product code or constant was changed — but it is real evidence that 20 s may be tight once a narration produces several scenes in one decomposition call, worth a decision on JOS-165/JOS-136's side (not this change's to fix).

## Spend

$5.852 (RunningHub), 5 Fal.ai images, 1 reasoning call, all within the ~$6 estimate and the $8 ceiling from the proposal.

## Files for the product owner (step 5)

- `work/base-comparison-rule-A.mp4`, `work/base-comparison-rule-B.mp4` — the same real narration and clips, only the cut position differs.
- `work/sweep-{1,1.5,2,3,4}s-rule-{A,B}.mp4` — 10 isolated two-scene renders at increasing pause length, each rule.

## Task 5.1 — Agent's recommendation, written before sharing anything

**I have not watched these renders** — I have no visual/audio perception of the produced files; everything above is measured (ffprobe, cumulative arithmetic), not judged. The recommendation below is reasoned from the *mechanism*, offered so it can be compared with your verdict, not a substitute for watching them.

**Recommendation: rule A (the previous scene absorbs the silence).**

Reasoning: under rule B (today's interim rule), the next scene's image appears while its narration hasn't started yet — up to half the pause length before the words that describe it are heard. Under rule A, the cut happens exactly when the next sentence's speech starts, so the image and the words it illustrates always begin together. For a narrated-slideshow format (not a documentary with a deliberate J-cut), "the picture changes when the new sentence begins" is the tighter, more conventional association, and the risk under rule B grows with the pause length — at the sweep's 4 s step, rule B's cut happens up to 2 s before the matching narration starts, which seems more likely to read as premature.

Caveat: this is a structural argument, not a viewing. The threshold question in particular (how long a single clip can hold silence before it feels dead) is not something I can estimate from durations alone — I have no basis for a number there, and none is offered.

## Task 5.2 — sent to the product owner

Files sent: `base-comparison-rule-A.mp4`, `base-comparison-rule-B.mp4`, and the 10 sweep files. Sheet: this report's task 4.3/4.4 tables (which file is which rule, and which pause length).

Questions asked (design Decision 4):
1. Which rule reads better at natural pauses (the two base-comparison files)?
2. From which swept pause length does a single clip holding the silence stop being acceptable, under the preferred rule (the 10 sweep files)?
3. Is anything else wrong?

## Task 5.3 — the verdict, verbatim (product owner, 2026-09-29)

> Rule A reads better at natural pauses

> 2 seconds feels fine, 3 seconds starts dragging, but maybe we should add a manual dial, like if the user feels that is dragging already at 2 seconds he can reduce it or increase the length and regenerate the asset.

**Decision: rule A**, matching the agent's recommendation (task 5.1). **Threshold: comfortable up to 2 s; 3 s starts dragging** — the acceptable range this change records is silence held by a single clip up to 2 s.

**Something else, raised:** a manual dial letting the user shorten or lengthen a scene that feels like it's dragging and regenerate its clip. This is a user-facing capability, not part of the automatic D11 rule; scoped by product-owner decision (2026-09-29, "New backlog item") as its own ticket, filed as **JOS-190**, not designed or built as part of this change. It does not block D11's closure (task 5.4 below).

## Task 5.4 — checking the threshold against the survey

Design Decision 5: a third rule is only proposed if a real surveyed pause exceeds the accepted threshold. Step 2's pause survey (4 real narrations, native and forced-alignment, 48 pauses) measured **0.04-1.26 s**, with the single longest pause at 1.26 s (forced-alignment shape). **1.26 s is comfortably under the 2 s threshold** — no surveyed pause exceeds it, so per Decision 5's first scenario ("every real pause is below the threshold"), **no third rule is needed**. D11 closes with rule A alone.
