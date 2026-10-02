# Generate a chunk's video clip

## Why

`generate-chunk-image` leaves every chunk with a stored image and nothing that animates it. Without this story a chunk can reach `image-complete` and go no further: it never reaches `chunk-complete`, so assembly (which requires every chunk complete, §7.3) never becomes possible. This is also where two of the PRD's most specific numeric rules become real: the "closest admitted duration by smallest speed change, ties to the longer" selection rule (§7.2, AC06), and the speed-factor recording and warning that AC23 requires every scene to expose.

## What Changes

- Launch video generation for each chunk once it reaches `image-complete`, through the same shared phase-launch gate as `generate-chunk-image` and `generate-voice-over`.
- Select the requested duration from the video provider's hardcoded discrete set: the admitted duration requiring the smallest speed change (acceleration or deceleration ratio) to match the chunk's narrated duration — not the smallest difference in seconds — with an exact tie going to the longer duration; when the narrated interval is below the smallest admitted duration, request that smallest duration (§7.2, AC06).
- Send the chunk's already-generated image, its `VIDEO` instruction, and the selected duration to the hardcoded video provider.
- Compute and persist the resulting `requested_duration_seconds` and `speed_factor` on the chunk, and set `speed_factor_warning` when the factor exceeds the hardcoded acceptable limit — a diagnosable warning, not a failure (§7.2, AC23). These fields already exist on `Chunk` per `readme.md` §3; this story is what fills them.
- Persist the result in the session's project folder, resolving a temporary link to a local file before the stage can succeed (§12.2, D05).
- Transition the chunk `image-complete → video-generating → chunk-complete` — the scene's final state — or `failed` when the stage's retry budget is exhausted, preserving the already-successful image (no image regeneration on a video retry, §10.3).
- Offer the video-correction path §10.3/AC09 grants: on a failed video stage, retry with the same `VIDEO` instruction or replace only `VIDEO` and retry, preserving `IMAGE`, `ID`, `PROMPT`, and scene order.
- Let other chunks continue independently of one chunk's video failure (§10.2, AC10), and offer a completed clip for individual download while other chunks are still processing or failed (§12.3, AC16).
- Record the stage's provider, attempts, status and cause in a `StageExecution` row (`owner_type = chunk`, `stage_name = video`).

## Capabilities

### New Capabilities

- `chunk-video-generation`: turning a chunk's completed image and `VIDEO` instruction into a stored clip — the duration-selection rule, the speed-factor bookkeeping it produces, how the result is persisted, the one correction path a failed video stage allows, and how a chunk's failure leaves its siblings unaffected.

### Modified Capabilities

None. `openspec/specs/` is still empty; `chunk-image-generation`, `stage-retry-policy` and `stage-execution-time-limit` are consumed, not modified.

## Impact

- **Blocked on the same three stack spikes as every sibling story**: `define-backend-stack`, `define-frontend-stack`, `define-persistence`.
- **Depends on `generate-chunk-image`** for the `image-complete` precondition and the stored image this story sends to the video provider.
- **Depends on `define-provider-configuration`** for the video provider's identity, its hardcoded discrete admitted-durations set and maximum, and the hardcoded acceptable speed-factor limit.
- **Reuses, without modification, `bounded-retry-policy` and `stage-execution-time-limit`** for the `video` stage instance, and the shared phase-launch gate.
- **Data model**: fills `Chunk.video_result_path`, `requested_duration_seconds`, `speed_factor`, `speed_factor_warning` (already present per `readme.md` §3), and introduces one `StageExecution` row per chunk (`stage_name = video`).
- **Downstream**: unblocks final assembly, which requires every chunk in `chunk-complete` (§7.3).
- **The duration-selection function (closest-by-speed-change, tie to longer) is the one piece of pure, provider-independent logic this story owns** — worth isolating and testing on its own, since AC06's "closest" definition is easy to misimplement as "fewest seconds of difference."
