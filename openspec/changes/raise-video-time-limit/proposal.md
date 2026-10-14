# Raise the per-phase time limits for real script sizes

Linear-Issue: JOS-197

## Why

The per-phase maximum times (PRD §11.3, JOS-165) were measured from small samples (a 142-character script, 4-7 calls per stage). A real script is 1,500-1,800 words, an 8-12 minute narration and 30-50 scene chunks. Measured on 2026-10-13/14 with the product's real providers: one 5 s clip at 2K takes 344 s against a 240 s video limit (JOS-196); the voice-over of 10,217 characters (1,740 words, about 12.8 minutes) took 151 s against a 10 s limit; decomposing 67 fragments took 208.6 s against a 20 s limit (11 fragments: 75 s). A timed-out request is retried, each retry submits another billable request, and the decomposition fails every time. The first full run of the retried session confirmed it for video: clips of 7-13 s took 394-546 s, but the three 14 s clips timed out at 607-610 s three times each, and the extra billable tasks ran the RunningHub balance out (error 605). The product owner asked to extend the limits (2026-10-14).

## What Changes

- The video limit goes from 240 s to 1200 s, the voice limit from 10 s to 600 s and the decomposition limit from 20 s to 600 s (observed: video 344-546 s for 5-13 s clips and above 610 s for three 14 s clips, voice 151 s, decomposition 208.6 s; margins 2x on the longest admitted clip, 4x and 2.9x). Image (25 s) and alignment (5 s) are unchanged: the image calls ran in about 10 s and alignment is only used when native timestamps are unusable. All three stay provisional until a full-size real session has produced timings.
- PRD §11.3's "Per-phase maximum times" row records `Voice 600s`, `Reasoning 600s` and `Video 1200s`, as PRD v1.8 (previous copy `docs/PRD-v1.7.md`, changelog row).
- `docs/adr/0005-provider-selection.md` records the new value.
- The configuration test compares the constants with the **current** `docs/PRD.md`; it reads the frozen `PRD-v1.4.md` today and would pin 240 s forever.

## Capabilities

### New Capabilities
- `video-stage-time-limit`: how long a clip request may take before it counts as timed out, and that a clip inside the limit is neither failed nor retried.

### Modified Capabilities
<!-- None: no existing spec states the number; `stage-execution-time-limit` takes it from the constant. -->

## Impact

- **Backend:** `backend/src/config/providers.ts` (the constant and its comment); `backend/test/providerConfig.test.ts`, `backend/test/attempt-deadline.test.ts` (reads the constant, no change expected).
- **Docs:** `docs/PRD.md` v1.8, `docs/PRD-v1.7.md`, `docs/adr/0005-provider-selection.md`.
- **Stacking:** this branch is based on `feature/jos-194-production-deployment`, because PRD v1.8 continues from that branch's v1.7; its PR follows JOS-194's.
- **Out of scope:** retry timing, the failure reason stored on the provider request row, assembly's limit (still provisional), the adapter's shapes (JOS-196).
