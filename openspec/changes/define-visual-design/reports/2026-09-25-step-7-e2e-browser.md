# Step 7 Report - E2E Testing (Render Console restyle)

- Date: 2026-09-25
- Change: define-visual-design
- Agent: Claude Sonnet 5

## Tooling note

No Playwright MCP tool was available in this session. Per `docs/frontend-standards.md` § Testing Standards ("if unavailable in a session, an equivalent agent-driven real-browser tool (e.g. Claude in Chrome) is an acceptable substitute for the same intent, stated explicitly in the report when substituted"), **Claude in Chrome** (`mcp__claude-in-chrome__*`) was used instead — `navigate`, `computer` (screenshot/click), `read_page`, `find`, `form_input`. Every element was located by accessible name/role via `read_page`/`find`, never a coordinate guess or test-only selector.

## Environment

- Backend harness: `openspec/changes/define-backend-stack/skeleton`, `npm start` → `http://127.0.0.1:3100`
- Frontend (restyled): `openspec/changes/define-frontend-stack/prototype`, `npm run dev` → `http://localhost:5173`

## Scenarios executed

1. **Start form + language gate**: navigated to `/`, confirmed the accessibility tree exactly matches the documented convention (`Title`, `Script`, `Select a language`, `Start project`). Filled title + script, left language unselected — `Start project` rendered visibly muted/disabled. Selected a language — form submitted successfully, session created, URL updated to `?sessionId=...`.

2. **Session view, ascending order, styling**: session rendered with the Render Console palette — dark background, IBM Plex Mono, left-edge status bars. 3-scene session reached `final-video` almost immediately (fast stub provider); scenes rendered `#1`, `#2`, `#3` in order with teal (`status-complete`) bars/text, "Download final video" present. Expanded scene 1: instruction/provider/attempts shown, both download links present (`Download scene 1 image`, `Download scene 1 video`).

3. **Failed state + correction form (conditional editing)**: created a session via the backend directly with one `not_retryable_failure` scene (the UI's own start form always sends `mode: "success"` — same limitation `define-frontend-stack`'s own E2E already worked within, not something this styling change could address). Session state showed `failed` with a red left bar and "Failed phase: image" in red text; scene #1 showed red with its error cause text, scene #2 showed teal (`chunk-complete`). Expanded scene 1: "Retry scene 1" button and the correction form (red-bordered, labeled "Corrected image instruction for scene 1", prefilled textarea, "Save correction and retry" button) were present. Scene #2 (successful) showed no correction form and no Retry button when expanded — confirmed via `read_page` on that row.

4. **Paused vs. running, distinguishable by text**: created a slow session, paused it via the backend immediately, then loaded it in the browser: "Session state: chunks-processing — paused" rendered in muted grey with a "Continue session" button. Clicked "Continue session" — the page updated live (via the existing SSE seam, untouched by this change) to "Session state: chunks-processing" with a "Pause session" button and the amber (`status-progress`) bar. The paused marker's text ("— paused") is present regardless of color, satisfying `specs/visual-design/spec.md` "Status is never color-only."

5. **Download gating**: confirmed across the above — per-scene downloads appear only once a scene reaches `chunk-complete`; "Download final video" appears only once the session reaches `final-video` (present in scenario 2, absent in scenarios 3 and 4). No download affordance for MP3, timestamps, or generated texts exists anywhere (unchanged from `define-frontend-stack`).

## Accessible-name regression check

At every step, `read_page`/`find` returned exactly the names `docs/frontend-standards.md` § Accessible Naming Convention documents: `Scene N`, `View/Hide scene N details`, `Retry scene N`, `Correct scene N image instruction`, `Corrected image instruction for scene N`, `Download scene N image/video`, `Download final video`, `Pause/Continue session`, plain `<label>`s on the start form. No name changed, no test-only selector was used.

## Cleanup

- Tab closed (`tabs_close_mcp`)
- Both servers stopped (`pkill`)
- Backend `data/` directory removed and verified absent

## Outcome

- Step 7 status: PASS
- Blocking issues: none
- Note: the "per-phase provider/attempts line for session-level stages" (voice-over, decomposition) mentioned in `tasks.md` 3.2 is not modelled in this prototype at all (a scope simplification `define-frontend-stack` already recorded), so there was nothing of that kind to style or verify here.
