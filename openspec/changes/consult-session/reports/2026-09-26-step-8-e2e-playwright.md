# Step 8 — E2E Testing (Claude in Chrome, substituting for Playwright MCP)

**Change:** consult-session (JOS-135)
**Date:** 2026-09-26
**Tooling note:** no Playwright MCP is available this session; Claude in Chrome browser
automation was used in its place, per this repo's documented substitute for this mandatory
step.

## Setup

Both servers started from their documented commands, real store (no isolation needed here
since every session created is deleted and every project folder removed at the end):

```
backend:  npm start          (http://127.0.0.1:3100)
frontend: npm run dev        (http://localhost:5173)
```

Pre-test baseline (real store): 0 runs, 1 pre-existing project folder (`Traversal Test
2026-09-26 15-18`, unrelated to this step).

## 8.1 — Servers running

Backend `GET /` → 200. Frontend `Vite ready` on port 5173, `GET /languages` reachable (the
start form's language dropdown populated correctly on load).

## 8.2 / 8.3 — Start a project, land on the session page

Filled Title "E2E Twin", Script "A wide shot of the harbor at sunrise, birds crossing the
sky.", Language "English", clicked "Start project".

Result: browser navigated to `?sessionId=01M3FSQPE1T8QETN4ZK5M95A7Y` and the session page
rendered:
- `Session state: submitted`
- Title "E2E Twin"
- Script shown verbatim
- "Scenes are not yet available." (Decision 6 — empty list, not an error)

## 8.4 — Reopen the same address in a new page

Opened a second tab directly at `?sessionId=01M3FSQPE1T8QETN4ZK5M95A7Y`. Rendered
identically: same title, same script, same state, same "not yet available" scene message.

## 8.5 — Second project, same title

In the same second tab, started a new project titled "E2E Twin" again (script: "A
different script for the twin-titled session.", language Spanish).

Result: new session `01M3FSRXKMBRYXZQJ9V34EC0KH`, its page showing only its own script
("A different script for the twin-titled session."). The first tab, re-screenshotted at
the same moment, still showed only its own script ("A wide shot of the harbor..."). No
cross-contamination between the two same-titled sessions.

## 8.6 — Unknown identifier

Navigated to `?sessionId=01ARZ3NDEKTSV4RRFFQ69G5FAV` (valid ULID shape, no such session).

Result: "No session was found for this identifier." with a "Start a new project" button —
matches Decision 4 (unknown looks like the not-found case) and task 4.4's requirement.
Clicking the button returned to the empty start form (title/script cleared, address's
`sessionId` param removed).

## 8.7 — Accessibility-tree-only interaction

Every element (`Title` textbox, `Script` textbox, `Select a language` combobox, `Start
project` button, `Start a new project` button) was located and driven via `read_page`'s
accessibility tree and its accessible name — no test-only selector, `data-testid`, or CSS
hook was used anywhere in this session.

## 8.8 — Cleanup and restore

```sql
DELETE FROM runs WHERE id IN ('01M3FSQPE1T8QETN4ZK5M95A7Y', '01M3FSRXKMBRYXZQJ9V34EC0KH');
```

```
rm -rf "data/projects/E2E Twin 2026-09-26 15-25" "data/projects/E2E Twin 2026-09-26 15-26"
```

Both servers stopped (ports 3100 and 5173 confirmed freed). Post-test state verified
against baseline:

| | Before | After |
|---|---|---|
| `runs` rows | 0 | 0 |
| `data/projects/` folders | 1 | 1 (same pre-existing folder) |

## Outcome

All E2E scenarios from tasks.md group 8 passed against the real running application. No
product code changes were required as a result of this step.
