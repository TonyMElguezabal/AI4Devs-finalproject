# Step 11: manual endpoint testing (JOS-198, redesign-visual-design)

Date: 2026-10-14. This change adds and changes no endpoint. The check is that the frontend still reads the same contract.

## Environment

The real backend app (`buildApp`) on `127.0.0.1:3199`, started from a scratch-only harness kept outside the repo: it installs a "clean" script moderator (so `POST /sessions` does not call a provider), a hanging voice stub, a pending video stub and the success assembly stub, and `ALLOW_TEST_ENDPOINTS=1` for the existing test endpoints. Environment cleared (`env -i`), no credentials, scratch `DB_PATH` and `PROJECTS_ROOT`. Nothing reached a real provider.

## Requests

| Request | Result |
| --- | --- |
| `GET /health` | 200 `{"ok":true}` |
| `GET /languages` | 200 `[{"code":"en","label":"English"},{"code":"es","label":"Español"}]` |
| `POST /sessions` (title, script, language `en`) | 201; session `state: "submitted"`, four `phases` all `pending`, `createdAt` present, `scenes: []` |
| `POST /sessions/:id/pause`, `POST /sessions/:id/continue` | used by the browser run; the page followed each live |
| `POST /sessions/:id/decomposition/retry` on a session with a seeded failure and no attempt | 409; the page showed "A retry is already waiting or running." in the failure callout (a refusal, not a regression) |

`createdAt` is on the session payload and documented in `docs/api-spec.yml`, so the "Started …" line needs no API change; `frontend/src/types.ts` now declares it.

## Cleanup

The harness and scratch store were removed. No `backend/data/` exists in the worktree. Nothing was created, updated or deleted outside the scratch store.
