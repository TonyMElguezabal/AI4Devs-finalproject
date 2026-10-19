# Step 9 — Derive the Remaining Values

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

Pure synthesis from steps 3-8's real measurements — no new provider calls in this group.

## 9.1 — Segmentation lower bound

**5 seconds** — the shortest duration RunningHub's Hailuo-H3 admitted and honored,
confirmed empirically in step 3 (5s requested → 5.17s output). Per §6.1, the lower bound
must be consistent with the video provider's shortest admitted duration; it now is, by
construction.

## 9.2 — Workability against §6.1.1 edge cases

- **Whole script below the bound**: becomes a single chunk, clip requested at the
  shortest admitted duration (5s) and sped up in assembly (§7.2) to fit the actual
  (shorter) narrated length. Workable — RunningHub's 5s minimum and the assembly
  pipeline's speed-adjustment mechanism (already required for every chunk, per §7.3)
  handle this without a special case.
- **Sentence that cannot be split**: clip requested at the maximum admitted duration
  (15s, also confirmed in step 3) and slowed down to fit, with a speed-factor warning
  recorded. Workable for the same reason — the mechanism already exists for the general
  case.

No blocking issue found; the derived bound is usable as-is.

## 9.3 — Output resolution and frame rate vs. D08

**Neither provider natively produces D08's target (1920×1080 @ 30fps)**:
- Video (RunningHub Hailuo-H3): `768P` → 1344×768@24fps; `2K` → 2560×1440@24fps (step 3)
- Image (Fal.ai `flux/dev`): 1920×1088 is the smallest 16-aligned size clearing the
  1920×1080 minimum (step 5b) — not exactly 1920×1080, and not exactly 16:9 either

**Fix, recorded as the actual derived decision** (not previously settled — this is where
it gets settled): generate at the **video 2K tier** (2560×1440@24fps) and the **image
1920×1088 setting**, both of which are ≥ the D08 target in every dimension, then let the
**assembly stage (§7.3, JOS-182) normalize down** to exactly 1920×1080@30fps — a
downscale + frame-rate conversion, not an upscale. This is the safer direction: shrinking
2560×1440→1920×1080 and 1344×768-avoiding by using 2K preserves quality; the reverse
(upscaling 1344×768 or interpolating up to hit 1080p) would not. **This is a direct,
concrete requirement to hand to `define-media-assembly` (JOS-182)**: its pipeline must
include a resize+fps-conversion step for every video chunk, not just speed-adjustment —
confirmed necessary here, not assumed.

## 9.4 — Speed-factor limit

Still **provisional**, per task 1.3's original recording: `define-media-assembly`
(JOS-182) remains unarchived (0/60 tasks) as of this session, so its Decision 5
measurement is not yet available. No change from the step-1 report's status.

## 9.5 — Cross-check for internal consistency

| Value | Source | Consistency check |
|---|---|---|
| Segmentation lower bound: 5s | Video provider min (step 3) | By construction, matches §6.1's requirement |
| Segmentation upper bound: 15s | Video provider max (step 3) | Used correctly in 9.2's edge-case check |
| Video generation setting: 2K tier | Step 3 + 9.3 | Chosen specifically so downscaling (not upscaling) meets D08 |
| Image generation setting: 1920×1088 | Step 5b + 9.3 | Chosen specifically so cropping/padding 8px (not upscaling) meets D08 |
| Final assembled resolution/fps: 1920×1080@30fps | D08, achieved via assembly normalization (9.3) | No contradiction with either generation setting — both feed it from above, not below |
| Language list: English, Spanish | Step 6 | Consistent across all three chain stages independently verified |
| Per-stage request caps: reasoning 50, image 200 (provisional), voice/alignment/video undetermined | Step 7c | No invented numbers; gaps are explicit, not silently filled |
| Per-phase max times: reasoning 20s, image 25s, voice 10s, alignment 5s, video 240s, assembly TBD | Step 8 | Video's 240s cap is far above every other stage's, consistent with its measured ~150s execution time being the pipeline's dominant cost |
| Spend: $5.605 of $20 | All steps | Well under Decision 10's ceiling |

**No contradiction found.** Every value is either grounded in a real measurement from
steps 3-8 or explicitly marked provisional/open with its dependency named — consistent
with Decision 1 (dependency order) and Decisions 6/7's requirement to record derivations,
not just results.
