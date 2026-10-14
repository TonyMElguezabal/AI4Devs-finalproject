# Fix the RunningHub video adapter

Linear-Issue: JOS-196

## Why

Every video clip fails with the real provider. The adapter (`backend/src/videoProvider.ts`, `createRunningHubVideoProvider`) was written and tested only against mocked HTTP whose shapes it also invented, and it does not match RunningHub's live API in any of its three calls: the upload is sent as a raw body (the service now answers `HTTP 200` with `errorCode 1000`) and its response is read from `data.fileUrl` (it is `data.download_url`); the submit goes to `/openapi/v2/task/openapi/create` instead of the recorded model endpoint, and reads `data.taskId` (it is a top-level `taskId`); the query goes to `/openapi/v2/task/openapi/status` instead of `/openapi/v2/query` and reads `data.taskStatus` and `data.outputList[].fileUrl` (they are `status` and `results[].url`). Found by the JOS-194 spike's real-provider run on 2026-10-13, verified with plain requests against the live API and against the archived render script that generated real clips for the silence-allocation comparison. Without this, no real session can reach a final video.

## What Changes

- Upload sends `multipart/form-data` with a `file` part (PNG) and reads `data.download_url`.
- Submit posts JSON to `VIDEO_PROVIDER.endpoint` and reads `taskId` (top level, or `data.taskId`).
- Query posts `{ taskId }` to `/openapi/v2/query` and maps `status` (`SUCCESS` with `results[0].url`, `FAILED`, and `QUEUED`, `RUNNING` or anything else as pending).
- An error envelope (`errorCode` set, or `code` not 0) is a transient failure whose reason names the step and carries the provider's error code, never the key.
- The mocked tests are rewritten to the live shapes, and the contract test is updated.

## Capabilities

### New Capabilities
- `runninghub-video-adapter`: the requests the video adapter sends to RunningHub, how it reads each answer, and how it reports a provider error.

### Modified Capabilities
<!-- None: the `VideoProvider` port, the video stage, retries and the PRD are unchanged. -->

## Impact

- **Backend:** `backend/src/videoProvider.ts` and its tests (`video-provider.test.ts`, `adapters-no-hidden-retries.test.ts`, the video contract test).
- **Docs:** the adapter paragraph in `docs/backend-standards.md`.
- **Cost:** none to implement; the verification step makes one 5-second real clip (a few cents to under a dollar).
- **Out of scope:** retry timing and backoff (attempts 1-4 ran back to back within about a second), storing a failure reason on the provider request row, the 4xx/5xx classification rules.
