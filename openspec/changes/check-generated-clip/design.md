## Context

- **Image check today** (`imageOutputCheck.ts`, used at `orchestrator.ts:1518`): dimensions are measured from the stored bytes, never from provider metadata. A failed check is recorded as a `transient_failure` and goes through `applyFailureOutcome`, so the image is retried within its budget.
- **Clip today** (`pollVideoRequestOnce`, `orchestrator.ts:995-1045`): after the poll succeeds and the clip is downloaded, `isMp4` checks only bytes 4-8 for `ftyp`. Then the clip is written once as `${sceneFileStem}.mp4` and the scene completes.
  - The store is write-once and a retry writes the same name, so a bad clip that were stored first would block its own retry (`ArtefactAlreadyExistsError` is read as a duplicate success). The check must run **before** the write.
- **ffprobe today:** `FFPROBE` (`config/ffmpeg.ts`) is resolved from `FFPROBE_PATH`, Homebrew or `PATH`; the packaged app's launcher maps it to the bundled binary. `voiceOverPhase.ts` `probeAudio` writes the bytes to a temp folder, probes them, and deletes the folder; ENOENT means ffprobe is missing and is not retryable. CI installs ffmpeg.
- **Real clips** (46 RunningHub clips from the run of 2026-10-29, measured read-only):
  - all H.264, **2528×1440** at 24 fps, though `2K` (2560×1440) was requested. That is 1.25% off 16:9, so the image's ±1% rule would reject every one;
  - each lasts **0 to +0.667 s longer** than requested, never shorter; a 15 s request came back as 15.084 s.
- **The stub video provider** returns a 12-byte `ftyp` header in `bootstrap.ts`, and about 20 test files deliver similar placeholder bytes through the video stage.
- **The packaged smoke stubs** (`packaging/smokeStubs.ts`) already make a real clip with ffmpeg, but a **1 s** one at 1920×1088. A 1 s clip fails the duration rule, since every request is at least 5 s.

## Goals / Non-Goals

**Goals:**
- A clip is measured from its own bytes before it is stored; a broken or wrong clip fails at its scene, on `video` (AC1, AC2).
- A clip that passes changes nothing (AC3).
- The check uses the shipped ffprobe, so it works in the packaged app on macOS and Windows (AC4).

**Non-Goals:**
- Checking content (what the clip shows). Only the file, the stream, the size and the duration.
- The profile trial run. It reuses `checkClip` in its own story.
- Changing assembly, which still rescales each clip to the output size and speed-adjusts it to its interval.

## Decisions

### 1. The rules (product owner, 2026-11-05)

A clip is accepted only if all of these hold, in this order (the first that fails is the reason):

| Rule | Reason when it fails |
|---|---|
| ffprobe reads it as an MP4 (`format_name` includes `mp4`) | "the generated clip is not an MP4 file that can be read" |
| it has a video stream whose first frame decodes | "the generated clip has no video that can be decoded" |
| width ≥ 1920, height ≥ 1080, width > height | "the generated clip is 1280x720; a clip must be horizontal and at least 1920x1080" |
| requested − 0.5 s ≤ duration ≤ requested + 1 s | "the generated clip lasts 6.0 s, but 10 s was requested" |

- **Size:** no aspect-ratio tolerance, so the real 2528×1440 clips pass, while portrait and low-resolution clips, which assembly would distort or upscale, are refused.
- **Duration:** measured as the container's `format.duration`. The margin covers every real clip (0 to +0.667 s) and catches a truncated clip, which would otherwise be stretched beyond the speed factor the User was shown.
- **Alternatives rejected:** the image's ±1% 16:9 rule (rejects every real clip); the admitted 5-15 s range (rejects a 15.084 s answer to a 15 s request); "any duration above zero" (lets truncated clips through).

### 2. One ffprobe call, from a temp file

- `backend/src/clipOutputCheck.ts` exports:
  - `judgeClip(measure, requestedSeconds)`: pure, applies Decision 1;
  - `checkClip(bytes, requestedSeconds)`: writes the bytes to a temp folder, probes them, judges them, deletes the folder.
- The probe is `ffprobe -v error -select_streams v:0 -read_intervals %+#1 -count_frames -show_entries stream=codec_type,width,height,nb_read_frames:format=format_name,duration -of json <file>`.
  - `-count_frames` with `-read_intervals %+#1` decodes only the first frame: `nb_read_frames` of 1 proves the video decodes, without decoding the whole clip.
  - Checked on a real clip (1 frame read, 2528×1440, 13.667 s) and on its first 20 kB (ffprobe fails: "moov atom not found").
- A temp file, not a pipe: an MP4 whose index (`moov`) is at the end needs a seekable input.
- ffprobe missing (ENOENT) → `{ ok: false, unavailable: true }`, as `probeAudio` does.

### 3. Where it runs, and what a failure does

- In `pollVideoRequestOnce`, in place of `isMp4`, before `writeArtefactOnce`. `isMp4` is removed.
- A failed check: `insertProviderRequest(..., "transient_failure", ...)`, then `applyVideoFailureOutcome` with `failed_transient` and the reason, the same as a failed download. So it retries within the video budget and fails the scene at `video` when the budget runs out (AC2).
- ffprobe missing: `failed_not_retryable` with "ffprobe is not installed, so the clip could not be checked". A retry could not succeed.
- The requested duration is the scene's stored `requestedDurationSeconds`. A clip is never launched without one (`orchestrator.ts:1074`).

### 4. Tests and stubs: a replaceable check, and a real stub clip

- `orchestrator.ts` calls the check through `setClipCheck(fn)`, defaulting to `checkClip`. `test/setup.ts` installs an accepting check before each test, as it installs stub providers, so the tests that deliver placeholder bytes keep testing what they test. A test about the check installs the real one.
- New tests make real clips with ffmpeg (`-f lavfi -i color=black:s=<w>x<h>:d=<s>:r=1`, a few kB each), cached per shape in the test.
- **The stub video provider** gets a `clipFor(durationSeconds)` option. One helper, `stubClipMaker(ffmpegPath, folder)`, makes a 1920×1080 clip with ffmpeg at the requested duration, cached per duration in that folder. `bootstrap.ts` and `packaging/smokeStubs.ts` both use it, so every stubbed run goes through the real check: the E14 workflow tests, manual testing and the packaged smoke test. They already need ffmpeg for assembly or ship it.
- **Alternative rejected:** skipping the check for `stub-` providers. It is less code, but a fully stubbed run would no longer prove the check works.

## Risks / Trade-offs

- [ffprobe time per clip] → one probe of the header and one frame: tens of milliseconds next to a clip that takes minutes.
- [A provider changes its clip shape] → a wrong-shape clip now fails and retries, and each retry is billed. The rules are deliberately loose around what the vendor delivers (Decision 1); the reason names the measured value, so a systematic change is visible at once.
- [Most orchestrator tests use the accepting check] → the check is covered by its own tests plus one orchestrator test with the real check and a real clip, and by the E14 workflow tests, which use the real check end to end.
