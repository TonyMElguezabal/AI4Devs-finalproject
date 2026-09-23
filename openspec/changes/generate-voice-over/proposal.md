# Generate the full voice-over

Linear-Issue: JOS-136

## Why

A session that reaches `submitted` today goes nowhere. §5 step 2 makes the complete voice-over the next act of the flow, and everything after it depends on it: timestamps are taken from this audio (§5 step 3), chunks are cut against its narrated durations (§6.1), and the final MP4 carries it as its only audio track (§7.3). No later phase can start until one MP3 of the whole script exists.

It is also the first story that calls a real provider, and the point where several rules the PRD states in the abstract become concrete for the first time: the provider used is bound to the session for every later retry (§11.2); a service restriction is reported rather than worked around by trimming the script (§4.1, AC02); a not-retryable rejection skips automatic retries (§10.1); and once a narration succeeds it can never be generated again (§4.2). Whatever the voice provider returns alongside the audio — native timestamps included — has to be kept now, because §10.3 forbids asking the voice provider again once the narration is complete.

## What Changes

- Launch voice-over generation **automatically** once a session is registered in `submitted`, with no second user action (§5). This is the trigger `start-video-project` (JOS-134, Decision 8) deliberately left to this story.
- Move the session through `submitted → voice-over-generating → voice-over-complete`, and `voice-over-generating → failed` with the failed phase recorded (§8.1).
- Send the stored script to the voice provider **exactly as stored**, with the hardcoded voice, quality and speed and the session's language (§4.1, §4.2, §11).
- **Bind the voice provider to the session** on the first attempt, and use that binding for every later attempt (§11.2, AC4 of the ticket).
- Record each attempt **before** the request is sent, so a restart can see what was in flight (§12.1, `define-persistence` Decision 2).
- On success, store **exactly one MP3** per session in its project folder, with its duration and size, and keep any native timestamps the provider returned **raw and uninterpreted** (§3, §12.2).
- Classify each failure as transient or not retryable using the signal `define-provider-configuration` records per provider; report the cause of a not-retryable one and never trim, summarise or split the script to get past it (§4.1, §10.1).
- Make a repeated success confirmation unable to create a second voice-over or launch anything twice, enforced by the store (§12.1).
- Offer no path that generates a voice-over for a session that already has one (§4.2).
- Expose the voice-over status and any failure on the session representation, and emit a state-change event for the live-update mechanism (§8.3).

## Capabilities

### New Capabilities

- `voice-over-generation`: producing the session's single narration — when generation starts, what is sent, how the provider is bound, what is kept on success, how failures are classified and reported, and the guarantee that a completed narration is never produced twice.

### Modified Capabilities

None. `openspec/specs/` is still empty. `session-creation` from `start-video-project` is not yet archived, so it is not an existing spec this change can modify; this change consumes the `submitted` session it produces and must stay consistent with it.

## Impact

- **Blocked on foundations not yet applied**: `define-backend-stack` (JOS-179) and `define-persistence` (JOS-181) for the framework and store; `define-provider-configuration` (JOS-165) for the voice provider, its parameters, its not-retryable signal and its **input length limit**; `start-video-project` (JOS-134) for the session this story advances. `keep-project-files` (US-30, JOS-162) owns the project folder the MP3 lands in.
- **Open product risk**: a 1,500-word script is roughly 9,000 characters, and many text-to-speech APIs cap a single request below that. If the chosen provider does, AC02's literal reading makes typical scripts fail. This change keeps the literal reading and gates implementation on the limit US-33 records (see design).
- **First real provider call and first paid attempt**: automated tests use the stubbed provider from `define-backend-stack`; the real provider is exercised only by an opt-in contract test.
- **Data model**: first voice-over and stage-attempt records in `docs/data-model.md`; new session fields for the bound provider and the failure.
- **API contract**: the session representation in `docs/api-spec.yml` gains `voiceOver` and `failure`. No new command endpoint, and no MP3 download — §12.3 limits downloads to images, clips and the final MP4.
- **Downstream**: unblocks US-04 (narration lock), US-05/US-06 (timestamps, which read what this story stores), US-23 (manual voice retry) and US-22 (automatic retries plug into the classification made here).
- **Not included**: automatic retries (US-22), manual retry (US-23), pause (US-20), the per-stage request cap (US-37), restart resumption (US-28), diagnostics UI (US-34) and the phase view (US-18). This change leaves a single launch gate for them to extend.
