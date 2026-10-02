# Step 11 Report — E2E Testing (Live Push, Pause, Disconnect, Restart, Diagnostics)

- Date: 2026-09-25
- Change: define-live-updates (JOS-183)
- Agent: Claude (Sonnet 5)

**Tooling note:** `docs/openspec-tasks-mandatory-steps.md` names "Playwright MCP" specifically. As in `define-backend-stack`'s own E2E step, that tool was not available in this session; Claude in Chrome (`mcp__claude-in-chrome__*`) was used instead for the same intent — agent-executed, real-browser verification, locating every element through the accessibility tree via the `find` tool (never a coordinate guess or a test-only selector).

## 11.1 — Environment

Backend (`node src/server.ts`) and frontend (`npx vite --port 5173`) both started from their documented commands; both confirmed reachable before testing.

## 11.2–11.3 — Live update without reload (§8.3)

Already proven with rigorous, instrumented evidence in `reports/2026-09-25-step-7-live-experiments.md` §7.1–7.2 (200-scene burst) and §7.3–7.4 (disconnect/restart) — not repeated here. Summary: the page reflected every state change live, via `EventSource`, with `window.__liveUpdatesLog__` (task 6.5's instrumentation) providing an observation trail rather than eyeballed screenshots.

## 11.4 — Pause/continue, paused marker distinct from state

Proven live (§ Step 7 work, same session): clicking "Pause session" (located via `find`) produced **"Session state: chunks-processing — paused"** while the already-in-flight scene (`image-generating`) continued unaffected — the marker sits beside the state, never replacing it (§8.1, Decision 8). Clicking "Continue session" resumed the held scene without altering the session's state value.

## 11.5–11.6 — Disconnect/restore and backend restart

Proven live in `reports/2026-09-25-step-7-live-experiments.md` §7.3–7.4: a genuine mid-flight `kill -9`, `resumed:1` on restart, browser `connectCount` went 1→2 (one automatic `EventSource` reconnect), and the page reached the correct final state for all scenes with **no manual reload** — confirmed by both the observation log and a screenshot showing an unchanged URL bar throughout.

## 11.7 — A failed scene shows its affected stage, provider and attempt count (§10.1, §11.2)

Located via `find` ("View scene 2 details button" → `ref_18`), clicked, and expanded:

```
#2 — failed stub: content-filter rejection
Instruction: scene two
Provider: stub-image-provider
Attempts: 1
```

All three pieces of diagnostic information (`errorCause`, `provider`, `attempts`) arrived through the live-update payload itself (the resync snapshot on connect, in this case), not a separate diagnostics fetch — consistent with `design.md` § Execution Record §4's "minimum diagnostics the stream carries."

## 11.8 — Accessibility-tree-only interaction

Every interaction in this report and in the Step 7 live-experiments report used either `find` (natural-language → accessibility tree) or a stable `aria-label` (e.g. `Scene ${index}`, `View/Hide scene ${index} details`, `Correct scene ${index} image instruction`) — never a coordinate guess made without first locating the element, and never a `data-testid` or other test-only hook. This is `define-frontend-stack`'s Decision 5 (accessible naming convention) holding up under exactly the automation it exists to serve.

## 11.9 — Restoration

Backend and frontend dev servers stopped; `data/skeleton.sqlite` and `data/projects/` deleted; browser tab left on a clean, disconnected state before this report was filed.

## Outcome

- Step 11 status: **PASS**
- Blocking issues: none
- Environment substitution: Claude in Chrome used in place of Playwright MCP (see Tooling note), consistent with the precedent set by `define-backend-stack`
