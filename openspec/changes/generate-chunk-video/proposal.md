# Generate the clip of each scene

Linear-Issue: JOS-146 (US-13)

## Why

Once the image stage (JOS-145, US-12) leaves a chunk in `image-complete` with a stored image, nothing animates it. Without this story no chunk can reach `chunk-complete`, which is the scene's final state (§8.2), so assembly (JOS-149) can never start. §7.1 also sets a hard precondition: a clip is never requested without an available image.

The backend skeleton models a single generic stage named `image`. JOS-145 turns it into the real image stage ending in `image-complete`. This story adds the second, real stage: it sends the stored image and the `VIDEO` instruction to the recorded video provider (RunningHub, MiniMax Hailuo-H3 image-to-video, PRD §11.3), stores the returned clip, and ends in `chunk-complete`.

## What Changes

- **AC1 — No clip without an image:** the video stage starts only from `image-complete`, and only when the chunk's stored image file can be read. A chunk in any other state, or whose image file is missing, sends no request. A missing image file is recorded as a not-retryable video-stage failure, because §11.2 forbids regenerating a completed image.
- **AC2 — Launch and request:** a chunk that reaches `image-complete` starts clip generation without User action, through the same phase-launch gate as the image stage (concurrency slot plus the session pause). The chunk is `video-generating` before the provider request is sent. The request carries the chunk's stored image, its `VIDEO` instruction, and the requested duration JOS-147 (US-14) stored with the chunk.
- **AC3 — Completion:** a clip returned by the provider is downloaded into the session's project folder before the stage succeeds (§12.2: no expiring links). A clip that cannot be downloaded or is not an MP4 file counts as a failed attempt. A stored clip moves the chunk to `chunk-complete`.
- **AC4 — Provider binding:** the first attempt of a chunk's video stage binds the video provider to that chunk and stage (§11.2). Every later automatic retry of the video stage uses the bound provider, even if the hardcoded provider changes in a later build.
- **Failures are attributed to the video stage:** a chunk that fails while generating its clip reports `affectedStage: "video"` (§8.2: a failure keeps the stage it affected). Its image stays as it is. Automatic retries of a transient failure repeat the video stage, never the image stage.
- **Manual retry and correction after a clip failure are refused** until JOS-158 (US-26) implements them. Today's manual retry restarts a chunk from `submitted`, which would regenerate a completed image. Refusing it keeps §11.2 intact until JOS-158 lands.
- **Restart safety:** a clip still generating when the application stops is resumed by polling the provider on boot, with the rules the skeleton already applies to the image stage (§12.1).

## Out of Scope (owned by other tickets)

- Choosing the requested duration (closest admitted duration, the tie rule, the maximum): **JOS-147 (US-14)**. This story reads the stored duration and sends it unchanged.
- Recording and showing the requested duration and the speed-adjustment factor, and the factor warning: **JOS-148 (US-15)**.
- Manual retry and `VIDEO` correction after a clip failure: **JOS-158 (US-26)**.
- Downloading an individual clip during processing (§12.3): **JOS-163 (US-31)**.
- Showing provider and attempts per stage in the UI: **JOS-166 (US-34)**.
- The real retry budget, per-phase time limit and per-stage concurrency cap: **JOS-184 / JOS-154**, **JOS-185**, **JOS-167**. This story calls the skeleton versions of those mechanisms and does not re-implement them.
- Assembly and deriving `final-video` only when a final MP4 exists: **JOS-149 (US-16)** and **JOS-150 (US-17)**.

## Capabilities

### New Capabilities

- `chunk-video-generation`: turning a chunk's stored image and `VIDEO` instruction into a stored clip. Covers the image precondition, when generation launches, what the request carries, how the result is persisted, how failures are attributed to the video stage, how the provider is bound to the chunk's video stage, and how an interrupted clip resumes.

### Modified Capabilities

None. The archived foundations are consumed as they are, and `chunk-image-generation` (JOS-145) is not archived yet. The skeleton's single stage is implementation, not a spec requirement.

## Impact

- **Depends on:**
  - JOS-145 (US-12) for `image-complete`, the stored image and the provider-binding pattern;
  - JOS-147 (US-14) for the requested duration;
  - through JOS-147, JOS-143 (US-10) for the narration interval;
  - JOS-165 (US-33, done) for the provider endpoint, the `2K` generation setting and the 240 s phase limit.

  Implementation starts only after the gate confirms these have landed.
- **Backend:** a `VideoProvider` port with a RunningHub adapter (upload the image, submit, poll, download) and a stub adapter for tests. The orchestrator gets the `image-complete → video-generating → chunk-complete | failed` transitions, a per-stage attempt count, and restart reconciliation for `video-generating`.
- **Data model:** a migration adds the video stage's provider binding and clip path to `scenes`, a `stage` column to `provider_requests`, and a per-stage commit record for the clip. `docs/data-model.md` is updated to match.
- **API:** no new route and no new request field. `affectedStage` becomes correct for clip failures, and the retry and correction routes answer `409` for a clip failure. `docs/api-spec.yml` is regenerated.
- **Cost:** each real clip costs about $0.60 (5 s at `2K`) and takes about 2.5 minutes. Automated tests use the stub adapter only.
- **Downstream:** unblocks JOS-149 (assembly), JOS-148 (factor recording), JOS-158 (clip retry and correction) and JOS-163 (clip download).
