# Step 5 Report — Manual Endpoint Testing

- Date: 2026-10-09
- Change: `retry-or-correct-clip`
- Agent: GitHub Copilot

## Environment

- Backend started with `USE_STUB_VIDEO_PROVIDER=success`.
- Test database: `/tmp/jos-158-verification-31901.sqlite`.
- Test project files: `/tmp/jos-158-verification-31901-projects`.
- Fixtures were created directly in the isolated database as valid failed-video scenes, with stored image artefacts and the session initially paused. No application database or project files were used.

## Commands and Results

| Request | Result |
|---|---|
| `POST /sessions/{sessionId}/scenes/{sceneId}/retry` for a failed clip while paused | HTTP 200, `{"ok":true}`; state returned to `image-complete`, image path remained present, and no video provider call was recorded before continue. |
| `POST /sessions/{sessionId}/scenes/{sceneId}/correct` with `{"instruction":"  corrected video instruction  "}` | HTTP 200, `{"ok":true}`; `videoInstruction` was trimmed to `corrected video instruction`, image path remained unchanged, and state returned to `image-complete`. |
| Same correction route with `{"instruction":"   "}` | HTTP 400 validation error; scene remained failed and unchanged. |
| Correction using another session ID with the failed scene ID | HTTP 404, `{"ok":false,"reason":"unknown-scene"}`; owning scene remained unchanged. |
| `POST /sessions/{sessionId}/continue` | HTTP 200, `{"ok":true}`; the two held clip retries completed with the deterministic provider. Both scenes reached `chunk-complete`, retained their images, and the corrected scene used the corrected `VIDEO`. The isolated DB recorded two successful video requests. |
| Retry the scene after it had completed | HTTP 409, `{"ok":false,"reason":"not-failed"}`. The stored scene remained `chunk-complete` with one video request. |

The paused snapshot and final database inspection confirmed state transitions, image preservation, corrected instruction, and provider-call counts. The commands used the existing route paths; request and response shapes were unchanged.

## Notes

- The first fixture attempt used UUID session IDs and was rejected by the API's ULID path validation with HTTP 400. The fixture was corrected to valid ULIDs before recording the results above.
- A separate, single-scene synthetic session was seeded without a voice-over; after its only scene completed, `GET /sessions/{sessionId}` returned HTTP 500 during response serialization. That fixture bypassed normal project creation and omitted the required voice-over state. The retry/correction route results and persisted clip state were verified independently; this synthetic read failure is not attributed to JOS-158.

## Cleanup

- Stopped the backend.
- Reset all seeded rows in the temporary SQLite database; `runs`, `scenes`, `provider_requests`, `stage_attempts`, `scene_results`, and `scene_video_results` each returned to 0 rows.
- Removed the temporary project-artifact directory. No application database or project files were changed.

## Outcome

- Step 5 status: PASS
- Blocking issues: None