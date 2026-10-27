# Step 7 Report - Manual Endpoint Testing with curl

- Date: 2026-10-26
- Change: switch-reference-image-model (JOS-230)
- Agent: Claude Sonnet 5.5

## Scope
No endpoint changes. The settings are read at start-up and no route returns them, so this step checks that the server starts with the new shipped defaults (`imageReferenceModel` `bytedance/seedream/v5/pro/edit`, image limit 300 s) and that the routes that depend on the image stage still answer. The Fal request itself is asserted by the adapter tests and checked once with the real adapter in step 9.

## Setup
`DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH` in a throwaway folder, `ADMIN_PASSWORD=curl-test-pass`, `PORT=3230`, `USE_STUB_VOICE_PROVIDER=hang` (no provider is called after a session is created). The worktree has no provider keys, so the script moderator was stubbed (always clean) by a scratch launcher outside the repository that calls `setScriptModerator` and then `startServer()`; without it `POST /sessions` answers "The content check is temporarily unavailable" (first attempt, recorded below).

## Commands and results
| # | Request | Result |
|---|---|---|
| 1 | `GET /health` | `{"ok":true}` |
| 2 | `GET /admin/provider-profiles` with the admin password | five profiles; the image profile is `Fal.ai` / `fal-image` with `{"model":"fal-ai/flux/dev"}` (unchanged: the reference model is a setting, not a profile) |
| 3 | `GET /admin/provider-profiles` with a wrong password | HTTP 401 |
| 4 | `POST /sessions` (`{"title":"JOS-230 check","script":"A short script for the check.","language":"en"}`), real moderator, no key | `{"ok":false,"reason":"The content check is temporarily unavailable..."}`; no run row (expected without a key) |
| 5 | The same `POST /sessions` with the stubbed moderator | HTTP 201, session state `submitted`, phase `voice-over` pending |

## Verification
- `sqlite3` after step 5: one run (`JOS-230 check`, language `en`), 0 scenes and 0 `provider_requests` rows, so the image stage was not started (the voice stage is held).
- The project folder `JOS-230 check 2026-10-26 21-16` was created under the throwaway `PROJECTS_ROOT`.
- Server log: no error entry; the server started with the new defaults.

## Cleanup
Server stopped (port 3230 closed), the throwaway folder is removed, `backend/data` does not exist in the worktree (unchanged).

## Outcome
- Step 7 status: PASS
- Not covered here, by design: the Fal request (adapter tests) and a real Fal call (step 9).
