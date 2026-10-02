# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-10-02
- Change: gate-assembly-on-complete-scenes (JOS-150)
- Agent: Claude Sonnet 5

## Setup (9.1)

The real server ran against a scratch store and projects folder in the session scratchpad, isolated from the default store:

```bash
DB_PATH=<scratchpad>/jos150-curl/scratch.sqlite PROJECTS_ROOT=<scratchpad>/jos150-curl/projects PORT=3150 node src/server.ts
curl -s http://127.0.0.1:3150/health
# {"ok":true}
```

Nothing in the running app calls `registerDecomposition` yet and no code produces `video-generating` or `chunk-complete` (JOS-146 is not implemented). As in JOS-148's step 9, chunks were registered by a small script (`prep.mjs`) that called `registerDecomposition` with a stub instruction generator and then set each scene's status directly in the scratch store the live server reads. Every read and download below went through the real HTTP routes.

## 9.2 - A failed scene beside a generating one

Session A, three scenes forced to `chunk-complete`, `failed`, `video-generating`:

```bash
curl -s http://127.0.0.1:3150/sessions/$A
# state: chunks-processing, failedPhase: absent, failedSceneIndexes: absent
```

The failed scene does not turn the session `failed` while scene 3 is still generating its clip.

## 9.3 - The generating scene completes

Scene 3 moved to `chunk-complete`:

```bash
curl -s http://127.0.0.1:3150/sessions/$A
# state: failed, failedPhase: "scenes", failedSceneIndexes: [2]
```

Downloads in the now-failed session:

| Request | Result |
|---|---|
| scene 1 image / video (`chunk-complete`) | 200 / 200 |
| scene 3 image / video (`chunk-complete`) | 200 / 200 |
| scene 2 image (`failed`) | 409 "scene image is not available in status 'failed'" |
| `download/final-video` | 409 "final video is not available in state 'failed'" |

The failed scene's own 409 is expected: serving a failed-at-video scene's image on its own is US-31 (JOS-163), listed out of scope in the proposal.

## 9.4 - Every scene complete

Session B, both scenes `chunk-complete`:

```bash
curl -s http://127.0.0.1:3150/sessions/$B
# state: final-video-generating (not final-video), no failedPhase, no failedSceneIndexes
curl -s -w " %{http_code}" http://127.0.0.1:3150/sessions/$B/download/final-video
# {"ok":false,"reason":"final video is not available in state 'final-video-generating'"} 409
```

## 9.5 - OpenAPI

`GET /docs/json`: `failedSceneIndexes` appears twice, on the responses of `POST /sessions` and `GET /sessions/{sessionId}` (the session schema), and in no request body.

## Notes

- A first attempt at the scene download checks passed a whole space-separated string as one scene id because zsh does not word-split unquoted variables, so it showed 400s. That was a shell mistake in my command, not a server result; the table above comes from the corrected run with a real array.

## 9.6 - Cleanup

- Stopped the server (`/health` no longer answers) and deleted the scratch store and projects folder.
- The default store (`backend/data/skeleton.sqlite`) is untouched: row counts per table, migrations 2-11, 17 triggers and an empty `data/projects/` all match the step 8 baseline.

## Outcome

- Step 9 status: PASS
- Blocking issues: none
