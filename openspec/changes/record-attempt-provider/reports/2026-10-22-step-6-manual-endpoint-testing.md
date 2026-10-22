# Step 6 report: manual endpoint testing (JOS-222)

Two real servers on scratch copies of one store (`DB_PATH` and `PROJECTS_ROOT` outside the repo, ports 3201 and 3202): the **old** code (merge commit `b19e59fe`, before migration 21) and the **new** code (this branch).

## Setup
- The pre-change store was built with the old code and a scratch seed script (kept outside the repo): one session, scene 1 bound to the image and clip providers (image attempt 1, clip attempts 1-2), scene 2 bound to the image provider only (image attempt 1, clip attempt 1). `schema_migrations` max version 20; `provider_requests` has no `provider_id`.
- `POST /sessions` needs the script-moderation key (`503 The content check is temporarily unavailable`), as in earlier changes. So the session was seeded through the store functions instead of the endpoint, and the clip stage was not driven end to end (see Deviations).

## 6.1 Upgrade and backfill
Start-up of the new server on a copy of the pre-change store: `schema_migrations` max version 21. Backfilled `provider_id` per row (before: column absent):

| scene | stage | attempt | provider_id |
|---|---|---|---|
| 1 | image | 1 | `fal-ai/flux/dev` |
| 1 | video | 1, 2 | `/openapi/v2/minimax/hailuo-h3/image-to-video` |
| 2 | image | 1 | `fal-ai/flux/dev` |
| 2 | video | 1 | empty (no clip binding) |

## 6.2 New attempts
- On start-up both servers resume the two image-complete scenes; the new server's resumed image attempts carry `fal-ai/flux/dev` (orchestrator path, no code in the callers changed).
- A clip and an image attempt recorded with the new code after binding scene 2's clip provider carry that clip provider and `fal-ai/flux/dev`.

## 6.3 Session read before and after (AC4)
`GET /sessions/01JSEED0000000000000000001` on the old and the new server: after sorting keys the only differences are two `updatedAt` timestamps (milliseconds apart). Stage diagnostics (providers and attempt counts) are identical.

## 6.4 Unknown session
Both servers: `404 {"error":"session not found"}` for a well-formed unknown id.

## 7.1 Frontend
Not applicable: no frontend or API change.

## Deviations
- The clip stage was not driven through `POST /sessions`; clip attempts were recorded through `insertProviderRequest` against the upgraded store (the same function every orchestrator clip write calls).

## Cleanup
Servers stopped; scratch store, projects folder and the old-code worktree removed. No `backend/data` in the repo.

## Outcome
- Step 6 status: PASS (with the deviation above)
