# Step 5 Report: Manual Endpoint Testing with curl (and step 6, E2E)

- Date: 2026-11-05
- Change: shared-adapter-contract-suite
- Agent: Claude Code (Opus 5.5)

## 5.1 No production code changed

```
git diff --stat origin/feature/entrega-3-JAME -- backend/src frontend   → (empty)
```

This change only edits files under `backend/test/`, so no endpoint can answer differently.

## 5.2 The branch runs

- **Setup:** the backend was started with every variable written literally and scratch paths:
  ```
  NODE_ENV=development PORT=3263 DB_PATH=<scratch>/db.sqlite PROJECTS_ROOT=<scratch>/projects \
  SETTINGS_PATH=<scratch>/settings.json SECRETS_PATH=<scratch>/secrets.json ADMIN_PASSWORD=<password> node src/server.ts
  ```
- **Guard:** `db.sqlite`, `logs/` and `projects/` appeared in the scratch folder. `backend/data/` was not used.
- **Results:**

| Request | Answer |
|---|---|
| `GET /health` | 200 |
| `GET /admin/provider-types` with the password | 200, 3547 bytes |

- **Catalogue size:** JOS-262's saved baseline of this response was 3552 bytes. That file included curl's appended status line, 5 characters (newline, `200`, newline), so the body is the same size.
- **Cleanup:** the server was stopped, and port 3263 is free.

## Step 6: E2E with Playwright, not applicable

- No frontend file and no backend runtime file changed (5.1), so the browser can't show anything different.
- JOS-262's step 7 report already covers how `/admin` renders this catalogue.

## Outcome

- Step 5 status: PASS. Step 6: not applicable, recorded here.
