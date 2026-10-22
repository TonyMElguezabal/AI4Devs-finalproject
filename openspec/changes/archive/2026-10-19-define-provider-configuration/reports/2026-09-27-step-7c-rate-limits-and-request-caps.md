# Step 7c — Rate Limits and Per-Stage Request Caps

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

## 7.4 — Rate limit and account tier per provider

| Provider | Stage(s) | Limit found | Account tier | Source |
|---|---|---|---|---|
| OpenAI | Reasoning | 500 requests/min, 500,000 tokens/min | (tier not separately named; limit read directly from response headers) | `x-ratelimit-*` response headers on a real call |
| Fal.ai | Image | 2000 (window unit not specified) | (not separately named) | `x-ratelimit-*` response headers |
| ElevenLabs | Voice, Alignment | 137,109 characters/billing period (a consumption quota, not a request-rate limit) | **Creator** | `GET /v1/user/subscription` |
| RunningHub | Video | **Not found** — no numeric concurrency/rate limit in public docs or account endpoint | `apiType: SHARED` (per `POST /uc/openapi/accountStatus`), balance $47.39 remaining | Account status endpoint |

**Fal.ai caveat**: the rate-limit header gives a number (2000) but not its time window (per
minute? per day?) — RunningHub's headers had the same gap. Recorded as-is rather than
guessed.

**RunningHub caveat**: `apiType: SHARED` is the only tier signal found; it implies this
key draws from a shared capacity pool rather than a dedicated one, which likely means a
*lower* effective concurrency ceiling than a dedicated tier would have, but no number
backs that up. Empirically probing it (firing several concurrent calls to find where
`QUEUED` status kicks in) was considered and **deliberately deferred** — real cost
(~$0.39/call), and the product owner chose to record this as undocumented rather than
spend further to discover it this session.

## 7.5 — Derived maximum simultaneous requests per stage

Per Decision 6, a cap is derived from the measured limit with headroom for the 1+3 retry
budget — never a round number invented without a limit behind it. Where no real limit is
known, no cap is invented either (per Decision 6's own rejection of "picking a
conservative round number... it hides whether the constraint is the provider or the
guess").

| Stage | Provider | Derivation | Recorded cap |
|---|---|---|---|
| Reasoning | OpenAI | 500 req/min ÷ 10 (headroom factor) = 50; even a full retry storm (50 × 4 attempts = 200) stays well under 500 | **50** (provisional — group 8's latency data may refine the headroom factor once actual request duration is known) |
| Image | Fal.ai | 2000 ÷ 10 = 200 — **provisional on the unconfirmed time window**; if the window turns out to be per-day rather than per-minute, this cap would be far too generous | **200** (provisional, window-dependent) |
| Voice + Alignment | ElevenLabs (shared account, see 7.5a) | No request-rate number to derive a concurrency cap from; the real constraint is the shared character quota | **Not derived** — open item |
| Video | RunningHub | No rate limit found | **Not derived** — open item, deferred per product owner's choice above |

## 7.5a — Shared-account stages

Task 1.2a checked only image/video for shared-account status (found: not shared, Fal.ai
and RunningHub are unrelated providers). **This spike independently found a second
shared-account case not covered by 1.2a**: voice and alignment both landed on
**ElevenLabs** (steps 4 and 5a), meaning they draw from the same account and the same
137,109-character quota — not two independent budgets. Any future concurrency/consumption
cap for these two stages must be derived **jointly** against that one shared quota, per
7.5a's principle, even though 1.2a's original check didn't anticipate this pairing.

## 7.6 — Derivation recorded, not just the numbers

Done inline in the tables above: each cap states its formula and inputs, not just a bare
result, so it can be re-checked when a tier or headroom assumption changes (Fal.ai's
unconfirmed window unit and RunningHub's missing limit are the two open dependencies).

## Note: an avoidable cost during this task

One RunningHub call in this group ($0.385) was made by mistake — intended only to inspect
response headers for a rate-limit field, it accidentally submitted a full billed video
generation instead of using a free/cheap endpoint. No rate-limit header was present in
the response anyway, so the spend produced no information; account status was instead
obtained via `POST /uc/openapi/accountStatus`, which costs nothing.

## Spend

1 unplanned RunningHub call: $0.385. **Running total: $2.91 of the $20 ceiling.**
