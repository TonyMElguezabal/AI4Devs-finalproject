# Step 5b — Verify the Image Provider, Verify the Reasoning Provider, Close Out Group 5

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

Continues from `reports/2026-09-27-step-5a-alignment-provider-verification.md` (5.1, 5.2).

## 5.3 — Image provider (Fal.ai)

Already-decided provider (credential held, per step-1 report). Verified via
`POST https://fal.run/fal-ai/flux/dev` (`Authorization: Key <FAL_API_KEY>`), model
`fal-ai/flux/dev`, requesting a custom `image_size`.

**Finding — the model rounds dimensions to multiples of 16, so an exact 1920×1080
request silently falls short of the minimum:**

| Requested | Returned |
|---|---|
| `{width: 1920, height: 1080}` | **1920 × 1072** — 8px under §7.1's stated minimum |
| `{width: 1920, height: 1088}` | 1920 × 1088 — clears the minimum |

**Recorded value: request `{width: 1920, height: 1088}`**, the smallest 16-aligned height
that satisfies "minimum 1920×1080." Aspect ratio is then 1.765:1, not exactly 16:9
(1.778:1) — a <1% deviation, noted rather than treated as a blocker.

Output format (JPEG, public HTTPS URL on `fal.media`) matches what RunningHub's
`firstFrameUrl` field already accepted in step 3 — confirmed compatible by format/URL
shape; not re-verified with another paid RunningHub call, since that path was already
proven working with an equivalent external image URL.

## 5.4 / 5.5 — Reasoning provider (OpenAI)

Step-1 report recorded the reasoning candidate as "OpenAI (model TBD)," blocked on a key
existing at all. Key now present; queried `GET /v1/models` directly (not trusting
secondhand web results — one search result claiming "GPT-6 Astra" looked suspicious
until confirmed against the real account's model list) and found `gpt-6-astra` genuinely
available, alongside `gpt-6-luna`/`gpt-6-sol` and the `gpt-5.x` line. Selected
`gpt-6-astra` as the flagship candidate to test against §11's reasoning capability.

**Test**: reused the task-4.2 three-sentence script. Prompted the model (system + user
message, `response_format: json_object`) to split it into chunks strictly at sentence
boundaries, preserve every chunk's `prompt` field as an exact verbatim substring (no
paraphrase, no drop, no duplication), and generate an `image` + `video` instruction per
chunk.

**Result**: 3 chunks, cut exactly at each sentence boundary (including trailing
whitespace preserved faithfully). Rejoining the three `prompt` fields in order reproduces
the original 142-character script **exactly, character-for-character** (programmatically
diffed — zero divergence). `image`/`video` fields were coherent per-chunk visual
instructions. Cost: 554 tokens total (199 prompt + 355 completion, incl. 130 reasoning
tokens) — negligible.

**Not tested in this spike**: §6.1's clause-boundary-split exception (a sentence whose
narration alone would exceed the upper duration bound gets split at a comma/semicolon/
conjunction) and the §6.1.1 edge case (a short sentence forcing the *next* sentence to
split). Both require combining real per-character timestamps with the now-known real
duration bounds (5–15s from step 3) in a longer, more deliberately engineered test
script. This is an implementation-level integration concern for US-09's TDD suite, not a
provider-capability question this spike needs to resolve — the capability being verified
here (faithful sentence-boundary splitting, zero content drift, structured visual-
instruction output) is confirmed.

## 5.6 — Providers selected

| Stage | Provider | Rejected candidates |
|---|---|---|
| Alignment | ElevenLabs (`/v1/forced-alignment`) | None — no other credential held |
| Image | Fal.ai (`fal-ai/flux/dev`, `{width:1920, height:1088}`) | None — already decided, credential held; verified rather than re-evaluated |
| Reasoning | OpenAI (`gpt-6-astra`) | None — only reasoning credential held (`OPENAI_KEY`); no alternative candidate had a key to compare against, consistent with the step-1 report's blocker |

## Spend

- Fal.ai: 2 image generations (1920×1080 attempt + 1920×1088 confirmation) — cost not
  itemized per-call by the API response; negligible per FLUX.1 [dev] published pricing
  (cents-per-image tier).
- OpenAI: 554 tokens on one `gpt-6-astra` call — negligible.
- ElevenLabs: subscription-covered, no incremental cost.
- Running total against the $20 ceiling: **$2.14** (RunningHub, step 3) + negligible
  Fal.ai/OpenAI amounts not yet itemized in dollars.
