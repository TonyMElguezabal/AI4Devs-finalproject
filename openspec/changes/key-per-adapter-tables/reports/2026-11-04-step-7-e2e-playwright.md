# Step 7 Report: E2E Testing with Playwright MCP

- Date: 2026-11-04
- Change: key-per-adapter-tables
- Agent: Claude Code (Opus 5.5)

## Setup (7.1)

- **Backend:** `node src/server.ts` on port 3199 (`NODE_ENV=development`), with literal scratch `DB_PATH`, `PROJECTS_ROOT`, `SETTINGS_PATH` and `SECRETS_PATH`. `secrets.json` was `{}`, and `ADMIN_PASSWORD=jos262-pass`.
- **Frontend:** `VITE_API_BASE=http://127.0.0.1:3199 npx vite --port 5173`, opened at `http://localhost:5173/admin`.
- **Only the branch was run.** The frontend is unchanged, and step 6 showed that `GET /admin/provider-types` answers byte for byte as on the base commit. So the page can only differ from the base if it renders that catalogue wrongly, and that is what was checked.

## Scenarios (7.2)

| # | Scenario | How | Result |
|---|---|---|---|
| a | `/admin` loads | `browser_navigate` | The password form renders. Console: two 401s from `/admin/access` (no password yet, as expected) and the existing `favicon.ico` 404. |
| b | Unlock | Type the password, then Enter | The Administrator tools render. All five stages are listed, each with its seeded profile and an "Add … provider" button. |
| c | Video form | Click "Add video provider", then a snapshot | The fields are Name, Endpoint path ("A path on the vendor's host."), Shortest clip (seconds), Longest clip (seconds), Price per clip second, Currency and API key. |
| d | Every stage's form | `browser_evaluate` opens each "Add … provider" form in turn and reads its labels | See below. Each form has the catalogue's fields for that stage's adapter type, in catalogue order, between Name and API key. |

```
reasoning: Name, Model, Price per request, Currency, API key
voice:     Name, Model, Voice id, Voice name, Output format, Speed, Price per voice character, Currency, API key
alignment: Name, Endpoint path, Price per audio second, Currency, API key
image:     Name, Model, Price per image, Currency, API key
video:     Name, Endpoint path, Shortest clip (seconds), Longest clip (seconds), Price per clip second, Currency, API key
```

- **Connection-check note not exercised in the browser:** the "Test connection" button only shows for a profile with a key, and pressing it sends a real request to the vendor.
- **Where the note is covered instead:** its text comes from the catalogue's `connectionCheck`, which is identical to the base (step 6), and from the route's `no-key` answers in step 6.

## Restore (7.3)

- **Nothing saved:** no form was submitted, and the scratch store still had the 5 seeded profiles.
- **Cleanup:** the browser was closed and both servers stopped (ports 3199 and 5173 free). `.playwright-mcp/` in the repository root and the scratch folder were removed.
- **Developer data untouched:** `backend/data/skeleton.sqlite` still has 5 profiles.

## Outcome

- Step 7 status: PASS
