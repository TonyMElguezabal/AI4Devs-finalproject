# Step 8 Report - Browser check

- Date: 2026-10-27/28 (UTC)
- Change: keep-clip-task-on-timeout (JOS-204)
- Agent: Claude (Claude in Chrome; no Playwright MCP in this session)

The change has no frontend code. The check confirms that what the backend now produces reads correctly on the existing page.

Setup: the scratch backend of step 7 (port 3204, `CORS_ALLOWED_ORIGINS` for `localhost:5175`) with the scene that failed at the ceiling, and Vite from this worktree on port 5175 with `VITE_API_BASE=http://127.0.0.1:3204`. The first-run telemetry prompt was dismissed with "Not now".

| Check | Result |
|---|---|
| Session header | `Needs attention`, "Failed phase: scenes" |
| Scenes section, scene 0 | `Failed`, with the alert "the clip task did not finish within 40 s (twice the 20 s phase limit); the provider task may still be running and billed. Retry to send a new task." |
| Scene details | affected stage "Clip", provider "Stub provider (stub-video-provider)", `Retry scene 0` and `Save correction and retry` offered |

Observation: the details show "2 attempts" because this scene had already been retried once by hand in step 7 (the first task, then the retry); the ceiling itself recorded one attempt.

Restoration: tab closed, both servers stopped, scratch directory deleted. No shared database was opened.

Outcome: PASS
