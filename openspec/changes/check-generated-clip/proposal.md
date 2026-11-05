Linear-Issue: JOS-265

## Why

A generated image is measured from its own stored file before it completes its scene (JOS-145). A generated clip is not: the video stage only checks that the file starts with an MP4 `ftyp` header. A broken, truncated, portrait, low-resolution or wrong-length clip therefore completes its scene, and the problem only shows up when the final video fails to assemble, or comes out wrong, long after the scene could have been retried. JOS-265, epic JOS-261 (E18). The same check is what the profile trial run (a sibling story) will use for video.

## What Changes

- Every clip is checked from its own bytes with the ffprobe the app already ships for the voice-over check, before it is stored. It is accepted only if:
  - it is an MP4 that ffprobe can read, and its first video frame decodes;
  - it has a video stream that is horizontal and at least 1920×1080 (product owner decision, 2026-11-05);
  - its measured duration is between the requested duration minus 0.5 s and plus 1 s (product owner decision, 2026-11-05).
- A clip that fails is a transient failure of the video stage, as a failed image check is for the image stage. It is retried automatically within the video budget, and the scene fails at `video` when the budget runs out. The reason is written for a person (for example "the generated clip lasts 6.0 s, but 10 s was requested").
- A missing ffprobe is a not-retryable failure with its own reason, as for the voice-over.
- The `ftyp` header check is replaced by this check.
- The stub video provider returns a real clip, made with ffmpeg at the requested duration, so stubbed runs (E14 workflow tests, manual testing, the packaged smoke test) pass the real check. The packaged smoke stubs' 1 s clip, which the duration rule would refuse, uses the same helper.
- PRD §7.2 records the two clip rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chunk-video-generation`: a stored clip must pass the clip check; the "not an MP4" rule becomes part of it.

## Impact

- Backend: new `backend/src/clipOutputCheck.ts`; `orchestrator.ts` (the video stage's success path, plus a test hook to replace the check); `videoProvider.ts`, `bootstrap.ts` and `packaging/smokeStubs.ts` (the stub's real clip).
- Tests: `test/setup.ts` installs an accepting check, as it installs stub providers, so tests that deliver placeholder bytes keep working; new tests run the real check on clips made with ffmpeg (CI installs ffmpeg).
- Docs: PRD §7.2, `docs/backend-standards.md`.
- APIs, data model, frontend: none. A failed check uses the existing scene failure fields.
