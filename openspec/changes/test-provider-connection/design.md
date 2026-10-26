## Context

Provider profiles (`provider_profiles`, JOS-218) hold a stage, an adapter type from the shipped catalogue (`providerTypes.ts`), parameters and an encrypted key. Five adapter types ship, each with its vendor's host fixed in code: `openai-reasoning` (`api.openai.com`), `elevenlabs-voice` and `elevenlabs-alignment` (`api.elevenlabs.io`), `fal-image` (`fal.run`), `runninghub-video` (`www.runninghub.ai`). Keys are read by `keyFor(profileId)` in `keyStore.ts` (with the vendor fallback for seeded profiles) and must never be logged, returned or put in a message. Admin routes live in `adminProviderRoutes.ts` behind the Administrator gate. Adapters make one request per call by rule (`adapters-no-hidden-retries.test.ts`).

What each vendor offers for a check (from the vendors' API references, to be confirmed against the real keys in task 1):

| Adapter type | Candidate request | Charged | Covers |
|---|---|---|---|
| `openai-reasoning` | `GET https://api.openai.com/v1/models/{model}` | no | key and model |
| `elevenlabs-voice` | `GET https://api.elevenlabs.io/v1/voices/{voiceId}` | no | key and voice (not the model) |
| `elevenlabs-alignment` | `GET https://api.elevenlabs.io/v1/models` | no | key only |
| `fal-image` | `GET https://api.fal.ai/v1/models?endpoint_id={model}` (unconfirmed; fallback: one minimal paid generation) | no, or yes if the fallback is needed | key and model |
| `runninghub-video` | `POST https://www.runninghub.ai/uc/openapi/accountStatus` (`{"apikey"}` in the body) | no | key only (not the endpoint) |

## Goals / Non-Goals

**Goals:**

- One request per test, to the profile's own vendor host, with the stored key and current parameters.
- A result in words (connected, key rejected, model or voice not found, unreachable, unexpected answer) with what was checked.
- Cost stated before sending and enforced by the server for charged checks.
- Read-only: nothing about the profile or any record changes.

**Non-Goals:**

- Testing unsaved form values (the key would travel in one more request body; save first, then test).
- A "verified" mark on the profile (a pass is a moment, not a property; keys can be revoked later). Open to a follow-up.
- Showing the vendor balance (RunningHub's answer includes it; out of scope).
- Counting the check in usage or cost reports (it is not a stage attempt).

## Decisions

### Decision 1: Test the saved profile, by id

`POST /admin/provider-profiles/:id/test` with body `{ acceptCharge?: boolean }`. The server loads the profile, its key through `keyFor`, and its parameters; the page never sends the key. Unsaved edits are not tested: the page disables the button while the form has unsaved changes.

*Alternative:* test the form values before saving (lets the Administrator check before committing, but adds a second path that carries a key in a request body).

### Decision 2: One check per adapter type, in one module

`backend/src/providerConnectionCheck.ts` exports `CONNECTION_CHECKS: Record<adapterType, { charged: boolean; covers: string; run(parameters, key, fetchFn, signal) }>`. Each `run` sends exactly one request built from constants in the module and the profile's parameters (a model id, voice id or path validated by `providerTypes.ts`, so no host can be injected), and maps the answer:

- 2xx (and, for RunningHub, `code: 0` in the body) → `connected`;
- 401 or 403 (RunningHub: its "invalid key" code) → `key-rejected`;
- 404 on a check that looks up the model or voice → `not-found`;
- network error or the 10 s `AbortSignal.timeout` → `unreachable`;
- anything else → `unexpected` with the HTTP status only.

The raw body is parsed only to read the status fields above and is never returned. `fetchFn` is injected so tests count requests and never touch the network. A new adapter type must add an entry; a test fails if any catalogue type has none.

### Decision 3: Cost is part of the catalogue and enforced on the server

`GET /admin/provider-types` gains `connectionCheck: { charged, covers }` per type. The page shows "This check is charged by <vendor>" with a confirm step before sending a charged test. The route answers 409 `charge-not-accepted` and sends nothing when `charged` is true and `acceptCharge` is not. Free checks ignore `acceptCharge`.

### Decision 4: A test writes nothing

The route reads the profile and key and calls the check; it does not call any repository write, does not record a `provider_requests` or `stage_attempts` row and does not touch `active_providers`. The test for this compares the profile view and the row counts of those tables before and after.

### Decision 5: The response is a closed object

`{ outcome: "connected" | "key-rejected" | "not-found" | "unreachable" | "unexpected" | "no-key", covers: string, httpStatus?: number }`, declared `.strict()` like the stage diagnostics. Messages are written by the page from the outcome; the server sends no vendor text. A sentinel test stores a known key, makes the stubbed vendor echo it in its error body, and asserts it appears nowhere in the response or the logs.

### Decision 6: Fal is decided by task 1

If `api.fal.ai/v1/models` authenticates with the key (401 for a wrong key, 200 with the model for a right one), the Fal check is free and covers key and model. If not, the check is one minimal generation on the profile's model (smallest image size, one image), `charged: true`, and the page shows the profile's price per unit when one is entered (JOS-226).

## Risks / Trade-offs

- [A free endpoint may need a permission a restricted key lacks (for example ElevenLabs keys scoped without voice or model read)] → The result then says key rejected; the `covers` text and the README note that a restricted key may fail the check while still working for synthesis. Task 1 records what the real keys do.
- [A pass does not prove a stage will succeed (balance, content filters, endpoint parameters)] → `covers` states exactly what was checked; RunningHub's endpoint and ElevenLabs' voice model are named as not checked.
- [Vendor endpoints change] → Each check is a few lines in one module, covered by stubbed tests; a real-key check is part of task 1 and of the manual verification.
- [Repeated clicks on a charged check] → The button is disabled while a test is in flight, and each charged test needs its own confirmation.

## Open Questions

- Whether Fal has a free authenticated endpoint (task 1).
- Whether a passed test should mark the profile verified: answered "no" for this change (Non-Goals); revisit if the Administrator asks for it.
