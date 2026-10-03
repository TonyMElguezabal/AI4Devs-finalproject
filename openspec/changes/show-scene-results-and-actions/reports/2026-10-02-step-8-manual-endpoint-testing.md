# Step 8 Report - Manual Endpoint Testing

- Date: 2026-10-02
- Change: show-scene-results-and-actions (JOS-151)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-151-show-scene-results-and-actions` at `ac67472`

## Setup

The real server (`node src/server.ts`, strip-only mode) ran on port 3151 with a scratch `DB_PATH` and `PROJECTS_ROOT` inside the session scratchpad. `GET /health` answered `{"ok":true}` (200).

Two sessions were created through `POST /sessions` and paused so no provider timer ran. Scenes were then seeded with the same persistence functions the image stage uses (`createScene`, `markImageComplete`), because no real image provider is configured:

- session A, scene 1: stored `scene-1-attempt-1.png`, a real 8x8 PNG (74 bytes) copied into A's project folder, state `image-complete`
- session A, scene 2: nothing stored, state `submitted`
- session A, scene 3: stored `../<session B folder>/secret.png`, a file in session B's folder containing `OUTSIDE-SECRET` with mode `000`, so any attempt to read it would fail visibly

## Results

| # | Request | Expected | Observed |
|---|---|---|---|
| 1 | `GET /sessions/A` | scene 1 and 3 carry `result.imageUrl` as the route path; scene 2 has no `result` | scene 1: `{"imageUrl":"/sessions/A/scenes/<id1>/image"}`; scene 2: none; scene 3: `{"imageUrl":"/sessions/A/scenes/<id3>/image"}` (the raw stored paths are not in the payload) |
| 2 | `GET /sessions/A/scenes/<id1>/image` | 200, `image/png`, identical bytes | `HTTP/1.1 200 OK`, `content-type: image/png`; `cmp` against the source file reported identical |
| 3 | the same scene under session B's id | 404 | 404 `{"ok":false,"reason":"unknown scene"}` |
| 4 | scene 2 (no image) | 404 | 404 `{"ok":false,"reason":"scene has no stored image"}` |
| 5 | scene 3 (stored path escaping the folder, outside file mode `000`) | 404, outside file not read | 404 `{"ok":false,"reason":"scene has no stored image"}`; no 500 and no `OUTSIDE-SECRET` in the body, so the file was never opened |
| 6 | `POST` to the image route | not offered | 404 `Route POST:... not found` |
| 7 | `GET /docs/json` | the route documented, `get` only, no request body | `["get"]`, `requestBody` absent |

## Cleanup

- Stopped the server (pid 49080, port 3151 free afterwards).
- Removed the scratch store and projects folder (and two older scratch coverage databases left by step 7).
- Default store (`backend/data/skeleton.sqlite`): `runs` 0 and `scenes` 0 as before; `data/` has the same files as in step 7 and `projects/` is empty. The default store was not touched by this step.

## Outcome

- Step 8 status: PASS
- Blocking issues: none
- Observation (matches the design's Risks section): scene 3 still carries an `imageUrl` although its route answers 404, because `imageUrl` is present whenever a result is stored. This only affects a corrupt or stub stored value; real image-stage results always store a recognised file.
