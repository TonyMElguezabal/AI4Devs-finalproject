# Step 1 — Real-key check of the candidate requests (JOS-220)

Run on 2026-10-26 with the local keys (never printed) and the default settings (`gpt-6-astra`, voice `4YYIPFl9wE5c4L2eu2Gb`, `fal-ai/flux/dev`). Every request is a free lookup; one wrong key (`wrong-key-0000`) per vendor. Only the status and the body shape are recorded; no key, no balance.

| Adapter type | Request | Right key | Wrong key | Unknown model / voice |
|---|---|---|---|---|
| `openai-reasoning` | `GET api.openai.com/v1/models/{model}` | 200 `{id, object, created, owned_by, ...}` | 401 `{error:{message,type,param,code}}` | 404 same error shape |
| `elevenlabs-voice` | `GET api.elevenlabs.io/v1/voices/{voiceId}` | 200 voice object | 401 `{detail:{type,code,message,status,request_id}}` | **400**, `detail.status` = `voice_not_found` |
| `elevenlabs-alignment` | `GET api.elevenlabs.io/v1/models` | 200 array | 401 `{detail:{...}}` | — (key only) |
| `fal-image` | `GET api.fal.ai/v1/models?endpoint_id={model}` | 200 `{models:[1], next_cursor, has_more}` | 401 `{error:{type,message}}` | 404 `{error:{type,message}}` |
| `runninghub-video` | `POST www.runninghub.ai/uc/openapi/accountStatus` `{apikey}` | 200 `code: 0` (`success`) | **200**, `code: 806` (`APIKEY_USER_NOT_FOUND`), `data: null` | — (key only) |

## Findings that change the design

1. **Fal has a free authenticated check**: 200 / 401 / 404 as hoped. Decision 6 resolves to the free endpoint; no charged check ships in this change.
2. **ElevenLabs answers 400, not 404, for an unknown voice.** The mapping reads `detail.status === "voice_not_found"` on a 400 as `not-found`.
3. **RunningHub answers 200 for a wrong key.** The key is rejected when `code` is `806`; any other non-zero `code` is `unexpected`.
