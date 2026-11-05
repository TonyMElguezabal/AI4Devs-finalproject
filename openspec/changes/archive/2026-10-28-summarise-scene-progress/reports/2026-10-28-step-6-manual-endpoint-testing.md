# Step 6 Report - Manual Endpoint Testing

- Date: 2026-10-28
- Change: summarise-scene-progress (JOS-234)
- Agent: Claude (Sonnet 5.5)

The change adds no endpoint. These checks confirm the inputs the summary derives from (`state`, `index`, `affectedStage`) are what the session read already returns.

Backend started from this worktree with `DB_PATH` and `PROJECTS_ROOT` in a scratch directory and `PORT=3234`. `POST /sessions` needs a content-check key the scratch environment lacks, so the session was a row set inserted with the scratch database's own schema: run `01ARZ3NDEKTSV4RRFFQ69G5FB0`, 14 scenes (3 done, 2 queued, 4 generating an image, 2 image ready, 1 generating a clip, 1 failed at image, 1 failed at clip). Seeded after boot, so boot recovery did not touch the in-flight states.

| Command | Response |
|---|---|
| `GET /sessions/01ARZ3NDEKTSV4RRFFQ69G5FB0` | 200, keys `session` and `scenes`; scenes 1-3 `chunk-complete`, 4-5 `submitted`, 6-8 and 11 `image-generating`, 9-10 `image-complete`, 12 `video-generating`, 13 `failed` with `affectedStage` `image`, 14 `failed` with `affectedStage` `video` |
| `GET /sessions/01ARZ3NDEKTSV4RRFFQ69G5FAV` (well-formed, unknown) | 404 (the page shows its "No session was found" message, unchanged) |

Database state: only the scratch database was written; it is deleted after the E2E group. No shared database was opened.

Outcome: PASS
