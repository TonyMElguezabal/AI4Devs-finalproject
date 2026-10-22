# Step 10: manual endpoint testing (JOS-172, move-failed-stage-to-active-provider)

Date: 2026-10-22. Branch `feature/jos-172-move-failed-stage`. The real server (`buildApp`, the real routes, SQLite, retry scheduler and recovery) ran on a scratch store, projects folder and key file, on port 3192 (3100 was in use by another process and was left alone), with `ADMIN_PASSWORD` set. A small launcher (`step-10-launcher.ts.txt` in this folder, import paths made relative) registered two stub adapters per stage: `stub-a` fails or succeeds as a mode file says, per stage; `stub-b` always succeeds; every call is appended to a log. Retry delays were shortened to 0.2 s. Every video provider other than `stub-a` (`stub-b` and any profile added on `/admin`) was served by a succeeding stub through a registry proxy.

## 10.2 Without Administrator access

`GET /admin/failed-stages` and `POST /admin/failed-stages/to-active-provider` without the header: 401 `password-required`. Nothing changed.

## 10.3 Five kinds of failed stage

Five sessions were created, one with each stage failing on `stub-a` (retries exhausted, so each carried a failure the User may retry, or failed scenes): "S voice", "S alignment", "S reasoning", "S image" (both scenes failed at the image) and "S video" (both clips failed). While every active provider was still `stub-a`, `GET /admin/failed-stages` returned `[]`. After `PUT /admin/providers/{stage}` set every active provider to `stub-b`, it listed 7 rows: voice, alignment, reasoning, image scene 1, image scene 2, video scene 1, video scene 2, each `stub-a -> stub-b` with its cause.

## 10.4 Move, then retry

- All seven moves returned 200 with `providerId: "stub-b"`. Afterwards no call had reached `stub-b` (0 in the call log) and the number of attempt rows was unchanged (15 and 15); the sessions' failures were still present and the failed scenes still `failed`. The bindings read `stub-b` for the moved stages; the list was empty.
- Then the existing retry routes were called: `POST /sessions/{id}/voice-over/retry`, `.../decomposition/retry` (alignment and reasoning) and `.../scenes/{id}/retry` (the four scenes). All answered 200. The call log since the moves shows only `stub-b` calls (voice 1, alignment 2, reasoning 3, image 8, video 10) and none to `stub-a`. Every session ended with no failure and its scenes `chunk-complete`.
- The attempt rows keep their history: for "S voice", four attempts recorded `stub-a` (`initial` and three `automatic`) and the manual one records `stub-b`; "S alignment" has `timestamps stub-a transient` then `timestamps stub-b manual success`; "S reasoning" has `decomposition stub-a transient` then `decomposition stub-b manual success`.

## 10.5 A clip's duration chosen again

"S clip" was created with its clips failing on `stub-a` (active video provider set back to `stub-a`): scene 1 interval 0.0 to 7.35 s, requested 7 s, factor 1.05; scene 2 interval 7.35 to 16.97 s, requested 10 s, factor 1.04. A video provider "Short clips" admitting 5 to 7 s was added with a key and made active. `POST .../to-active-provider` for scene 2: 200 with `requestedDurationSeconds: 7`. In the store scene 2 then read requested 7 s, factor 1.374, warning `exceeds-maximum`, the same interval (7.35 to 16.97 s), the new provider id; scene 1 was untouched. `GET /sessions/{id}` returned the same values. Directly updating `requested_duration_seconds` or `speed_factor` in the SQLite file was refused: `locked: scenes.requested_duration_seconds cannot be modified once the chunk is established` (and the `speed_factor` equivalent).

## 10.6 Refusals

| Request | Answer |
| --- | --- |
| move scene 2 again (already on the active provider) | 409 `already-on-active` |
| unknown scene; unknown session | 404 `not-found` |
| `video` without `sceneId`; `voice` with a `sceneId` | 400 validation errors naming `sceneId` |
| scene 1 listed, retried by the User, then moved | the retry completed the clip; the move answered 409 `not-failed` and the binding stayed `stub-a` |

The `not-usable` refusal (an active provider whose key cannot be found) could not be produced through the API, because `/admin` refuses to make such a provider active (JOS-218); it is covered by `move-failed-stage.test.ts`.

## 10.7 Restart and clean-up

After stopping and starting the server on the same store, the bindings were as left (`stub-a` for the untouched scene 1, the "Short clips" id for the moved scene 2) and `GET /admin/failed-stages` was empty. My one-line check of the durations after the restart failed on a missing `durationWarning` key (the API omits it when there is none), and the scratch store had been deleted before I re-ran it, so the re-chosen values were checked before the restart (10.5) and by the store tests, not again after it. The server was stopped, the scratch folder (store, projects, key file, logs, call log) was deleted, port 3192 is free, `backend/data/` does not exist and no `.secrets.json` was created.
