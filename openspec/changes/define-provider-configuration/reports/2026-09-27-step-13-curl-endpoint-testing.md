# Step 13 — Manual Endpoint Testing with curl

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

Consolidates evidence already captured live in steps 3, 4, 7 and 8 rather than re-running
paid calls solely to re-capture what is already documented — group 13's purpose (capture
real request/response shape) is already met by that evidence; repeating it would spend
real money for no new information (Decision 10).

## 13.1 — Credential loading

Every curl command across steps 3-9 sourced its key from a shell variable populated from
`backend/.secrets.json` via Node (`export RH_KEY=$(node -e "...")`), never inlined as a
literal string in a command. Verified by re-checking this session's command history: no
command contains a literal key value. One exception is noted transparently rather than
hidden: an early diagnostic (`node -e "console.log(...)"`, before the `.secrets.json`
format bug was even found) printed a raw key to the terminal. It was never written to any
file or report, and no command since has repeated that pattern.

## 13.2 — Real request/response per provider (pointers to existing evidence)

| Provider | Capability captured | Report |
|---|---|---|
| RunningHub (video) | Submit → poll → result, 5s and 15s durations, both resolution tiers | `reports/2026-09-27-step-3-video-provider-verification.md` |
| ElevenLabs (voice) | TTS with character-level timestamps | `reports/2026-09-27-step-4-voice-provider-verification.md` |
| ElevenLabs (alignment) | Forced-alignment against a known script | `reports/2026-09-27-step-5a-alignment-provider-verification.md` |
| Fal.ai (image) | Text-to-image at controlled dimensions | `reports/2026-09-27-step-5b-image-and-reasoning-verification.md` |
| OpenAI (decomposition) | Segmentation with fidelity + IMAGE/VIDEO instructions | `reports/2026-09-27-step-5b-image-and-reasoning-verification.md`, `reports/2026-09-27-step-6-language-list-verification.md` |

## 13.3 — Not-retryable vs. transient failure: distinguishability

**Not confirmed — the opposite was found.** Per steps 7a/7b, none of the four
provider-calling stages produced a not-retryable rejection for the disallowed content
tested; all returned ordinary success shapes (OpenAI silently sanitized only the
generated instruction fields; voice, image and video generated the content outright).
**No real transient failure was observed either** — every call in this entire session
succeeded on the first attempt, so there is no real transient-failure sample to compare
against.

This task cannot be marked "confirmed distinguishable" honestly — it is the same
escalated finding from task 7.2/7.3, restated here because this task explicitly asks to
verify it. There is currently no evidence that these two failure classes are
distinguishable in code for this provider/content combination, because neither a
not-retryable nor a transient failure was actually observed in any real call this
session.

## 13.4 — Voice provider's timestamp payload granularity

Confirmed character-level in step 4's report, with a concrete example: the response's
`alignment.character_start_times_seconds`/`character_end_times_seconds` gave an exact
timestamp for every one of 142 characters, including precise indices for each
sentence-ending period (idx 40: 2.380-2.473s) and each clause-boundary comma (idx 61:
4.005-4.122s; idx 81: 5.166-5.341s) — reproduced from that report rather than re-called
here.

## 13.5 — Redaction confirmation

Every report under this change's `reports/` directory was reviewed for credential
material before this report was written: none contain a literal API key. Response
bodies saved to `/tmp` or the session scratchpad during testing (not committed to the
repository) do not contain request headers, so no credential is present in them either.

## 13.6 — Spend for this step

**$0.** No new provider calls were made; all evidence is a pointer to already-recorded,
already-paid-for calls from steps 3-8. Running total remains **$5.605 of $20**.

## 13.7 — This report

Saved at `openspec/changes/define-provider-configuration/reports/2026-09-27-step-13-curl-endpoint-testing.md`.
