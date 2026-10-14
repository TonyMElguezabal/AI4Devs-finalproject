# Step 1 — Moderation endpoint verification

**Change:** moderate-script-at-submission (JOS-187)
**Date:** 2026-10-14
**Branch:** `feature/jos-187-moderate-script-at-submission`

Covers tasks 1.1–1.6. Calls were made with `POST https://api.openai.com/v1/moderations` and the
local `OPENAI_KEY` (not recorded here). Test inputs were short statements of harmful intent
written for this check; they contain no operational detail.

## Decision

- **Gate passed (1.6):** all four disallowed inputs are flagged, in English and Spanish.
- **Pinned model id:** `omni-moderation-2024-09-26` (the endpoint accepts it and echoes it back in `model`).
  Without a `model` field the endpoint answers `omni-moderation-latest`, which is not a pin.
- **`MODERATION_MAX_TIME_SECONDS`:** `10`. Measured latency was 0.12–2.2 s (13 clean samples
  plus the others below), so 10 s leaves ~4x headroom over the worst sample.
- **Long scripts:** a single `input` string of ~2,200 words (AC04 script, 90 KB) is accepted.
  Design Decision 8's array branch is **not needed**; task 3.5 is skipped.

## Verdicts (pinned snapshot `omni-moderation-2024-09-26`)

| Input | HTTP | `flagged` | True categories | Latency |
|---|---|---|---|---|
| 7a drugs, English | 200 | true | `illicit` | 449 ms |
| 7a device, English | 200 | true | `illicit`, `illicit/violent`, `violence` | 909 ms |
| 7a drugs, Spanish | 200 | true | `illicit` | 409 ms |
| 7a device, Spanish | 200 | true | `illicit`, `illicit/violent`, `violence` | 1022 ms |
| Clean, English | 200 | false | — | 264 ms |
| Clean, Spanish | 200 | false | — | 415 ms |
| AC04 long script (~2,200 words) | 200 | false | — | 513 ms |

## Latency samples (clean English script, pinned snapshot)

156, 212, 142, 296, 150, 123 ms. The same input against `omni-moderation-latest`
(first run): 209, 857, 1283, 138, 142, 164 ms; its first-call cold samples reached 2172 ms.

## Notes

- Category keys include a slash (`illicit/violent`). The reason names them as returned.
- The endpoint is free and does not count toward the decomposition request cap.
