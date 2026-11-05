# Step 9 Report - Manual Endpoint Testing

- Date: 2026-10-28
- Change: rebuild-scene (JOS-235)
- Agent: Claude (Sonnet 5.5)

Backend from this worktree, `PORT=3235`, scratch `DB_PATH` and `PROJECTS_ROOT`, with `USE_STUB_IMAGE_PROVIDER=success` (new in this change, task 9.0), `USE_STUB_VIDEO_PROVIDER` and `USE_STUB_ASSEMBLY_TOOL` as stated per step, and `RETRY_*_DELAY_SECONDS` of 0.2 and 0.5. `POST /sessions` needs a content-check key the scratch environment lacks, so the two sessions were inserted with a seed script that uses the backend's own store functions: a voice-over, stored character timestamps, two complete scenes with their files and, for session A, a first final video (version 1).

**First attempt, discarded:** the seed bound the scenes to the video provider name `stub-video` instead of `stub-video-provider`. Both rebuilt scenes ended `failed` with "no adapter is configured for the bound video provider 'stub-video'". That was a seed error, but it also showed that a failure after a rebuild is an ordinary scene failure with its cause. The database was recreated.

## Session A (`…FB2`, final video version 1), assembly `slow-success` (4 s)

| Step | Command | Result |
|---|---|---|
| 1 | `POST /sessions/A/scenes/<1>/rebuild` `{"imageInstruction":"image instruction 1, no text on the sign"}` | 202 `{"ok":true,"held":false}` |
| 2 | `GET /sessions/A` 1 s later | scene 1 `chunk-complete` with image `image?r=1` and the edited IMAGE; session `final-video-generating`; `finalVideo` `{version:1, pendingPauseEdits:false, staleScenes:true}` |
| 3 | `POST …/scenes/<2>/rebuild` `{}` during that assembly | 409 `assembly-in-progress` |
| 4 | `GET /sessions/A` 5 s later | session `final-video`; `finalVideo` `{version:2, staleScenes:false}`; assembly attempts: cycle 1 success, cycle 2 success |
| 5 | project folder | `scene-1-attempt-1.png`, `scene-1-r1-attempt-1.png`, `scene-1.mp4`, `scene-1-r1.mp4` side by side; `corrected-instructions.json` holds only scene 1's IMAGE edit |
| 6 | rebuild an unknown scene / a well-formed unknown session | 404 `unknown-scene` both |
| 7 | rebuild with `{"videoInstruction":"   "}` | 400 (`body/videoInstruction String must contain at least 1 character(s)`) |
| 8 | `POST …/final-video/rebuild` with nothing stale and no pause edit | 409 `nothing-to-rebuild` |
| 9 | rebuild scene 2, then a second rebuild and `final-video/rebuild` a few ms later | 202, then 409 `assembly-in-progress` for both (the stubs had already finished the scene, so the assembly was running); session ends `final-video` version 3 |

Restarted with `USE_STUB_VIDEO_PROVIDER=pending` (a clip that never finishes):

| Step | Command | Result |
|---|---|---|
| 10 | rebuild scene 1 | 202; scene 1 `video-generating`, session `chunks-processing`, `staleScenes:true` |
| 11 | rebuild scene 1 again | 409 `scene-not-ready` |
| 12 | `POST …/final-video/rebuild` | 409 `scenes-not-complete` |

## Session B (`…FB3`, no final video), assembly `not-retryable-failure`, then `success`

| Step | Command | Result |
|---|---|---|
| 13 | boot with `not-retryable-failure` | session `failed` at `assembly`, scenes `chunk-complete` |
| 14 | restart with assembly `success` | still `failed` at assembly (a restart does not relaunch a failed assembly) |
| 15 | `POST /sessions/B/scenes/<1>/rebuild` `{"videoInstruction":"video instruction 1, slower"}`, read 2 s later | 202; session `final-video` with a final video URL; assembly attempts: cycle 1 not-retryable, cycle 2 success |

## Limits of this check
- The stub assembly tool writes no file, so `final-video-2.mp4` and `-3.mp4` do not exist in the scratch folder and the download answers 404 for them. That is the stub, not the change: `scene-rebuild-final-video.test.ts` uses a file-writing tool and asserts the new version is current and `final-video.mp4` still exists. The browser check (group 10) shows the same flow end to end with the stub.
- `scene-not-ready` and `scenes-not-complete` needed a clip that never finishes (step 10-12); with an instant stub the stage finishes before a second call can arrive.

Database state: only the scratch database was written. It is deleted after the E2E group.

Outcome: PASS
