# Step 10 Report - E2E Testing (Chrome browser automation)

- Date: 2026-10-02
- Change: record-speed-adjustment-factor (JOS-148)
- Agent: Claude Sonnet 5

## Applicability (task 10.1)

Applies: this story changes `SceneRow.tsx`'s rendered output (unlike `request-admitted-clip-duration`, JOS-147, whose own step-9 report found no screen change). Used the `claude-in-chrome` browser automation tools (Playwright MCP was not available in this environment; this is the project's equivalent browser-driving tool for the mandatory E2E step).

## Setup

- Backend: `DB_PATH`/`PROJECTS_ROOT` pointed at a scratch location, default `PORT` 3100, stub providers (the default, no credentials configured).
- Frontend: `npx vite --port 5173` (default `VITE_API_BASE` of `http://127.0.0.1:3100` matches the backend's default port, no override needed). Vite listens on IPv6 `localhost` only by default — reachable at `http://localhost:5173/`, not `http://127.0.0.1:5173/`.
- `runDecompositionPhase` is not wired to any route yet (same finding as step 9); registered one chunk directly via `registerDecomposition` against the same scratch `DB_PATH`/`PROJECTS_ROOT` the backend server reads, using the step-9 over-limit fixture (35s unsplittable sentence, 15s admitted maximum, factor 35/15 ≈ 2.333, over the 2.0 limit) so the run exercises both warnings in one screen.

## Steps and result (task 10.2-10.4)

1. Navigated to `http://localhost:5173/?sessionId=<id>` (the app's own URL-based session addressing, `App.tsx`).
2. Page loaded showing the session title, script, state (`chunks-processing`), and the one scene row (`#1 — submitted`).
3. Clicked "View scene 1 details" to expand the scene-details panel.
4. `get_page_text` confirmed the rendered panel:

```
Instruction      IMAGE 1
Provider         stub-image-provider
Attempts         0
Requested duration  15 exceeds-maximum
Speed factor     2.3333333333333335 exceeds-limit
```

Screenshot saved (attached to the conversation): both the requested duration and speed factor render with their respective warnings shown distinguishably next to the value each qualifies, exactly as `components.test.tsx`'s unit tests assert and `specs/clip-duration-request/spec.md`'s "scene-details panel" requirement describes.

## Cleanup (task 10.5)

- Closed the browser tab.
- Stopped the backend and frontend processes.
- Re-checked the default store (`backend/data/skeleton.sqlite`): 0 rows in `runs`/`scenes`, no project folders — untouched (a different `DB_PATH`/`PROJECTS_ROOT` the whole time).
- Removed the scratch directory.

## Outcome

- Step 10 status: PASS
- Blocking issues: none
