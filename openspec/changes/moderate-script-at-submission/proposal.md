# Moderate the script at submission

Linear-Issue: JOS-187

## Why

PRD §4.1 lets the providers' own content filters decide what is allowed, and §10.1 treats a rejection as a not-retryable failure whose cause the User sees. The JOS-165 spike (`docs/adr/0005-provider-selection.md`, Decision 5) found that none of the four provider-calling stages produces such a rejection. Given disallowed content, decomposition (OpenAI) quietly replaces the IMAGE/VIDEO instructions with safe placeholders and returns an ordinary HTTP 200. Voice, image and video generate the content as asked. So today a disallowed script produces a video that differs from what was asked, and nothing tells the User. §4.1's "the system informs the cause" never happens.

The product owner chose to fix this at the entry point: check the submitted script with the reasoning provider's own moderation endpoint before the session exists, so a disallowed script is refused at once with a visible cause.

## What Changes

- `POST /sessions` sends the script to OpenAI's Moderation endpoint (the decomposition provider's own content filter, using the same `OPENAI_KEY`) before it registers the session.
- **Flagged** → `422` with a person-readable cause that names the flagged categories. No session, scene, file or attempt record is created. The script stays in the form so the User can edit it and resubmit.
- **Moderation unavailable** (timeout, network error, `429`/`5xx`, missing credential) → `503` with a person-readable cause. Nothing is created. The check **fails closed**: a script is never registered unchecked.
- **Clean** → registration behaves exactly as today (`201`, voice-over launches).
- The moderation model id and its time limit are hardcoded in `backend/src/config/providers.ts`, next to the other provider values (PRD §11, §2.3: no configuration files).
- A first verification step checks that the moderation endpoint really flags the JOS-165 step-7a test content, in English and Spanish. The rest of the change depends on this.
- Documentation: PRD §4.1, §10.1, §11 and the §11.3 open finding; ADR 0005 Decision 5 (resolved by JOS-187); `docs/api-spec.yml` (`422`/`503` on `POST /sessions`).

Not changing: the downstream stages' failure handling and retry policy. They still have no content signal, and the gate makes one unnecessary for scripts. Corrected IMAGE/VIDEO instructions (§10.3) are not moderated by this change.

## Capabilities

### New Capabilities
- `script-moderation`: a submitted script is checked by the reasoning provider's moderation endpoint before registration. It is refused with a visible cause when flagged, refused as temporarily unavailable when the check cannot run, and registered unchanged when clean.

### Modified Capabilities
<!-- None: session registration has no synced spec in openspec/specs/; the new gate is specified in script-moderation. -->

## Impact

- **Backend**: `src/routes.ts` (`POST /sessions`), a new moderation adapter beside `src/visualInstructions.ts` that follows its single-request, no-hidden-retry pattern, `src/config/providers.ts`, and `test/setup.ts` (a default stub, so no test reaches the real endpoint).
- **Frontend**: none expected. `api/client.ts` already shows a response's `reason`, and the start form keeps its values on error. A test confirms both.
- **API**: `POST /sessions` gains `422` (content refused) and `503` (moderation unavailable). This is additive: clean scripts get the same `201`.
- **Cost/latency**: one extra request per submission. OpenAI's moderation endpoint is free and does not count toward decomposition's request cap.
- **Dependencies**: none new (`fetch`, `zod`).
