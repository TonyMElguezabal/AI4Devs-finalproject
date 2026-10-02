# Step 1 — Gate: Collect the Inputs and Set the Limits

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-26
**Branch:** `feature/jos-165-define-provider-configuration` (from `main`)

This spike is blocked on real credentials for every one of its five providers. This report
records everything decidable **before** any real call, per task 1.5, and states exactly
what remains blocked and why.

## 1.1 — Spend ceiling (Decision 10)

**$20**, set before any provider is called, per the product owner's choice of "a small
fixed cap ($10–$20)". Spend is recorded per stage as calls are made (tasks 8.6, 13.6,
15.7) and the spike stops calling providers if the ceiling is reached, escalating rather
than continuing silently over it.

## 1.2 — Image and video providers

Chosen by the product owner:
- **Image:** Fal.ai
- **Video:** RunningHub

**Correction to the proposal's assumption:** `proposal.md`'s Impact section states
"credentials are already held for both." This was checked directly in this environment —
`.env` files, a secrets file, and the process environment — and **no credential for
either provider is present**. Task 1.2's "verify them against §11 rather than
re-evaluating them" therefore cannot proceed to an actual capability call yet; it is
blocked on credential provisioning, tracked below.

## 1.2a — Shared account?

**No** — Fal.ai and RunningHub are unrelated services from different companies, so the
image and video keys cannot belong to the same provider account. Their stage rate-limit
caps (task 7.5) will be derived independently against each provider's own limit, not
jointly against a shared one. This sub-task needed no credential to answer.

## 1.3 — Speed-factor limit from `define-media-assembly` (JOS-182)

**Unsettled — recorded as provisional.** `define-media-assembly` is not archived (0/60
tasks complete per `openspec status`). Its Decision 5 owns this measurement. Task 9.4
will carry this value as provisional, with `define-media-assembly` named as the
dependency that settles it, per this task's own instruction for exactly this case.

## 1.4 — Reasoning capability reference, re-checked against the current model line

`docs/PRD.md` §11 (line 279, Spanish text) reads: *"La referencia de capacidad
establecida para el proyecto es equivalente a Sonnet 4.6 o superior"* ("...equivalent to
Sonnet 4.6 or higher"). Compared against the model line current as of this spike
(Claude 5 family — Sonnet 5, Opus 5.5 — superseding the Sonnet 4.6 the PRD names), the
written bar is from an earlier generation than what's now current. This does not change
§11's requirement (it is still "4.6 or higher," and the line has only moved higher), but
it means evaluating a specific reasoning candidate (task 5.4/5.5) should be judged
against present-day capability, not treated as satisfied merely for exceeding a
now-dated reference point.

**Chosen candidate:** OpenAI (a specific model not yet named). **Blocked**: no OpenAI API
key exists yet at all (the product owner does not have one) — task 5.4's capability
verification (faithful §6.1 segmentation, no added/removed/paraphrased content) cannot
run until a key is obtained.

## 1.5 — What remains undecided at this point

| Stage | Provider | Credential status | Blocked on |
|---|---|---|---|
| Image | Fal.ai | Not present in this environment | Product owner exporting the key |
| Video | RunningHub | Not present in this environment | Product owner exporting the key |
| Voice | ElevenLabs | Not present in this environment | Product owner exporting the key |
| Reasoning | OpenAI (model TBD) | **Does not exist yet** | Product owner obtaining an API key first |
| Alignment | Not yet chosen | N/A | Deferred pending voice-provider native-timestamp verification (task 4.3/4.4) — per §11.1's own fallback design, alignment may turn out unnecessary |

**Also unsettled**, each with its dependency named rather than guessed:
- Speed-factor limit (task 1.3) — depends on `define-media-assembly` (JOS-182)
- Segmentation lower bound (task 9.1) — depends on group 3 (RunningHub's admitted
  durations), itself blocked on RunningHub credentials
- Supported language list (group 6) — depends on voice + alignment (if needed) +
  reasoning all being selected and callable
- Rate limits and per-stage request caps (group 7) — depends on every provider being
  callable

**Nothing in group 2 onward can proceed** (credential-path verification needs a real
credential to verify against; every task from group 3 onward calls a real provider) until
at least one of the four provider credentials (Fal.ai, RunningHub, ElevenLabs) is
actually present in this environment, and separately until an OpenAI key exists at all.

## Outcome

Task 1 is complete to the extent it can be without spending anything or holding a
credential. Group 2 (the credential-loading path, `backend/src/config/credentials.ts`)
was also completed, since it needed no real key to build or test.

**Paused 2026-09-26**, at the product owner's explicit request: they are working remote
and cannot edit the local secrets file (or export env vars in this environment) until
back at their desktop. No further task in this change can proceed without a real
credential for at least one of Fal.ai, RunningHub or ElevenLabs (and separately, an
OpenAI key does not exist yet at all). Resume with `/opsx:apply define-provider-configuration`
once credentials are in place.
