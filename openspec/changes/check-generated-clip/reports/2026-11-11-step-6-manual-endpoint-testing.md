# Step 6 report — manual endpoint testing with curl (JOS-265)

- Date: 2026-11-11
- Setup: `node src/server.ts` in `backend/` on a scratch store (`DB_PATH`, `PROJECTS_ROOT`, `SECRETS_PATH` and `SETTINGS_PATH` all in a scratch folder), env vars written literally, every stub on: `USE_STUB_SCRIPT_MODERATION=clean USE_STUB_VOICE_PROVIDER=success USE_STUB_DECOMPOSITION=success USE_STUB_IMAGE_PROVIDER=success USE_STUB_ASSEMBLY_TOOL=success`, and `USE_STUB_VIDEO_PROVIDER=success` (6.1) or `short-clip` (6.2). Ports 3105 and 3106; the app already running on 3100 was not touched.

## 6.1 A session reaches `final-video` through the real check

```
POST /sessions {"title":"Clip check good","script":"A calm sea tonight.","language":"en"}  -> session 01M75SYGP2E11M5JM2WAPMTG27
GET  /sessions/01M75SYGP2E11M5JM2WAPMTG27 (polled)
  state:  final-video
  scenes: [('chunk-complete', requested 5 s)]
  phases: voice-over complete, decomposition complete, scenes complete, assembly complete
project folder: final-video.mp4, scene-1.mp4, scene-1-attempt-1.png, voice-over.mp3, ...
ffprobe scene-1.mp4 -> 1920,1080  5.000000
```

The stub's clip is a real 1920x1080 clip of exactly the requested 5 s, and it passed the real clip check.

## 6.2 A short clip retries, then fails the scene at `video`

`short-clip` (added for this step, task 3.4) answers 3 s short of the request, never under 1 s.

```
POST /sessions {"title":"Clip check short",...}  -> session 01M75SZ9248NMFTR1QB2EE4M9T
GET  /sessions/01M75SZ9248NMFTR1QB2EE4M9T (polled until the scene failed)
  scene state:      failed
  affectedStage:    video
  requestedDurationSeconds: 5
  video attempts:   4   (1 attempt + 3 automatic retries)
  errorCause:       "the generated clip lasts 2.0 s, but 5 s was requested (video retry budget exhausted after 4 attempts)"
  assembly phase:   pending; no final video
project folder: scene-1-attempt-1.png, ... and no scene-1.mp4 (no refused clip was stored)
```

The scene was retried inside the video budget, failed at `video` with a reason written for a person, kept its image, and the session never assembled.
