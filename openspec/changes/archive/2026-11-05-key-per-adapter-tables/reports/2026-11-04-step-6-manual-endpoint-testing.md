# Step 6 Report: Manual Endpoint Testing with curl

- Date: 2026-11-04
- Change: key-per-adapter-tables
- Agent: Claude Code (Opus 5.5)

## Setup (6.1, 6.2)

- **Two runs:** one on the base commit (`origin/feature/entrega-3-JAME`, before section 2) and one on this branch.
- **Isolation:** each run had its own scratch store. Every variable was written literally:
  ```
  NODE_ENV=development PORT=3262 DB_PATH=<scratch>/<run>/db.sqlite PROJECTS_ROOT=<scratch>/<run>/projects \
  SETTINGS_PATH=<scratch>/<run>/settings.json SECRETS_PATH=<scratch>/<run>/secrets.json ADMIN_PASSWORD=<password> node src/server.ts
  ```
- **Guard:** in both runs, `db.sqlite`, `logs/` and `projects/` appeared in the scratch folder. `backend/data/` was not used.
- **Secrets:** `secrets.json` was `{}`, so no profile had a key and no request reached a vendor.

## 6.2 `GET /admin/provider-types`

```
curl -H 'Authorization: Bearer <password>' localhost:3262/admin/provider-types   → 200
diff base-provider-types.json branch-provider-types.json                         → no difference (3552 bytes)
```

The response is the same byte for byte: the same adapter types in the same order, with the same fields and the same `connectionCheck` per type.

## 6.3 `POST /admin/provider-profiles/:id/test`

Both runs called `GET /admin/provider-profiles` first, so the five seeded profiles exist.

| Request | Base | Branch |
|---|---|---|
| `Fal.ai` (no key) | 200 `{"outcome":"no-key","covers":"The key and the model were checked."}` | same |
| `RunningHub` (no key) | 200 `{"outcome":"no-key","covers":"Only the key was checked. The endpoint was not."}` | same |
| `openai-decomposition` (no key) | 200 `{"outcome":"no-key","covers":"The key and the model were checked."}` | same |
| `nope` (unknown id) | 404 `{"ok":false,"reason":"not-found"}` | same |
| `Fal.ai` without the password | 401 | same |

`diff base-connection-tests.txt branch-connection-tests.txt` shows no difference.

### Existing behaviour found along the way (not changed)

- **Symptom:** on a fresh store, the test route answers 404 for a seeded profile id until something has listed the profiles. Only the listing creates the seeded profiles; the test route reads them with `getProfile` and doesn't create them.
- **Pre-existing:** the first branch run hit this. A separate worktree of the base commit gives the same 404 for `Fal.ai` called first, so this change didn't cause it.
- **Impact:** `/admin` always lists the profiles before the Administrator can test one, so only a direct API call on a fresh store sees it.
- **Not fixed here:** this story must not change behaviour.

## 6.4 Store and cleanup

- **No data changes:** no endpoint that creates, updates or deletes data was called. The only writes were the seeded profiles in the scratch stores.
- **`backend/data/skeleton.sqlite`:** 5 profiles and 1 project folder, the same as the step 5 baseline.
- **Cleanup:** both servers are stopped (ports 3262 and 3263 are free), and the base worktree is removed.

## Outcome

- Step 6 status: PASS. The two endpoints that use the re-keyed tables answer exactly as before.
