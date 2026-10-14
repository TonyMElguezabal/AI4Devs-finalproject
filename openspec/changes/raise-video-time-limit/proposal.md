# Raise the video stage time limit

Linear-Issue: JOS-197

## Why

With the RunningHub adapter fixed (JOS-196), one real 5-second clip at the configured 2K resolution took 344 s to generate. The video stage's maximum time is 240 s (PRD §11.3, recorded by JOS-165 from 4-7 samples of 141-159 s), so a normal clip is timed out and retried, and every retry submits another billable task. A real session would multiply its spend and probably fail. The product owner chose to raise the limit (2026-10-14).

## What Changes

- The video stage's maximum time goes from 240 s to 600 s (the observed 344 s plus margin), provisional until a real session has produced 10 or more clips.
- PRD §11.3's "Per-phase maximum times" row records `Video 600s`, as PRD v1.8 (previous copy `docs/PRD-v1.7.md`, changelog row).
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
