# Step 4 — Select the Voice Provider and Settle the Timestamp Mechanism

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

## 4.1 — Shortlist

Only one voice-provider credential is held (`ELEVENLABS_KEY`), so — consistent with how
image and video entered this spike as decided inputs rather than open evaluations —
**ElevenLabs** is the candidate verified against §11's voice capability: complete
narration as MP3 with preconfigured voice/quality/speed, plus timestamps granular enough
to locate every script fragment.

## 4.2 — Test script

Built to exercise every structure §6.1 cuts on:

> "The sun rose slowly over the quiet hills. Birds began to sing, the wind picked up, and
> the village slowly woke to a new day. Silence followed."

- Multiple sentences (3)
- A sentence with clause boundaries: "Birds began to sing, the wind picked up, and the
  village slowly woke to a new day." (two commas, one conjunction)
- Sentences with no clause boundary at all: "The sun rose slowly over the quiet hills."
  and "Silence followed."

142 characters. Called via `POST /v1/text-to-speech/{voice_id}/with-timestamps`
(`xi-api-key` header auth, confirmed working), `model_id: eleven_multilingual_v2`.

## 4.3 — Timestamp granularity

**Character-level.** The response's `alignment` object returns
`character_start_times_seconds` / `character_end_times_seconds` for every individual
character, not per-word or per-sentence. Far finer than §6.1's sentence-boundary need.

## 4.4 — Sentence boundary locatability

Confirmed directly from the real response (voice: George, used for the first,
capability-proving call):

| Index | Char | Start (s) | End (s) |
|---|---|---|---|
| 40 | `.` (end of "...hills.") | 2.380 | 2.473 |
| 61 | `,` (clause boundary) | 4.005 | 4.122 |
| 81 | `,` (clause boundary, before "and") | 5.166 | 5.341 |
| 123 | `.` (end of "...new day.") | 7.628 | 7.802 |
| 141 | `.` (end of "Silence followed.") | 9.172 | 9.427 |

Every sentence end and every clause boundary has an exact, directly-readable timestamp.
**Native timestamps are usable in the sense §11.1 requires** — well beyond it, in fact,
since character-level granularity locates clause boundaries too, not just sentences.

## 4.5 — Which §11.1 mechanism applies

**Native timestamps.** ElevenLabs' own timestamps are used operationally; forced
alignment remains the product's declared fallback mechanism per §11.1 (still needed for
whatever the alignment-stage capability requires structurally), but is not the standing
mechanism for the chosen voice provider — native timestamps are sufficient in normal
operation.

## 4.6 — Narration voice, quality and speed

- **Voice**: **Burt Reynolds™** (`voice_id: 4YYIPFl9wE5c4L2eu2Gb`, ElevenLabs
  "professional"/licensed marketplace tier) — product owner's choice. Verified callable
  directly with no extra workspace provisioning step; re-ran the same 142-character test
  script through it and got the same character-level alignment behavior as the
  capability-proving call.
- **Quality**: `model_id: eleven_multilingual_v2`, default `output_format`
  (`mp3_44100_128`) — not overridden. `eleven_multilingual_v2` also matters for task
  group 6 (supported language list).
- **Speed**: not overridden; provider default applies (`voice_settings.speed` omitted).

## 4.7 — Provider selected

**ElevenLabs.**

## Billing note (feeds Decision 6)

ElevenLabs billing is **subscription-based**, not metered per call like RunningHub.
Account tier: **Creator** (`GET /v1/user/subscription`), quota 137,109 characters per
billing period. Both verification calls together consumed ~284 characters (~0.2% of the
period quota) — no incremental dollar cost beyond the existing subscription. Decision 6's
"account tier" provenance for this stage's future rate-limit derivation is **Creator**,
not a pay-per-request tier.

## Spend

$0 incremental (subscription already covers the quota consumed). RunningHub spend from
step 3 remains the spike's only metered cost: $2.14 of the $20 ceiling.
