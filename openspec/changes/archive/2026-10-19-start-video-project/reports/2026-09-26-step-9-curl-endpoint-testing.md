# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-09-26
- Change: start-video-project (JOS-134)
- Agent: Claude Sonnet 5

## Environment

- `cd backend && npm start` (default `data/skeleton.sqlite` / `data/projects/` paths — manual/E2E testing path, distinct from the isolated automated-test path per `docs/backend-standards.md` § Persistence)
- Pre-test session count: 0 (`data/` absent before this step)

## Commands and Responses

### 9.3 — Valid start (AC01)
```
curl -X POST http://127.0.0.1:3100/sessions -H "Content-Type: application/json" \
  -d '{"title":"My Trip","script":"A wide shot of a harbor at dusk.","language":"en"}'
```
→ `201`, `{"session":{"sessionId":"01M3FQ0EATMGQD0C147KQC3AX3", ..., "state":"submitted", ...},"scenes":[]}` — ULID identifier, zero scenes, script echoed exactly.

### 9.4 — Empty title, empty script (AC03)
- Empty title → `400`, `{"code":"FST_ERR_VALIDATION","message":"body/title title must not be empty"}`
- Empty script → `400`, `{"code":"FST_ERR_VALIDATION","message":"body/script script must not be empty"}`

### 9.5 — Whitespace-only title (Decision 1)
- `{"title":"   ", ...}` → `400`, same "title must not be empty" message (trimmed-view emptiness rule).

### 9.6 — Missing/unsupported language (AC05, Decision 5)
- No `language` field → `400`, `"message":"body/language Required"`
- `"language":"klingon"` → `400`, `"message":"body/language Invalid enum value. Expected 'en' | 'es' | 'fr' | 'de' | 'pt', received 'klingon'"`
- `GET /languages` → `200`, `[{"code":"en","label":"English"},{"code":"es","label":"Español"},{"code":"fr","label":"Français"},{"code":"de","label":"Deutsch"},{"code":"pt","label":"Português"}]`

### 9.7 — Script far longer than the 1500-word reference (AC04)
- 16,000-word script (`.repeat(2000)` fixture) → `201`, accepted, not rejected for length.

### 9.8 — Duplicate submission (Decision 7)
- Same `{title, script, language}` posted twice → two distinct ULIDs (`01M3FQ15RTSR1F20KKNDSGRDDZ`, `01M3FQ15SGG4VX1RV3T0A4GYM6`), both registered.

### 9.9 — Byte-identical script (Decision 1)
- Posted `"  leading and trailing space  "` (leading/trailing whitespace) → `GET /sessions/:id` returned the script with whitespace fully preserved: `'  leading and trailing space  '`. Confirmed untrimmed, byte-identical.

## Cleanup

- Total sessions (`runs` rows) created during this test run: 5 (confirmed via direct SQLite count before cleanup).
- Server stopped (`pkill -f "node src/server.ts"`).
- `data/` directory removed; verified absent afterward (`ls data` → not found), restoring the pre-test (empty) state.

## Outcome

- Step 9 status: PASS
- Blocking issues: none
