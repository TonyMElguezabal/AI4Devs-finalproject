# Step 6 Report — Browser End-to-End Testing

- Date: 2026-10-09
- Change: `retry-or-correct-clip`
- Agent: GitHub Copilot

## Environment

- Backend: `http://127.0.0.1:3100`, isolated SQLite `/tmp/jos-158-verification-31901.sqlite`, deterministic `USE_STUB_VIDEO_PROVIDER=success`.
- Frontend: `http://127.0.0.1:5173`.
- Session: isolated, initially paused, three failed-video scenes, successful stored image per scene.
- Browser: integrated Playwright browser.

## Scenarios and Results

1. **Failed-video action visibility and accessibility — PASS.** Opened scene 1 details. The accessibility tree exposed “Retry scene 1,” form “Correct scene 1 video instruction,” and textbox “Corrected video instruction for scene 1,” prefilled with `video 1`. The completed image rendered. No image-correction form was present.
2. **Retry while paused and live update — PASS.** Clicking “Retry scene 1” caused the live session snapshot to display `image-complete` and “waiting for continue”; session status showed one held video operation. The image remained available.
3. **Correct VIDEO while paused and live update — PASS.** Filled scene 2’s accessible video textbox with `A cinematic slow push-in` and submitted. The live snapshot displayed held `image-complete`; details showed the corrected `VIDEO`, retained image, and no correction/retry controls while the stage was no longer failed.
4. **Blank correction refusal — PASS.** Submitted a whitespace-only scene 3 video instruction. Backend returned HTTP 400 and the row displayed the generic readable sentence “The action could not be completed.” Scene 3 remained failed. This is validation feedback, not a backend reason-code leak.
5. **Continue releases held work — PASS.** Clicking “Continue session” released scenes 1 and 2; both reached `chunk-complete`, displayed clip diagnostics, and exposed image/video downloads. Scene 3 remained failed, demonstrating stage-specific isolation.
6. **Controls outside failed video state — PASS.** After live updates marked scenes 1 and 2 `chunk-complete`, neither exposed clip retry nor a video-correction form. Scene 3, still failed at video, retained those controls.

## Cleanup

- Stopped backend and frontend test servers.
- Reset all test rows from the isolated DB; the six tracked tables returned to 0 rows.
- Removed the isolated project-artifact directory. No application data was used.

## Notes

- An initial browser fixture run showed that held server changes did not reach the open page until another state event. This exposed a missing broadcast after an accepted retry/correction was held by pause. The design/spec/task artifacts were updated before the implementation change; a backend event test was added and now proves both commands publish the held `image-complete` snapshot without sending a video request. The final browser run above passed with this fix.
- A separate synthetic fixture without normal session prerequisites produced a GET snapshot serialization error, so it was discarded and not used for the final browser pass.

## Outcome

- Step 6 status: PASS
- Blocking issues: None