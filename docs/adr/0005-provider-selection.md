# ADR 0005 — Provider selection and hardcoded operating parameters

- Status: Accepted
- Date: 2026-09-27
- Change: `define-provider-configuration` (JOS-165, US-33)

## Context

PRD §11 requires one provider per stage — reasoning/decomposition, voice, alignment,
image, video — each checked against a stated capability, plus a full set of hardcoded
generation parameters the section names but leaves blank. This is the first change in
the project to call a real third-party provider with real money; every prior change ran
against the stubbed provider from `define-backend-stack`. Recorded unconditionally per
Decision 11 (design.md), including rejected candidates, since five provider choices with
cost/capability trade-offs are exactly what a later reader needs the reasoning for.

Full evidence lives under `openspec/changes/define-provider-configuration/reports/`
(steps 1, 3-9, 12-13). This ADR is the consolidated decision record, not a restatement of
every test.

## Decision

**Providers selected:**

| Stage | Provider | Identifier |
|---|---|---|
| Decomposition (reasoning) | OpenAI | `gpt-6-astra` |
| Voice | ElevenLabs | `eleven_multilingual_v2`, voice `Burt Reynolds™` (`4YYIPFl9wE5c4L2eu2Gb`) |
| Alignment | ElevenLabs | `/v1/forced-alignment` — **same account as voice** (task 7.5a) |
| Image | Fal.ai | `fal-ai/flux/dev` |
| Video | RunningHub | `/openapi/v2/minimax/hailuo-h3/image-to-video` (MiniMax-H3 "Hailuo-03") |

**Rejected candidates: none.** Image and video entered this spike already decided by the
product owner (credentials already held); this change verified rather than re-evaluated
them (step-1 report). Voice, alignment and reasoning each had exactly one credentialed
candidate — no alternative had a key to compare against, so none was rejected in favor of
another; each was accepted on passing its own capability check, not chosen over a
competitor.

## Decision 1 — Video provider capability and derived duration bounds

RunningHub's Hailuo-H3 model was verified by real calls (not documentation, per Decision
2), animating a 16:9 reference image at both ends of its claimed duration range: **5s and
15s, both honored almost exactly.** These become the segmentation lower and upper bounds
(§6.1) by construction — the lower bound exists specifically to match the video
provider's minimum.

Neither of its two resolution tiers matches D08's target natively (`768P`→1344×768@24fps;
`2K`→2560×1440@24fps, vs. the expected 1920×1080@30fps). Generation is set to the **2K**
tier deliberately, so the final-assembly stage (`define-media-assembly`, JOS-182)
downscales rather than upscales when normalizing to D08's target — a new, concrete
requirement handed to that change, confirmed necessary rather than assumed.

*Alternative considered:* using `768P` to save cost. Rejected — its resolution is below
D08's target in a dimension no downstream processing can safely restore (upscaling loses
quality that downscaling from 2K preserves).

## Decision 2 — Voice/alignment timestamp mechanism (§11.1)

ElevenLabs returns **character-level** native timestamps — confirmed by a real call
against a script containing every structure §6.1 cuts on (multiple sentences, a
clause-boundary sentence, sentences with none). Every sentence boundary and clause
boundary had an exact, directly readable timestamp. **Native timestamps are the
mechanism used in practice**; forced alignment (also ElevenLabs, same account) remains
§11.1's declared fallback, not the standing mechanism.

**Caveat recorded, not resolved here**: raw forced-alignment output does not itself form
the contiguous, second-0-to-full-duration partition §7.3/AC19 requires (small gaps exist,
including before the first character and after the last). Consistent with — not
contradicting — the PRD's own note that silence allocation is pending D11; decomposition
must extend/post-process, not trust raw timestamps as pre-partitioned.

## Decision 3 — Reasoning/decomposition fidelity requires an explicit prompt instruction

`gpt-6-astra` reconstructs a script exactly, char-for-char, when segmented — but **only
when the prompt explicitly instructs whitespace preservation and a self-check**. The
plain fidelity instruction alone reproducibly dropped inter-sentence spaces for Spanish
(2/2 real calls) while happening to work for English (2/2). **The refined prompt must be
used for both languages in the real implementation**, not only the one that failed in
this sample — the plain prompt is not reliably sufficient across languages.

*Alternative considered:* trusting the plain prompt since it passed for English.
Rejected — the Spanish failure was reproducible, not noise, and nothing guarantees
English wouldn't fail under different phrasing or content; the refined prompt costs
nothing extra and removes the risk for both.

## Decision 4 — Supported language list

**English and Spanish**, verified independently across all three chain stages per
Decision 4 (design.md) — not adopted from either provider's advertised list. Both passed
voice and alignment on the first attempt; Spanish's reasoning-stage failure was fixed by
the prompt change in Decision 3 above, not by rejecting the language.

## Decision 5 — No not-retryable failure signal found (major finding)

Tested all four provider-calling stages with disallowed instructional content
(illicit-drug and explosive-device descriptions). **None produced a distinguishable
not-retryable rejection.** OpenAI's reasoning stage silently substitutes safe placeholder
`image`/`video` instructions while preserving the narration text verbatim — HTTP 200,
`finish_reason: "stop"`, `refusal: null`, a completely normal-looking success. Voice
(ElevenLabs), image (Fal.ai) and video (RunningHub) all generated the requested content
outright, no filter triggered. Fal.ai's `has_nsfw_concepts` field exists but targets
sexual content, not violence/weapons.

**This is escalated, not resolved by this change**: §10.1's not-retryable-skip-retries
branch currently has nothing to trigger on for this content class, on any of these four
providers. Two directions for the product owner, neither decided here: accept that the
reasoning stage silently sanitizes rather than hard-fails (cheap, but silently changes
what gets generated with no user-visible signal), or add an explicit upstream
content-moderation check on the submitted script before the pipeline runs (surfaces a
real, visible not-retryable failure at submission time, per §4.1).

## Decision 6 — Version identifiers and retirement exposure

| Provider | Hardcoded identifier | Exposure |
|---|---|---|
| RunningHub | Endpoint path `/openapi/v2/minimax/hailuo-h3/image-to-video` (versioned by path, no separate field) | Path retirement fails calls outright, no fallback (§11.2) |
| OpenAI | Model id `gpt-6-astra` | Model deprecation fails calls; no version-pinning mechanism beyond the id string itself |
| Fal.ai | Model id `fal-ai/flux/dev` | Same pattern |
| ElevenLabs | Voice id `4YYIPFl9wE5c4L2eu2Gb`, model `eleven_multilingual_v2` | Voice could be retired from the marketplace independently of the model |

Review trigger for all four: periodically check each provider's own catalog/changelog for
a deprecation notice before it starts failing in production — no automated detection
exists or is planned (§11.2 rules out provider switching in the MVP).

## Decision 7 — Rate limits and per-stage request caps

| Stage | Measured limit | Derived cap (headroom for 1+3 retry budget) |
|---|---|---|
| Decomposition (OpenAI) | 500 req/min, 500k tokens/min | 50 |
| Image (Fal.ai) | 2000 (window unit unconfirmed) | 200, provisional on that window |
| Voice + Alignment (ElevenLabs, shared account) | 137,109 chars/period (Creator tier) — a consumption quota, not a request-rate limit | **undetermined** — no concurrency number exists to derive from |
| Video (RunningHub) | `apiType: SHARED`, no numeric limit found | **undetermined** — empirical probing deliberately deferred (product owner's choice, cost reasons) |

No invented numbers where no real limit exists (Decision 6 of design.md). Voice and
alignment must be derived **jointly** against their one shared quota once a number
exists (task 7.5a) — a case the original shared-account check (task 1.2a, image/video
only) did not anticipate.

## Decision 8 — Per-phase maximum times

Measured from 4-7 real samples per stage (spike-level spread, not a percentile study):
Decomposition 20s, Image 25s, Voice 10s, Alignment 5s, **Video 240s** — provisional,
~1.5-2x the observed max. **Video is 15-30x slower than every other stage** (observed
141-159.5s per 5s clip, sequential and at 3x concurrency alike, no queueing observed at
that load) — the dominant cost in the whole pipeline's latency, and the main driver for
UX/progress-messaging design. Assembly's maximum remains undetermined — depends on
`define-media-assembly` (JOS-182), not yet archived.

## Evidence

Every claim above traces to a real, paid or subscription-covered call, not documentation.
See `openspec/changes/define-provider-configuration/reports/`:
`2026-09-26-step-1-gate-and-limits.md`,
`2026-09-27-step-3-video-provider-verification.md`,
`2026-09-27-step-4-voice-provider-verification.md`,
`2026-09-27-step-5a-alignment-provider-verification.md`,
`2026-09-27-step-5b-image-and-reasoning-verification.md`,
`2026-09-27-step-6-language-list-verification.md`,
`2026-09-27-step-7a-reasoning-failure-signal.md`,
`2026-09-27-step-7b-failure-signals-voice-image-video.md`,
`2026-09-27-step-7c-rate-limits-and-request-caps.md`,
`2026-09-27-step-8-timing-measurements.md`,
`2026-09-27-step-9-derive-remaining-values.md`,
`2026-09-27-step-12-unit-test-and-db-verification.md`,
`2026-09-27-step-13-curl-endpoint-testing.md`.

## Risks left unproven within the timebox

- **RunningHub's real concurrency ceiling** was probed only to 3x with no degradation
  observed — this does not establish where throttling/queueing actually begins.
- **Fal.ai's rate-limit window unit** (per minute? per day?) was not confirmed from
  response headers alone; the derived cap of 200 is provisional on that gap.
- **§6.1's clause-boundary-split exception and the §6.1.1 edge case** (a short sentence
  forcing the next sentence to split) were not tested against the reasoning provider —
  deferred to US-09's implementation-level TDD, which can combine real duration bounds
  with a deliberately engineered long sentence.
- **The not-retryable failure signal gap (Decision 5)** is recorded as a finding, not
  closed — the product owner has not yet chosen a direction.
- **Real queueing behavior was never observed** for any provider (RunningHub's
  time-to-`RUNNING` was ~0.46-0.48s in all 7 samples, sequential and concurrent alike) —
  §10.1's queue-time-doesn't-count-as-execution-time principle held in every sample but
  was never actually stress-tested against a real queue.

## Consequences

- `backend/src/config/providers.ts` is the single source of truth for every value above;
  `backend/src/config/languages.ts` (a provisional placeholder) is deleted, and its two
  importers (`src/routes.ts`, `test/session-creation.test.ts`) now import from
  `providers.ts`.
- `test/providerConfig.test.ts` asserts the module's values, so it and this ADR /
  `docs/PRD.md` §11 (task group 16) cannot silently drift apart (Decision 8 of
  design.md).
- `define-media-assembly` (JOS-182) has two new concrete requirements from this change:
  normalize every video chunk's resolution (2560×1440 → 1920×1080) and frame rate
  (24fps → 30fps), and treat raw forced-alignment/native-timestamp output as needing
  edge-extension and gap-allocation, not as an already-formed partition.
- US-09 (decomposition) must use the refined, whitespace-preserving prompt (Decision 3)
  for both English and Spanish, and inherits the untested clause-boundary-split edge case
  as an open risk to cover in its own TDD suite.
- §10.1's not-retryable-failure branch has no confirmed trigger for content-policy
  rejections on any of these four providers — a product decision is needed before US-22
  (retry budget) can claim this case is handled, one way or the other.
- Total spend: **$5.605 of the $20 ceiling** (task 15.7, `reports/2026-09-27-step-15-spend-summary.md`).
