# Step 10 Report - E2E Testing in the Browser

- Date: 2026-10-04
- Change: bounded-retry-policy (JOS-184)
- Agent: Claude Sonnet 5
- Tool: Claude in Chrome (Playwright MCP is not available here), in a tab created for this run and closed afterwards

## Applicability

Applicable, in a limited form. This change adds no screen and no frontend code. The existing session page shows the session state and, when failed, the failed phase. It does not render the failure's cause, `retryable`, `manualRetryAvailable` or cycle; showing them belongs to the phase view and to the manual retry stories (US-23 to US-27). So task 10.2's check of "the cause and that it is retryable" is not possible on this page. What can be checked, and matters for this change, is that the page does not show a failure while retries are running, and shows it once the budget is spent.

## Environment

- Backend: `node src/server.ts` on port 3100 (the port the page's API base defaults to), isolated store, stub `transient-failure`, retry delays 6 s; stopped afterwards.
- Frontend: the `vite` dev server already running on `localhost:5173` before this run, left running. It was reached as `localhost`, not `127.0.0.1` (the latter showed a browser error page).
- The session was created through the start form on the page.

## Steps and Results

| # | Step | Result |
|---|---|---|
| 1 | Fill the form and press "Start project" | PASS on the second press (see Findings): the page navigates to `?sessionId=<id>`, "connected", "Session state: submitted". |
| 2 | Look again about 10 s later, between the retries | PASS: still "Session state: submitted", no "Failed phase". |
| 3 | Look again about 20 s after the start, after the fourth attempt | PASS: "Session state: failed", "Failed phase: voice-over", no reload. |
| 4 | Console | PASS: no errors or exceptions. |

Store check afterwards: 4 attempts for the session, `initial` then three `automatic`, all transient.

## Findings

- **The start form's first press sent no request** (the backend logged no POST) although the fields held their values; the second press submitted. Same behaviour as in the JOS-136 and assign-scene-identifiers E2E runs; this branch changes no frontend file.
- The page does not show the failure cause or retry state; recorded above as out of scope.

## Cleanup

Closed the tab, stopped the backend (port 3100 free), deleted the isolated store and folders. The `vite` server was not started by this run and was left as found.

## Outcome

- Step 10 status: PASS (limited form)
- Blocking issues: none
