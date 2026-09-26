# Step 8 Report — E2E Testing of Live Push (Experiment 4.4)

- Date: 2026-09-25
- Change: define-backend-stack (JOS-179)
- Agent: Claude (Sonnet 5)

**Tooling note:** `docs/openspec-tasks-mandatory-steps.md` names "Playwright MCP" specifically. That tool was not available in this session; the equivalent available tool, Claude in Chrome browser automation (`mcp__claude-in-chrome__*`), was used instead to fulfil the same intent — agent-executed, real-browser E2E verification, with navigation and screenshots as the evidence trail (in place of Playwright's `browser_navigate`/`browser_snapshot`).

## 8.2–8.3 — live update without reload (PRD §8.3 / C8)

A run was created with one scene (`mode: "success", latencyMs: 45000`) specifically so the transition could be captured within one controlled browser action sequence (`browser_batch`) rather than depending on inter-call timing.

1. Navigated to `http://127.0.0.1:3100/?runId=<id>` and screenshotted: page showed `in_flight`, no result, status line `connected (SSE) — runId ...`.
2. Waited 50s in five chained 10s steps (all inside the same batch, so the tab was never touched/reloaded in between).
3. Screenshotted again: page showed `chunk-complete` with a result, and the status line read `... — last update 1:54:48 PM` — that suffix is set only inside the `EventSource.onmessage` handler, so its presence is itself proof the update arrived over the SSE push, not a reload (the URL bar and tab were never navigated between the two screenshots).

## 8.4 — drop the connection, let a change occur, restore it, confirm correct final state

A scene was created (`latencyMs=20000`) and the page opened against it (confirmed `in_flight`, SSE connected). The backend process was then killed (`kill -9`, identified via `lsof -tiTCP:3100` — see the Step 7 report's Outcome section for why `pgrep` alone was unreliable here) at a point confirmed via a same-shell `curl` check to still be mid-flight, dropping the browser's SSE connection. The backend was restarted immediately; boot reconciliation reported `stillPending:1` (a genuine mid-flight kill, not a race against an already-completed request) and re-armed delivery for the remaining ~1.2s.

Within ~8s, the reconnected page showed `chunk-complete` with the correct result — reached via `EventSource.onopen`'s resync fetch (see finding below), not a manual reload.

### Finding raised and fixed during this experiment

The first pass of `public/index.html` fetched `/runs/:id` **only once**, on initial page load, and relied on `onmessage` for everything after. An SSE stream has no backlog: if the browser's `EventSource` reconnects (as it does automatically after the drop above) at a moment when it isn't yet listening for the broadcast the reconciliation produces, that update would be missed forever, and the page would silently show a stale state indefinitely with no visible sign of the problem (the "connected" status would still show once reconnected).

Fix applied: the `/runs/:id` fetch was moved into the `onopen` handler, which fires both on the first connection and on every automatic reconnect. This closes the gap — the page now always re-syncs on (re)connect regardless of whether it missed a broadcast while disconnected — and was re-verified live in the run above. Without this fix, task 8.4's "confirm the page reaches correct current state" would not reliably hold; this is exactly the kind of gap the walking-skeleton approach (Decision 1, `../design.md`) is meant to surface before it reaches an implementation story.

## Outcome

- Step 8 status: **PASS** (after the fix above)
- Blocking issues: none remaining
- Environment substitution: Claude in Chrome used in place of Playwright MCP (see Tooling note)
