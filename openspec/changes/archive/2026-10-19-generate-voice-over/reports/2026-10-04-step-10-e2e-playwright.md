# Step 10 Report - E2E Testing in the Browser

- Date: 2026-10-04
- Change: generate-voice-over (JOS-136)
- Agent: Claude Sonnet 5
- Tool: Claude in Chrome (Playwright MCP is not available here), in a tab created for this run and closed afterwards

## Applicability

Applicable, in a limited form. This change adds no screen and no frontend code. The existing session page shows the session state and, when failed, the failed phase, so the checks are that the voice-over states reach the page and that the failure shows its phase. The failure cause is returned by the session read (verified in step 9) but the page does not render it; showing the cause belongs to the phase view (US-18, out of scope in `design.md`), and task 10.4 was reworded before this run to match.

## Environment

- Backend: real `node src/server.ts` on port 3199, against a scratch store (`data/e2e.sqlite`, `data/e2e-projects`), restarted for each voice stub mode with `USE_STUB_VOICE_PROVIDER` (no real provider called)
- Frontend: a `vite` dev server already running on `127.0.0.1:5173` since 12:22 (started before this run, already pointing at `http://127.0.0.1:3199`); the one this run tried to start could not bind (`strictPort`), so the page was served by the existing one, which was left running
- Every session was created through the start form on the page.

## Steps and Results

| # | Stub | Step | Result |
|---|---|---|---|
| 1 | `hang` | Fill the form and press "Start project" | PASS: the page navigates to `?sessionId=<id>`, "connected", "Session state: voice-over-generating", the script shown unchanged, "Scenes are not yet available." |
| 2 | `success` | Same | PASS: "Session state: voice-over-complete" with no reload |
| 3 | `not-retryable-failure` | Same | PASS: "Session state: failed" and "Failed phase: voice-over" |
| 4 | all | Console | PASS: no errors or exceptions |

## Findings

- **The start form submits only after the controls hold their values in the page's own state.** In 3 of the 6 attempts the "Start project" press sent no request (the backend logged no POST) and the typed text was missing; repeating the same steps then submitted. This is the same behaviour found in the assign-scene-identifiers E2E run, and this branch changes no frontend file.
- **The live transition `generating` to `complete` was not watched on screen.** The success stub answers in tens of milliseconds, before the page finishes loading the session, and the hang stub cannot be released from outside. The transition itself is covered by the automated live-update order test in `voice-over-phase.test.ts` and by the repeated reads in step 9.
- **The page does not show the voice-over details** (provider, duration, native-timestamp availability) nor the failure cause, as above.

## Cleanup

Tab closed; backend stopped (port 3199 free); the pre-existing frontend dev server was not started by this run and was left running; scratch store (3 sessions in the first mode run, 1 voice-over in total) and `data/e2e-projects` deleted; server logs removed; the default store was not touched.

## Outcome

- Step 10 status: PASS (with the findings above)
- Blocking issues: none
