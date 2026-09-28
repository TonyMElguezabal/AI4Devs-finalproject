# Design — Generate the full voice-over

## Context

§5 step 2 follows registration with the generation of the complete voice-over, and §8.1 gives it two states of its own: `voice-over-generating` while the narration is produced and `voice-over-complete` once the MP3 is available. §3 defines the voice-over as one MP3 of the whole script, to which every chunk is later related by interval. §4.1 forbids trimming or summarising the script to get past a service restriction; §4.2 locks the script from `submitted` onward and forbids regenerating a completed narration. §10.1 makes a not-retryable rejection skip automatic retries. §10.3 lets a failed voice attempt be retried, but lets timestamp problems be retried only against the same audio — "the voice provider is not asked again". §11.2 binds the voice provider to the session for every retry. §12.1 requires that a repeated success confirmation never duplicates a result, and that an in-flight request survives a restart.

`start-video-project` (JOS-134) ends at `submitted` and hands the trigger to this story (its Decision 8 and task 12.2). `define-persistence` (JOS-181) has already decided the shape this story's records take: append-only attempt records written before the request is sent (Decision 2), uniqueness enforced by the store (Decision 3), and file references relative to a recorded project folder (Decision 4). `define-provider-configuration` (JOS-165) owns the voice provider, its parameters and the signal that tells a not-retryable failure from a transient one (Decision 5). `define-backend-stack` (JOS-179) provides a stubbed provider with configurable latency, transient and not-retryable failures and duplicate confirmations.

None of those has been applied, and the repository has no application code beyond `packages/specboot`. This design states its decisions in behavioural and layering terms that the chosen stack will satisfy.

## Goals / Non-Goals

**Goals:**
- Advance a registered session to `voice-over-complete` with exactly one MP3, or to `failed` with a comprehensible cause.
- Bind the voice provider to the session and record every attempt before it is sent.
- Keep everything the voice provider returns in the same call, so no later phase has to ask it again.
- Make "one voice-over per session" a property of the store, not of the calling code.
- Leave one launch gate that pause, the request cap and automatic retries can extend without editing this story's code.

**Non-Goals:**
- The 1 + 3 automatic retry budget and the per-phase maximum time (US-22); this story classifies failures and stops there.
- Manual retry of a failed voice-over (US-23).
- Holding the launch while paused (US-20) and capping simultaneous requests (US-37).
- Resolving an in-flight attempt after a restart (US-28); this story only guarantees the record exists.
- Interpreting, validating or aligning timestamps (US-05, US-06), and the transition to `chunk-decomposing`.
- Creating or naming the project folder (US-30).
- Showing progress, provider or attempts in the UI (US-18, US-34).
- Choosing the voice provider or its parameters (US-33).

## Decisions

**Decision 1 — Launch from the committed registration, through a single phase-launch gate.**
Once the session is committed in `submitted`, the application hands it to one gate that decides whether a phase may be launched now. In this story the gate always admits. The gate moves the session to `voice-over-generating` and only then dispatches the provider call.
*Alternatives:* calling the provider inline in the registration request (rejected: `start-video-project` Decision 8 keeps registration independent of any provider, and a slow or failing provider would turn a successful start into a failed HTTP request); requiring the User to start narration (rejected: §5 describes an automatic flow and no PRD section asks for a second action); launching directly without a gate (rejected: US-20, US-37 and US-22 all need to hold or reorder launches — without one entry point each would wrap this code differently, and the pause rule of §9 would be only as good as the least careful caller).

**Decision 2 — Change state before the request is sent, and write the attempt record in the same step.**
`voice-over-generating`, the session's bound provider and the attempt record (`in-flight`, sequence, queued and sent times) are persisted together before the provider is called.
*Alternatives:* recording after the response (rejected: `define-persistence` Decision 2 — a crash between send and response would leave no trace of a paid, possibly completed generation); moving to `voice-over-generating` only on the provider's acknowledgement (rejected: it leaves a window where the User sees `submitted` while a request is already out, which is exactly the "running vs waiting" confusion §9 warns about).

**Decision 3 — Bind the provider on the first attempt, and read it from the session thereafter.**
The provider identifier comes from the constants module the first time; every later attempt reads it from the session.
*Alternatives:* reading the constant on every attempt (rejected: §11.2 attaches the binding to the session, and a later build with a different hardcoded provider would silently switch a failed session's provider — the switch the MVP excludes).

**Decision 4 — Put the provider behind a port, with the classification inside the adapter.**
A `VoiceProvider` port offers `synthesize(text, language, voice, quality, speed)` returning the audio, any native timestamps and the provider's request identifier, and failing with an error already classified as `transient` or `not-retryable`. The real adapter classifies by HTTP status only, because US-33 found no distinguishable content-rejection signal for the voice provider (`NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED = false`, ADR 0005 Decision 5): **not retryable** for 4xx except 408 and 429 (bad credential, invalid voice, rejected input); **transient** for 408, 429, 5xx, network errors and timeouts. The product owner confirmed on 2026-09-28 that this is all that can be done until the provider returns a clear error; when it does, the classification changes in this one adapter method. The stub from `define-backend-stack` implements the same port for tests.
*Alternatives:* classifying errors in the application layer (rejected: US-33 Decision 5 notes the not-retryable signal may live in a response body field that only the adapter understands, and the application would acquire provider-specific knowledge); treating every failure as transient (rejected: §10.1 — a content-filter rejection would consume the retry budget with no chance of success).

**Decision 5 — Send the whole script in one request; do not split to fit a provider limit.**
The request carries the stored script unaltered. A provider refusal on length is a not-retryable failure with its cause reported.
*Alternatives:* splitting at sentence boundaries into several requests and concatenating the audio into one MP3 (not adopted here: it does not trim content, but it multiplies attempts per narration, complicates the provider binding and the retry budget, and requires merging timestamps across joins — a product decision the ticket raises as open question 1, not one this design can take quietly); truncating (rejected: §4.1 forbids it outright).
The product owner decided (2026-09-28) that the MVP sets **no limit on script length**: the only practical bound is the voice account's character credits, which renew monthly, and a User may spend all of them on one script. No length check, cap or split is added; a provider refusal on length, if one ever occurs, is still reported as a not-retryable failure with its cause.

**Decision 6 — Store the MP3 and raw timestamps as files in the project folder, with a 1:1 voice-over record.**
The audio is streamed to a temporary file in the session's project folder and renamed into place once complete; raw timestamps are written the same way. A voice-over record, unique on the session, holds the relative paths, duration, size, native-timestamp availability, provider request identifier and completion time.
*Alternatives:* storing the audio in the store (rejected: §12.2 requires files on disk in the project folder, and `define-persistence` Decision 4 settles references as relative paths); discarding native timestamps until US-06 exists (rejected: §10.3 forbids asking the voice provider again once the narration is complete, so timestamps not kept now are lost for good); parsing the timestamps into a normalised model here (rejected: their format and usability are what US-05 establishes — normalising before that fixes a shape nobody has verified).

**Decision 7 — Validate the audio before declaring success.**
The stored MP3 must decode and report a duration above zero; the duration recorded is the measured one, not the provider's claim. Probing uses the media tooling chosen by `define-media-assembly` (JOS-182).
*Alternatives:* trusting the provider's success response (rejected: every later phase measures against this file — a truncated or empty MP3 would surface as a decomposition or assembly failure, blamed on the wrong stage); a full content check against the script (rejected: that is alignment, which belongs to US-06).

**Decision 8 — One voice-over per session, enforced by a uniqueness constraint.**
A second success confirmation collides with the existing record; the collision is treated as "already done" and triggers nothing.
*Alternatives:* checking for an existing voice-over before writing (rejected: `define-persistence` Decision 3 — two concurrent confirmations both pass the check).

**Decision 9 — Report failure on the session, not only on the attempt.**
A session in `failed` carries `{ phase: 'voice-over', cause, retryable, occurredAt }`; the attempt record keeps the provider's raw error code and message. The cause shown to the User is written for a person and never contains credentials or the script text.
*Alternatives:* deriving the failure from the latest attempt at read time (rejected: a failure caused before any request, such as a missing credential, has no attempt to read from, and §8.1 requires the session to show which phase failed).

**Decision 10 — Until US-22 lands, a transient failure fails the session.**
The attempt is classified transient and handed to a retry-policy hook; the default hook places the session in `failed`.
*Alternatives:* a temporary retry loop here (rejected: US-22 owns the 1 + 3 budget and §10.1 warns that internal recovery must not multiply it — two retry mechanisms are how that happens).

**Decision 11 — No new command endpoint; extend the session representation.**
The launch is internal. The session read (US-02) gains `voiceOver` and `failure`; state changes are published to the live-update mechanism from `define-live-updates` (JOS-183). There is no MP3 download.
*Alternatives:* an explicit "start narration" endpoint (rejected: Decision 1); an MP3 download (rejected: §12.3 restricts in-app downloads to images, clips and the final MP4).

## Risks / Trade-offs

- **The provider's per-request input limit is below a long script** → Decision 5 then fails that project with the provider's cause and nothing else. Accepted by the product owner (2026-09-28): no length limit is imposed and no split-and-join is built; credits are the only bound. Because no limit is recorded for the voice provider, the real behaviour on a very long script is only observed if it happens, and the not-retryable classification (Decision 4) is what reports it.
- **A paid generation completes but is lost** → Decision 2 writes the attempt before sending, and Decision 6 renames the file into place only once complete, so a crash leaves either an `in-flight` record for US-28 or a finished file — never a half-written MP3 treated as final.
- **Native timestamps turn out unusable** → Kept raw (Decision 6), so US-06 can switch to alignment without asking the voice provider again, as §10.3 requires.
- **The not-retryable signal is misread** → With HTTP-status-only classification, a content rejection that the provider reports as HTTP 200 is not detected at all, and a rejection reported with a retryable status burns the retry budget once US-22 lands. The classification lives in one adapter method with a test per status class, so it can change without touching the phase.
- **Provider audio does not match the recorded duration** → Decision 7 records the measured duration, which is what segmentation and assembly consume.
- **Logs leak the script or a key** → Logs carry script length and a hash, never the text; credentials are never logged. A test asserts neither appears.
- **US-30 has not landed** → The folder from JOS-134 (`db.ts`) is reused as is (decided 2026-09-28). If US-30 later changes the naming rule, the MP3 path is stored relative to the recorded `project_folder`, so only that one column moves.
- **Real-provider behaviour differs from the stub** → An opt-in contract test calls the real provider once for success and once for a known rejection, outside the default test run because it costs money and needs a key.

## Migration Plan

Nothing is deployed and no session has progressed past `submitted`. The change adds a migration for the voice-over and attempt records and the new session fields, under the versioned-migration approach of `define-persistence` Decision 6. Rollback is reverting the migration and removing the phase; sessions left in `voice-over-generating` by a rollback return to `submitted` and are relaunched on the next deployment.

## Open Questions

1. ~~Does the chosen voice provider accept a realistic script in one request?~~ **Resolved 2026-09-28 by the product owner:** no script-length limit; the account's monthly-renewing credits are the only bound. No split-and-join, no cap. Not blocking.
2. ~~Does US-30 land first?~~ **Resolved 2026-09-28 by the product owner:** no; this story uses the project folder `backend/src/db.ts` already creates (JOS-134) and does not touch its naming rule. US-30 can still extend it later.
3. **Is failing the session on a transient error acceptable until US-22 lands?** Decision 10 assumes yes.
4. ~~What does the not-retryable signal look like for the chosen provider?~~ **Resolved 2026-09-28 by the product owner:** none is known, so the adapter classifies by HTTP status only (Decision 4) until ElevenLabs returns a clear error. A content rejection that comes back as HTTP 200 audio cannot be detected and stays an open finding in ADR 0005.
