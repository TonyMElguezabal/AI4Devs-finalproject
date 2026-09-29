# Design — Decide how narration silences are allocated to scenes (JOS-142, D11)

## Context

PRD §7.3 requires the scenes' narration intervals to be contiguous and non-overlapping, and to cover the voice-over from 0 s to the MP3's full duration. D11 leaves open which scene a silence belongs to, with two candidates. §14.1 asks for both to be compared on representative scripts, for the longest silence a single clip can sustain acceptably, and for the chosen rule to keep the partition, the §6.1 bounds and the speed-factor limit.

What exists today (`feature/entrega-2-JAME`):

- **Timestamps (JOS-139).** Two shapes, depending on the mechanism. Native ElevenLabs timestamps start at 0 and end at the audio's end, but the pause between two sentences still appears between their spoken characters (whitespace carries it). JOS-140's manual test measured 0.5-0.8 s. Forced alignment starts at about 0.10 s, ends 0.3-0.4 s early, and leaves gaps of up to 1.08 s on a 57 s clip.
- **Units and boundaries (JOS-140/141).** Segmentation works on units: whole sentences, or clause pieces of sentences that must split. A unit's speech span runs from its first to its last spoken character. `unitBoundaries` (`backend/src/sentenceTimings.ts`) turns the spans into n + 1 boundaries: 0, one boundary per adjacent pair, and the MP3's duration. It is the one function segmentation uses to measure every fragment and, per the JOS-143 hand-off, the one intervals must reuse. Today it puts each inner boundary at the midpoint of the pause, which is JOS-140's interim rule and candidate B below.
- **Assembly (JOS-182, Done, PR #3 not merged).** `assemble.sh` renders an MP4 from `intervals.json`, the clips and the voice-over. It retimes video only, carries frame accounting forward, and normalises to 1920×1080 at 30 fps. Its ADR recommends a speed-factor limit of 0.5× (slow-down floor) to 2.0× (speed-up ceiling). The factor is source duration ÷ interval duration.
- **Clips (JOS-140's manual test).** RunningHub returns clips at 1344×768 and 24 fps, a little longer than requested (11 s gave 11.54 s). It costs about $0.077 per requested second and takes 3-7 minutes per clip.

## Goals / Non-Goals

**Goals:**
- A closed D11: one precisely stated rule, a stated silence threshold, and the PRD, ADR and code changed to match.
- A decision made on evidence the product owner has seen and judged, not on the agent's taste. "Visually acceptable" is a human call (§14.1), exactly as JOS-182's Decision 6 treated its own perceptual threshold.

**Non-Goals:**
- Storing intervals per scene (JOS-143), assembling the final video (JOS-149), speed-factor warnings (JOS-148), fixing the limit constant (US-33), and merging PR #3.

## Decisions

**Decision 1 — The two candidates, stated as boundary formulas.**
For units 1..n with speech spans [sᵢ, eᵢ] and MP3 duration D, every rule sets b₀ = 0 and bₙ = D. Scene 1 therefore always holds the leading silence and scene n the trailing silence. The candidates differ only on the inner boundaries:
- **Rule A — the previous scene absorbs the silence that follows it:** bᵢ = sᵢ₊₁. The cut lands exactly when the next unit's speech starts.
- **Rule B — the silence is split between the adjacent scenes:** bᵢ = (eᵢ + sᵢ₊₁) / 2. The cut lands mid-pause, so the next scene's image appears before its words are heard. This is the interim rule shipped in JOS-140.

Inside a fragment the rule has no visible effect, because a fragment's pauses are inside its own interval under either rule. It only matters at the boundary between two fragments. It still has to be applied at unit level, because segmentation measures candidate fragments from unit boundaries before it knows where the fragment edges will fall.
*Not a candidate:* the next scene absorbing the preceding silence (bᵢ = eᵢ). It is not in D11. It stays available as a third rule if the threshold sweep calls for one.

**Decision 2 — One function, whatever is adopted.**
The adopted rule replaces the body of `unitBoundaries` and nothing else, so segmentation and intervals cannot disagree. The POC does not touch product code. Its scripts carry both formulas as a parameter and call the real `findSentences`, `buildUnits`, `sentenceSpeechSpans` and grouping code with each one, so the numbers come from the real pipeline.

**Decision 3 — Four pieces of evidence, cheapest first.**
1. **Pause survey.** Four scripts (two English, two Spanish, 600-900 characters each) are narrated for real with native timestamps. Between them they contain sentence ends (`.`, `?`, `!`), commas, a paragraph break (blank line), an ellipsis and a dash. Forced alignment is also run on the same MP3s, giving 4 narrations × 2 shapes. For every inner unit boundary the POC records the pause length and what caused it. This defines "representative pauses" and the longest pause real narration produces.
2. **Numeric comparison.** For each narration × shape × rule, the POC reports: the fragments; their narrated durations; the admitted duration each would request (§7.2); the speed factor both ways; fragments outside the §6.1 bounds; whether a valid grouping exists at all; and a partition check (contiguous, from 0 to D). It also reports where the two rules' groupings differ.
3. **Rendered comparison.** One English narration of about 60 s, the survey script with the longest natural pause, is segmented under rule B. Each fragment gets its real IMAGE and VIDEO instructions (real `gpt-6-astra` call), one real Fal.ai image and one real RunningHub clip at its admitted duration. The same clips are then assembled twice with `assemble.sh`, once with each rule's intervals for the same fragments. Keeping one grouping isolates what the rule changes on screen, which is where the cut falls. Grouping differences are covered numerically in (2).
4. **Threshold sweep.** At one fragment boundary, copies of the MP3 get that pause lengthened to 1, 1.5, 2, 3 and 4 s, with ffmpeg inserting silence and later timestamps shifted accordingly. Each copy is rendered under both rules. The two clips on either side of that boundary are requested at 15 s and cut to each render's interval, so every sweep clip plays at 1.0×. That keeps slow-down judder, which is JOS-182's subject, from contaminating a judgement about silence. The same two clips are cut to their admitted duration for comparison (3). The sweep stops at 4 s so the longest rule-A interval stays under the 15 s clip.

Spend: about 6 images, one instruction call, about 60 s of clips plus the headroom on the two 15 s sweep clips. That is about $6 of RunningHub, with a ceiling of $8. The four survey narrations and the 60 s one draw on the ElevenLabs quota.

**Decision 4 — The product owner judges; the agent prepares and records.**
The renders go to the product owner as MP4 files (Decision 3's comparison, plus the sweep pairs), with a one-page sheet listing which file is which rule and which pause length. The product owner answers three questions, recorded verbatim in the report:
- Which rule reads better at natural pauses?
- From which swept pause length does a single clip holding the silence stop being acceptable, under the preferred rule?
- Is anything else wrong?
The agent's recommendation is written before the renders are sent, so the verdict can be compared with it, but the product owner decides.

**Decision 5 — The threshold decides whether a third rule exists.**
If every pause measured in the survey, paragraph breaks included, is below the acceptable threshold, the adopted rule stands alone and the threshold is recorded as the evidence for that. If some real pause exceeds it, the POC proposes a third rule for pauses above the threshold. Examples: split only the excess beyond the threshold, or hand it to the following scene. The proposal goes back to the product owner before D11 closes. It is not adopted silently.

**Decision 6 — The bounds and the limit are checked, not assumed.**
Because segmentation measures fragments with the same boundaries, §6.1's bounds hold under either rule by construction, except the two flagged exceptions. The comparison still checks them, and checks something construction does not guarantee: that a rule does not leave a real narration with no valid grouping. Every speed factor of an unflagged fragment must lie within JOS-182's 0.5×-2.0×. The flagged exceptions (`script-below-lower-bound`, `unsplittable-sentence`) are reported separately, because they already carry a speed-factor warning by design (§6.1.1).

**Decision 7 — Code follows the decision, tests first.**
- **Rule A adopted.** Failing tests in `sentence-timings.test.ts` first: boundaries at the next unit's speech start, 0 and D at the ends, the partition, and zero-pause units giving the same result as rule B. Then `unitBoundaries` changes, and the segmentation and decomposition tests are re-run. JOS-140's synthetic narrations have no pauses, so they should not move. Any test that does is reviewed, not bulk-updated.
- **Rule B adopted.** The code stays as it is. "Interim" disappears from the comments in `sentenceTimings.ts` and `segmentation.ts`, and one test pins the adopted behaviour by name.

**Decision 8 — Where the POC lives.**
POC scripts are committed under this change's `scripts/`, as JOS-182 did. Everything they produce (MP3s, JSON, clips, renders) goes to a git-ignored `work/`, regenerable from the scripts and the recorded provider responses. Findings go in the step reports, and the decision in an ADR. That ADR takes the next free number after accounting for JOS-182's `0005-media-assembly.md`, which collides with `0005-provider-selection.md` on this branch.

**Decision 9 — The PRD moves to v1.5.**
v1.4 is kept as `docs/PRD-v1.4.md`, as v1.3 was. The v1.5 changes:
- §7.3 states the rule, the threshold and the leading and trailing silence.
- AC12's "sincronizado" gains its concrete meaning: each scene change falls at the adopted boundary.
- AC19 names the rule.
- D11 is marked closed.
- §14.1 is marked done.
- §16 lists the change.
- §11.3's speed-factor row points to JOS-182's recommendation, still to be fixed by US-33.

## Risks / Trade-offs

- **[One narration's renders stand for all content]** → The survey (Decision 3.1) checks that its pauses are typical. The numeric comparison covers four narrations in two shapes.
- **[The sweep's 1.0× clips differ from production, which retimes by up to about ±10%]** → That is deliberate, so silence is judged apart from speed change. The base comparison (3.3) uses production-style retiming.
- **[RunningHub is slow and can fail]** → Clips are generated once and kept in `work/`, and a failed clip is retried within the $8 ceiling. If the ceiling is reached, the POC stops and reports instead of spending more.
- **[The provider's clips are 1344×768 at 24 fps]** → `assemble.sh` normalises them, as JOS-182 proved. The renders are what the product will produce.
- **[PR #3 is not merged]** → `assemble.sh` is read from `origin/feature/jos-182-define-media-assembly` at a recorded commit and copied into `work/`, not vendored into this change.
- **[Changing to rule A shifts every real fragment's measured duration by up to about half a pause]** → The numeric comparison shows the effect on groupings before any code changes.

## Migration Plan

No schema or data change. If rule A is adopted, sessions already decomposed keep the fragments they were registered with, because chunks are locked (JOS-144), and only new decompositions use the new boundaries. Rollback: revert the `unitBoundaries` commit.

## Open Questions

None blocking. Whether a third rule is needed is answered by the sweep (Decision 5).
