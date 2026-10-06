# Step 8 Report - Manual Endpoint Testing with curl

- Date: 2026-10-06
- Change: preserve-progress-across-restarts (JOS-160)
- Agent: Claude Sonnet 5.5

## Setup

The real server (`node src/server.ts`, from the JOS-160 worktree) on a scratch store and a scratch projects folder in the session scratchpad, port 3199, with the existing manual-testing switches: `USE_STUB_VIDEO_PROVIDER`, `USE_STUB_ASSEMBLY_TOOL`, `USE_STUB_VOICE_PROVIDER=success`, `ALLOW_TEST_ENDPOINTS=1` (for `POST /internal/test/quick-scene`), `STAGE_CONCURRENCY_LIMIT=1`. The clip cap is the constant 3. The process was stopped with `kill -9` each time. No code was added for this step.

Three runs, each a fresh process on the same scratch store:

| Run | Video stub | Boot log (`boot recovery complete`) |
|---|---|---|
| A | `success-bytes` | resumed 0, recordedFailedAttempt 0, stillPending 0, `noRestartRecovery: []` |
| B | `pending` (clips never finish) | resumed 0, **recordedFailedAttempt 3**, stillPending 0, `noRestartRecovery: []` |
| C | `success-bytes` | resumed 0, recordedFailedAttempt 0, **stillPending 3**, video in flight 3 of 3, `noRestartRecovery: []` |

`GET /health` answered `{"ok":true}` on each start.

## 8.2 Queued and in-flight work across `kill -9`

The image-stage queue cannot be filled through an endpoint (nothing registers `submitted` scenes over HTTP), so this check uses the clip stage, which has the same recovery rules.

- Run B: session "Manual S1 queued clips" with five scenes through `quick-scene`. With the clip cap at 3 the read showed `['video-generating' x3, 'image-complete' x2]`. Body saved, process killed.
- Run C: the same session read, compared with the saved body apart from `updatedAt`: the three in-flight scenes became `chunk-complete` (their original clip requests were polled again and their results applied), and the two queued scenes also became `chunk-complete`. Every scene shows exactly 1 video attempt, so no unit was sent twice. The boot log shows `stillPending: 3` and 3 of 3 clip slots in flight from boot. The session ended in `final-video`.

## 8.3 Interrupted timestamps and assembly attempts

Between runs A and B the scratch store was changed with a small script that uses the application's own store functions: an `in-flight` `timestamps` attempt on a session with a voice-over and no chunks (S4); an `in-flight` assembly attempt on a session with all scenes complete and no final video (S3); and, on a second such session (S2), four assembly attempts with the fourth `in-flight` (budget spent).

Run B result (`recordedFailedAttempt: 3`):

| Session | Result |
|---|---|
| S4, timestamps lost | `state: failed`, `failedPhase: decomposition`, cause "The narration's timestamps could not be obtained: the request was interrupted by a restart. The script and the narration are unchanged."; attempt 1 is `transient` "interrupted by a restart"; no longer `chunk-decomposing` |
| S3, assembly lost, budget left | attempts `1:transient(interrupted by a restart)`, `2:success`; final video present; exactly one relaunch |
| S2, assembly lost, budget spent | attempts `1-3:transient`, `4:transient(interrupted by a restart)`; nothing relaunched, no final video |

Observation, not caused by this change: S2 reads `final-video-generating` with nothing running. A live assembly that exhausts its budget derives the same state, because the assembly failure is presented by the story that adds it (`retry-final-assembly`, JOS-159). The recovery here leaves exactly what the live path leaves.

## 8.4 Paused session

Run B: "Manual S5 paused", paused, two scenes registered through `quick-scene`: `paused: true`, `held: [{stage: video, count: 2}]`, both scenes `image-complete` with no video stage entry (no request sent). After `kill -9` and run C the read matched the saved body with no differences at all (still paused, same held work, scenes `image-complete`, no request sent). `POST /sessions/{id}/continue` returned 200, and the session reached `final-video` with each scene at 1 video attempt.

## 8.5 Cleanup

The server was stopped (nothing listens on 3199). The scratch store and folder are in the session scratchpad and are not part of the repository. The default store of the main checkout `backend/data/skeleton.sqlite` was read before and after: 2 runs, 0 scenes, 0 stage_attempts, 13 migrations, 17 triggers, and 2 entries in `data/projects/`, identical.
