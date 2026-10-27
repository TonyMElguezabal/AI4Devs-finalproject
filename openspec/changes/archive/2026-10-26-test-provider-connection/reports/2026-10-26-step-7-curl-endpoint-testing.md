# Step 7 Report - Curl Endpoint Testing

- Date: 2026-10-26
- Change: test-provider-connection (JOS-220)
- Agent: Claude

## Setup
- Backend started from this worktree on port 3199 with `ADMIN_PASSWORD=step7-test-password` and throwaway `DB_PATH`, `PROJECTS_ROOT` and `PROVIDER_KEY_PATH` (`mktemp -d`); no developer data was opened.
- The real vendor keys were read from the local secrets file by a script and stored on the five seeded profiles through `PUT /admin/provider-profiles/:id`. No key is printed below; the server log and the output were searched for the Fal key: 0 matches.
- Calls were made with a script using `fetch` (same requests as `curl -X POST -H "Authorization: Bearer <password>" -d '{}' http://127.0.0.1:3199/admin/provider-profiles/<id>/test`). After every call the full `GET /admin/provider-profiles` view was compared with the one taken before it.

## Responses (keys redacted by construction)

| Call | Status | Body | Profile unchanged |
|---|---|---|---|
| `openai-decomposition`, valid key | 200 | `{"outcome":"connected","covers":"The key and the model were checked."}` | yes |
| `ElevenLabs`, valid key | 200 | `{"outcome":"connected","covers":"The key and the voice were checked. The voice model was not."}` | yes |
| `elevenlabs-forced-alignment`, valid key | 200 | `{"outcome":"connected","covers":"Only the key was checked. The endpoint was not."}` | yes |
| `Fal.ai`, valid key | 200 | `{"outcome":"connected","covers":"The key and the model were checked."}` | yes |
| `RunningHub`, valid key | 200 | `{"outcome":"connected","covers":"Only the key was checked. The endpoint was not."}` | yes |
| Fal profile, wrong key | 200 | `{"outcome":"key-rejected", ...}` | yes |
| Fal profile, unknown model `fal-ai/no-such-model` | 200 | `{"outcome":"not-found", ...}` | yes |
| Fal profile, no key | 200 | `{"outcome":"no-key", ...}` (no vendor request) | yes |
| Unknown profile id | 404 | `{"ok":false,"reason":"not-found"}` | n/a |
| No password | 401 | `{"ok":false,"reason":"password-required"}` | n/a |
| Wrong password | 401 | `{"ok":false,"reason":"wrong-password"}` | n/a |

`GET /admin/provider-types` returns `connectionCheck.charged = false` for all five types.

## Not exercised live
- A charged type without `acceptCharge` (409 `charge-not-accepted`): no shipped adapter type has a charged check (design Decision 6), so it cannot be reached by a real call. It is covered by the route test that sets `charged` on one entry.

## Data folder
- The data folder was the throwaway directory; the server was stopped afterwards. Nothing to restore.

## Outcome
- Step 7 status: PASS
- Blocking issues: none
