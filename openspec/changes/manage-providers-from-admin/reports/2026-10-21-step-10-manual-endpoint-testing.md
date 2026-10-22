# Step 10: manual endpoint testing (JOS-218, manage-providers-from-admin)

Date: 2026-10-21. Branch `feature/jos-218-manage-providers-from-admin`. The real server (`buildApp`, the real routes, SQLite, retry scheduler and recovery) ran on a scratch store, scratch projects folder and scratch `PROVIDER_KEY_PATH`, on port 3190 (port 3100 was in use by another process and was left alone), with `ADMIN_PASSWORD` and `FAL_API_KEY` set in the environment. A small launcher (`step-10-launcher.ts.txt` in this folder, a copy of the scratch file with its import paths made relative) kept the **real image adapter** and the real provider profiles and key store, and only intercepted the network: every vendor request was recorded with its URL and its `Authorization` header, and the image host answered `ok` or `fail` as a mode file said. The voice, reasoning and alignment stages and the assembly were stubs; every video profile was served by one stub through a registry proxy, so a profile added on `/admin` could be chosen.

## 10.2 The upgrade

1. With `FAL_API_KEY` in the environment and the failing network, Session "Old A" ran on this build: both scenes bound `provider = Fal.ai` and failed after four attempts; every request went to `https://fal.run/fal-ai/flux/dev` with `Key env-fal-key-0001`.
2. The server was stopped and the store was made to look like one from before this change: `DROP TABLE provider_profiles` and the migration 19 row deleted (migrations at 18).
3. First start after the upgrade: migration 19 applied; `provider_profiles` holds five profiles with the stored ids (`openai-decomposition`, `ElevenLabs`, `elevenlabs-forced-alignment`, `Fal.ai`, `RunningHub`), no key is stored (0 rows with a key), and `GET /admin/provider-profiles` shows the image profile `keyStatus: "environment"` and usable, the other four `missing`.
4. The network answered `ok` and `POST .../scenes/{id}/retry` was sent for Old A's scene 1: the request went to `https://fal.run/fal-ai/flux/dev` with the environment key through the seeded `Fal.ai` profile, the image completed (`chunk-complete`, still bound to `Fal.ai`) and the clip followed.

## 10.3 Without Administrator access

`GET /admin/provider-types`, `GET` and `POST /admin/provider-profiles`, `PUT` and `DELETE /admin/provider-profiles/Fal.ai` without the header: 401 `password-required`; with a wrong password 401 `wrong-password`. The store was unchanged.

## 10.4 Add, edit, activate

- `POST /admin/provider-profiles` for an image profile "Flux pro" with the key `sk-added-1234567890wxyz`: 201 with `keyStatus: "stored"`, `keyHint: "wxyz"`, `usable: true`.
- The full key appears in no response (`GET /admin/provider-profiles` checked), in the SQLite file and its WAL, in any of the four server logs, or in the recorded network log before its first use.
- `PUT` changed the model to `fal-ai/flux-pro-v2` and left the key (`keyStatus: "stored"`, hint `wxyz`) because no `apiKey` was sent.
- `PUT /admin/providers/image` with the new id: 200, `source: "admin"`.
- Session B was started while the image network failed: its scenes bound to the new id, and all eight recorded requests went to `https://fal.run/fal-ai/flux-pro-v2` with `Key sk-added-1234567890wxyz`.
- Choosing a video profile that has no key was refused: 409 `not-usable` with `apiKey: no API key is stored or found for this provider`; after its key was entered the choice was accepted.

## 10.5 Delete

| Request | Answer |
| --- | --- |
| delete the active image profile | 409 `{"reason":"active","stage":"image"}` |
| switch the active image provider back to `Fal.ai`, then delete "Flux pro" (Session B's scenes are bound to it) | 200 `{"result":"retired"}`; it is listed `retired: true` and the selectable image providers are only `["Fal.ai"]` |
| network `ok`, manual retry of Session B's scene 1 | the request went to `https://fal.run/fal-ai/flux-pro-v2` with `Key sk-added-1234567890wxyz` (the retired profile's parameters and key) and the scene completed, still bound to the retired profile |
| add a profile "Temp" and delete it | 200 `{"result":"removed"}` |

## 10.6 The admitted-duration rule

Session C was registered while image requests failed, so its two scenes (requested 7 s and 10 s) were unbound for video. A video profile "Short clips" (admitted 5 to 7 s) was added, given a key and made active. With the network `ok`, the manual retry of the 10 s scene completed its image and the video stage failed it **before binding**: `video_provider` stayed empty and `last_error` read "the requested duration of 10 s is not admitted by the Short clips video provider (5 to 7 s); switch the active video provider back and retry (not retryable)".

Switching back to `RunningHub` was refused (409 `not-usable`) because the video profile created from the settings had no key in this environment (no `RUNNINGHUB_API_KEY`). Entering the key on `/admin` (`PUT`, 200) allowed the switch (200), and the retry then completed: `chunk-complete`, `video_provider = RunningHub`.

## 10.7 Restart

After stopping and starting the server on the same store: the seven profiles (five seeded, "Flux pro" retired, "Short clips") with their key statuses and hints, and the active providers (`image Fal.ai` and `video RunningHub` from `/admin`, the other three from the settings) were all as left.

## 10.8 Clean-up

The server was stopped, the scratch folder (store, projects, key file, logs) was deleted and port 3190 is free. `backend/data/` does not exist in the checkout, so the default store was untouched, and no `.secrets.json` was created.

Findings (not defects of this change): (1) the launcher's registry proxy has no labels, so the choices showed the profile id as the label in this run only; with the real registries the label shows (covered by `provider-registries.test.ts`). (2) A provider created from the settings that relies on a key nobody entered cannot be chosen as active, by design (Decision 6); the message names the missing key.
