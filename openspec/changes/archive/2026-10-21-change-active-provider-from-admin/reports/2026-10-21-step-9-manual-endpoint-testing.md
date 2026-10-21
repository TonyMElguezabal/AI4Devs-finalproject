# Step 9: manual endpoint testing (JOS-171, change-active-provider-from-admin)

Date: 2026-10-21. Branch `feature/jos-171-change-active-provider`. The real server (`buildApp`, the real routes, SQLite, retry scheduler and recovery) ran on a scratch store and scratch projects folder in the session scratchpad, on port 3171, with `ADMIN_PASSWORD` set in the environment. Two stub adapters per stage (`stub-a` the default, `stub-b`) were registered through the registry seams by a small launcher (`step-9-launcher.ts.txt` in this folder, a copy of the scratch file; its import paths are relative to the repository). The launcher also stubs the script moderation, installs the stub assembly tool and shortens the retry delays to 0.2 s. Stub `stub-a` of the video stage was set to `transient-failure` for the run that needed an exhausted retry cycle.

## 9.2 Without Administrator access

| Request | Answer | Store |
| --- | --- | --- |
| `GET /admin/providers`, no header | 401 `{"ok":false,"reason":"password-required"}` | |
| `PUT /admin/providers/video {"providerId":"stub-b"}`, no header | 401 `password-required` | `active_providers`: 0 rows |
| `PUT /admin/providers/video`, wrong password | 401 `wrong-password` | unchanged |

## 9.3 With Administrator access

- `GET /admin/providers`: five stages, each `source: settings`, each listing `[<default>, stub-b]` (reasoning `openai-decomposition`, voice `stub-a`, alignment `elevenlabs-forced-alignment`, image `stub-a`, video `stub-a`).
- `PUT /admin/providers/video {"providerId":"stub-b"}`: 200, `activeProviderId: "stub-b"`, `source: "admin"`.
- `PUT ... {"providerId":"acme"}`: 400 `{"ok":false,"reason":"not-selectable","selectable":["stub-a","stub-b"]}`.
- `PUT /admin/providers/captions`: 400 (the validation error naming the five stages).
- After these calls the table held one row, `video=stub-b`.

## 9.4 Sessions before and after the change, and a restart

Video was set to `stub-a`, video `stub-a` was made to fail transiently, and sessions were started with `POST /sessions` (voice, timestamps by alignment, decomposition, two images, two clips, assembly all ran by themselves).

| Step | Result |
| --- | --- |
| Session A, started while video was `stub-a` | both scenes bound `video_provider = stub-a`; each clip had 4 transient attempts (a forced retry cycle) and ended `failed` |
| `PUT /admin/providers/video stub-b` | 200 |
| Session B, started after the change | both scenes `chunk-complete`, `video_provider = stub-b` |
| `POST /sessions/A/scenes/{scene 1}/retry` (manual retry of A after the change) | `{"ok":true}`; the scene went through 4 attempts again on `stub-a` and ended `failed` with `video_provider = stub-a`. Had it gone to `stub-b` it would have completed. |
| Server stopped and started again on the same store | `GET /admin/providers` still shows video `stub-b`, `source: admin` |
| Session C, started after the restart | both scenes `chunk-complete` on `stub-b` |

All five stages were then switched to `stub-b` and Session D started: its run row held `voice_provider_id = stub-b`, `decomposition_provider_id = stub-b`, `alignment_provider_id = stub-b`; its scenes `provider = stub-b` and `video_provider = stub-b`; its `voice-over`, `timestamps` and `decomposition` attempts were recorded with `stub-b`. Sessions A, B and C kept `stub-a`, `openai-decomposition` and `elevenlabs-forced-alignment` for the stages they had bound before.

## 9.5 Clean-up

The server was stopped and the scratch store and folder (with the sessions, the attempts and the `active_providers` rows) were deleted. `backend/data/` does not exist in the checkout, so the default store was untouched, and no `.secrets.json` was created.

Finding while setting this up (not a defect of this change): the stub voice provider's `success` mode returns native timestamps for a fixed text, so a real script fails the native check; the run used `success-without-timestamps` with a 17 s narration so the alignment stub's timings fit.
