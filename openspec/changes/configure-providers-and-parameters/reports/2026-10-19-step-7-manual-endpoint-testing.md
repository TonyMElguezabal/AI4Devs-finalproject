# Step 7: manual endpoint testing (JOS-174, configure-providers-and-parameters)

Date: 2026-10-19. The real `node src/server.ts` of this branch on `127.0.0.1:3174`, driven with `curl`.

## Setup

- Environment cleared (`env -i`, only `PATH` and `HOME`), so no provider credential could be read. A scratch `DB_PATH` and `PROJECTS_ROOT`, and a scratch `SETTINGS_PATH` for each run. The default store was never used (`backend/data/` does not exist in this worktree).
- `USE_STUB_VOICE_PROVIDER=not-retryable-failure`, so a created session fails its voice stage at once and nothing leaves the machine.
- `POST /sessions` runs a content check that needs an OpenAI credential. A scratch-only preload (`node --import`, kept outside the repository) makes that check answer "clean". The server code itself ran unchanged.

## Results

| Step | Settings | Result |
| --- | --- | --- |
| 7.1 | no override | `GET /health` 200 `{"ok":true}`. `GET /languages` returns English and Spanish. Boot log limits: decomposition 50, image 200, voice 3, alignment 2, video 3. |
| 7.2 | override: languages `[en]`, video cap 1 | `GET /languages` returns English only. `POST /sessions` with `es` 400 (`body/language Invalid enum value. Expected 'en', received 'es'`). With `en` 201. Boot log video `limit: 1`. |
| 7.3 | override with three problems: video minimum 6 with a lower bound of 5, an unknown `openaiApiKey` holding a fake value, an empty language list | Exit code 1 and no `listening on` line. The port refused connections. All three problems were printed: `languages: must have at least 1 item(s)`, `openaiApiKey: unknown setting`, `segmentation.lowerBoundSeconds: must not be shorter than video.admittedDurationSeconds.min`. The fake value appears nowhere in the output. |
| 7.4 | override edited while the server ran | `GET /languages` still English only, `POST` with `es` still 400, `en` 201. After a restart: English and Spanish, and `POST` with `es` 201. |

The `es` rejection message comes from the request validation of the `language` field and quotes the value the caller sent. It is not part of the settings problem list, which never prints a value.

## 7.5 Clean-up

The three sessions created (two `en`, one `es`) lived only in the scratch store. The store, its project folders, the scratch home and the override files were deleted. Port 3174 is free, no server is running, `backend/data/` still does not exist and `git status` is clean.
