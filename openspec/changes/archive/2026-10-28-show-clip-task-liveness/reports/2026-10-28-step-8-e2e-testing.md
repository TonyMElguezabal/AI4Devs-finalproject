# Step 8 Report - E2E Testing in the Browser

- Date: 2026-10-28
- Change: show-clip-task-liveness (JOS-233)
- Agent: Claude (Sonnet 5.5), browser: Claude in Chrome

## Environment
Backend on port 3233 with `USE_STUB_VIDEO_PROVIDER=pending`, scratch `DB_PATH` and `PROJECTS_ROOT`; Vite on 5233 with `VITE_API_BASE=http://127.0.0.1:3233`. Session `01ARZ3NDEKTSV4RRFFQ69G5FB1`, one scene `video-generating` as task `stub-task-0001`, inserted into the scratch database before boot (see step 7). The browser window was about 500 px wide. The telemetry consent dialog was declined with "Not now".

## Scenarios
| # | Scenario | Result |
|---|---|---|
| 8.1a | Expand scene 1. The request block lists, in order: Request, Sent at, Elapsed, Estimate, **Task id** `stub-task-0001`, **Last checked** "4 s ago", **Gives up at** "12:26:03 AM if unfinished" (send 11:46:03 PM + 2400 s, in the browser's time zone) | PASS |
| 8.1b | Sampling the "Last checked" text every 2.5 s for 25 s, with no reload: `8 s, 0 s, 3 s, 5 s, 8 s, 0 s, 3 s, 5 s, 8 s, 0 s`. It counts up with the page clock and resets to 0 s each time a new snapshot arrives, once per 10 s check | PASS |
| 8.2 | The scene is set to `failed` in the scratch database and a pause published a fresh snapshot: the clip request block is gone and neither the task id, "Last checked" nor "Gives up at" appears anywhere on the page; the scene shows Failed | PASS |
| 8.3 | A 100-character task id (injected into the `<code>` element to test the CSS only) wraps over three lines inside the details; the block's right edge stays inside the viewport (420 of 500 px) and the page has no horizontal overflow | PASS |

## Environment restored
Both servers stopped, the browser tab closed, and the scratch database and directories deleted. No shared database was opened.

Outcome: PASS
