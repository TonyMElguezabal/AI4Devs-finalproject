# Step 10 Report - E2E Testing (Start a Video Project)

- Date: 2026-09-26
- Change: start-video-project (JOS-134)
- Agent: Claude Sonnet 5

## Tooling note

No Playwright MCP tool was available in this session. Per `docs/backend-standards.md` § End-to-End Testing / `docs/frontend-standards.md` § Testing Standards ("if unavailable... Claude in Chrome... is an acceptable substitute for the same intent"), **Claude in Chrome** (`mcp__claude-in-chrome__*`) was used instead. Every element was located by accessible name/role via `read_page`/`find`, never a coordinate guess or test-only selector.

## Environment

- Backend: `cd backend && npm start` → `http://127.0.0.1:3100`
- Frontend: `cd frontend && npm run dev` → `http://localhost:5173`
- Pre-test: `data/` absent.

## Scenarios executed

1. **Language selector sourced from the server (10.3)**: navigated to `/`, `read_page` confirmed the combobox offers exactly `English, Español, Français, Deutsch, Português` — the same 5 codes `GET /languages` returns, not a second hardcoded frontend list.

2. **Cannot start without a language (10.4)**: filled title ("E2E Trip") and script, left language unselected — "Start project" rendered visibly disabled/muted.

3. **Cannot start with an empty title (10.5)**: filled script + selected a language, left title empty — "Start project" stayed disabled. (Empty-script is the symmetric case, sharing the identical `canSubmit` gate; already covered by the component tests in task 6.7 and not re-screenshotted here.)

4. **Valid start shows the identifier (10.6/10.7)**: selected "English", clicked "Start project" — page navigated to `?sessionId=01M3FQ4QC3KMDH6FJ5G7H9H622` (a valid 26-char ULID), displayed "Session: 01M3FQ4QC3KMDH6FJ5G7H9H622 — connected" (live SSE connection established) and "Session state: **submitted**". `read_page` on this view returned zero interactive elements — correct for a zero-scene, non-running session (no pause control, since `isRunning` is false at `submitted`; no scene rows, since none are created at registration per Decision 8).

5. **Accessibility tree only, no test-only selectors (10.8)**: every element in every scenario above was located via `read_page`/`form_input`/accessible name — `Title`, `Script`, `Select a language` combobox, `Start project` button.

## Cleanup

- Tab closed (`tabs_close_mcp`).
- Both servers stopped (`pkill`).
- `data/` directory removed; verified absent afterward.

## Outcome

- Step 10 status: PASS
- Blocking issues: none
