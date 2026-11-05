# Step 6 — browser end-to-end check (JOS-205)

Date: 2026-10-26 · Smoke flavor macOS arm64 on port 3199, scratch data folder, Chrome driven through the Claude in Chrome tools (not Playwright MCP).

1. Opened `http://127.0.0.1:3199/?sessionId=<id of the session created in step 5>`. The interface loaded from the embedded assets (title "Vid4You", all four phases complete, "Download final video" button). The telemetry prompt appeared; chose "Not now".
2. "New project": filled Title `Browser check`, Script `Hello from the packaged app.`, Language English, clicked "Start project".
3. Within 8 s the new session showed Voice-over, Decomposition, Scenes and Final video all "Complete" with the "Download final video" button. Screenshot kept by the tool: `screenshot-1793042644869-6.jpg`.

The server was stopped and the data folder deleted afterwards.
