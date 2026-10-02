# Step 7a — Failure Signal: Reasoning Provider (OpenAI)

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

Covers tasks 7.1-7.3 for the reasoning provider only. Testing the remaining providers
(voice, image, video) in this same group was interrupted mid-session by a session-level
safety block on the tool-calling harness, triggered by the cumulative sensitive-content
test material across multiple calls (not by any single call). Those providers' tests
(7.1-7.3) are tracked as still open below, not silently skipped.

## 7.1 - Trigger a not-retryable rejection (reasoning / OpenAI `gpt-6-astra`)

Two real calls through the actual segmentation prompt shape (system prompt instructing
exact-fidelity chunking plus `image`/`video` field generation, `response_format:
json_object`), each with a `script` containing disallowed instructional content (one
about illicit drug production, one about a dangerous device).

## 7.2 - Exact shape

**There is no distinguishable failure shape.** Both calls returned:
- HTTP 200
- `finish_reason: "stop"` - identical to a normal successful completion
- `message.refusal: null` - the dedicated refusal field, present in the schema, was not
  populated
- Valid, well-formed JSON matching the requested schema exactly
- The `prompt` field faithfully reproduced the disallowed input text verbatim (per the
  system prompt's own fidelity instruction, which the model followed even here)
- The `image` and `video` fields were **silently substituted** with generic,
  safety-themed placeholder instructions instead of the instructions a compliant model
  would have generated for benign content

Reproducible: 2/2 disallowed prompts produced this same pattern.

## 7.3 - Distinguishing from a transient failure

**Cannot currently be done from the reasoning API response alone** - there is nothing to
match on. A transient failure would show as a non-200 HTTP status, a timeout, or an
API-level error object; this "soft" content-policy accommodation shows as a completely
normal-looking success. Section 10.1's not-retryable-skip-retries logic has nothing to
trigger on for this stage as currently prompted.

**This is a finding for escalation, not a value to record as if the mechanism worked as
assumed** (per task 3.6/design open question 5's spirit, applied here to a section 10.1
gap rather than a section 11 capability gap). Two directions worth the product owner's
input, not decided here:
1. Treat this as **acceptable degraded behavior** - the reasoning stage never hard-fails
   for content-policy reasons; it silently produces safe substitute instructions instead,
   and the pipeline proceeds normally with sanitized `image`/`video` prompts. This costs
   nothing in retries but silently changes what gets generated from what the user's
   script literally described, with no signal to the user that a substitution happened.
2. Add an explicit content-moderation check on the user's submitted script (e.g. a
   dedicated moderation endpoint, or a similar check against another provider) **before**
   the reasoning stage runs, so a disallowed script produces a real, surfaced
   not-retryable failure at submission time (section 4.1's "the system informs the
   cause") rather than a silent substitution discovered only by inspecting generated
   images later.

## Still open (blocked this session)

- 7.1-7.3 for voice (ElevenLabs), image (Fal.ai), video (RunningHub)
- 7.4-7.6 (rate limits, per-stage request caps) - not blocked by the safety guard, can
  proceed once this report is filed

## Spend

2 additional OpenAI calls (~700 tokens total), negligible. Running metered total
unchanged at **$2.14** of the $20 ceiling.
