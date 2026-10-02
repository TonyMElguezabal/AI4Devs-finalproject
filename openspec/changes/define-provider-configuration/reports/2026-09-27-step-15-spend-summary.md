# Step 15 — Spend Summary Against the $20 Ceiling

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

Per task 1.1's $20 ceiling (Decision 10) and task 15.7. RunningHub is the only provider
whose API itemizes real dollar cost per call (`thirdPartyConsumeMoney`); the others are
recorded as measured (token/image counts) with an estimate against published pricing
where no direct dollar figure exists.

## RunningHub (video) — itemized, exact

| Step | Calls | Cost |
|---|---|---|
| 3 (capability verification: 5s/768P, 5s/2K, 15s/768P) | 3 | $0.385 + $0.600 + $1.155 = $2.140 |
| 7 (failure-signal test + one accidental call while checking headers) | 2 | $0.385 + $0.385 = $0.770 |
| 8 (4 sequential latency samples + 3 concurrent-load samples) | 7 | $1.540 + $1.155 = $2.695 |
| **Total** | **12** | **$5.605** |

## OpenAI (decomposition) — token-measured, dollar cost estimated

No dollar figure is returned by the API; usage is in tokens. Across steps 5b, 6, 7a and
8: approximately 15 real calls, roughly 8,000-9,000 total tokens (prompt + completion +
reasoning tokens combined). Not converted to a dollar estimate here — `gpt-6-astra`'s
per-token pricing was not looked up, and the token volume is small enough that the
dollar amount is immaterial next to RunningHub's itemized cost regardless of the exact
rate.

## Fal.ai (image) — count-measured, dollar cost estimated

7 image generations across steps 5b, 7b and 8 (2 dimension checks, 1 rejection test, 4
latency samples). No dollar figure returned by the API. Published `flux/dev` pricing is
in the low cents per image; not itemized precisely here for the same reason as OpenAI —
immaterial next to RunningHub's cost.

## ElevenLabs (voice + alignment) — subscription, $0 incremental

Creator tier (137,109 chars/billing period). All TTS and forced-alignment calls across
steps 4, 6, 7b and 8 draw from the existing subscription quota, not a per-call charge.
Total characters consumed across the session is a small fraction of the period quota
(low thousands of characters against 137,109).

## Total

**$5.605 of the $20 ceiling is the only precisely itemized figure** (RunningHub).
OpenAI and Fal.ai add an unmeasured but clearly small amount on top (single-digit-cents
to low-dollars range based on call volume); ElevenLabs adds $0 incremental. The spike
remained comfortably within budget throughout, with no call ever approached the ceiling.
