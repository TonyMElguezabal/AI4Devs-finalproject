# Manually retry a failed voice-over

Linear-Issue: JOS-155 (US-23)

## Why

When narration generation fails, the session stops in `failed` with `failedPhase: "voice-over"`, and the User has no way forward. §10.2 lets the User retry a failed stage while keeping earlier successful results. §10.3 limits the voice-over to "retry the failed generation with the same script, without replacing an already completed audio". Without this story, a single provider outage or an exhausted retry budget ends the project for good. The only way out would be a new project with the same script, which is a new session, a new identifier and new costs.

## What Changes

- **A manual voice-over retry command**: `POST /sessions/:sessionId/voice-over/retry`, with no request body. It is accepted only when all of these hold:
  - the session is `failed` with `failedPhase: "voice-over"`;
  - `canLaunchVoiceOver` (JOS-137) allows a launch, meaning the session has no voice-over record;
  - no retry for it is already pending or running.

  Each refusal answers 409 with a reason the page can show. An unknown or malformed session id answers 404.
- **Same script, always (AC1)**: the retry sends the stored script as it was registered. The store's triggers have locked it since JOS-137. The command accepts no input that could change the script, title, language, voice, quality or speed. A request body is rejected.
- **Same provider, always (AC2)**: the retry uses the voice provider bound to the session on its first attempt (JOS-136, write-once). It never rebinds or switches (§11.2). If no adapter exists for the bound provider, the retry fails with a readable cause and sends nothing.
- **Nothing is deleted (AC3)**: a retry never removes or rewrites the session, its project folder, or any file or record in it. Earlier attempts and the earlier failure stay recorded for diagnostics (US-34).
- **A new retry cycle**: the retry opens a new cycle on the session's voice-over stage instance through `startNewCycle` (JOS-184). That gives it up to four attempts, with automatic retries, before it can fail again (§10.2, D06).
- **Through the launch gate**: the retry goes through the phase-launch gate like every other launch. During a pause it is accepted and recorded as pending, and nothing is sent until the User continues (§9, JOS-152).
- **The session shows progress at once**: from the moment the retry is accepted, whether it is pending, held or running, the session derives `voice-over-generating` (§8.1). This extends `view-progress-by-phase`'s retry rule (JOS-168) from in-flight attempts to accepted retries, matching how a retried scene already returns its session to `chunks-processing`.
- **A retry button on the page**: `phaseActions` (JOS-168) returns `retry` for a failed voice-over phase. The Voice-over phase section shows a "Retry voice-over" button that calls the command and shows any 409 reason.

## Capabilities

### New Capabilities

- `voice-over-manual-retry`: retrying a failed voice-over by hand. It covers:
  - when the retry is allowed and how a refusal is reported;
  - the guarantee of the same script and the same bound provider;
  - the guarantee that nothing is deleted;
  - the new cycle and how pause holds it;
  - the state the session shows while the retry is pending or running;
  - the retry action on the session page.

### Modified Capabilities

None in `openspec/specs/`. This change builds on capabilities from unarchived changes and stays consistent with them:
- `voice-over-generation` (JOS-136);
- `stage-retry-policy` (JOS-184);
- `session-pause` (JOS-152);
- `session-phase-progress` (JOS-168).

`content-lock` (archived) is used as is: the retry relies on its locked script and on `canLaunchVoiceOver`, and changes neither.

## Impact

- **Backend**:
  - `routes.ts`: the new route and its Zod schemas.
  - A new `voiceOverRetry.ts` application service: checks, `startNewCycle`, then the gate.
  - `orchestrator.ts`: the retry rule in `deriveSessionState` counts an accepted retry.
  - The voice-over launcher's held-work count includes a pending manual retry.
  - No new table: the pending retry is JOS-184's scheduled attempt.
- **Frontend**: `phaseActions.ts` (retry for voice-over), `PhaseSection.tsx` (button and refusal message), `api/client.ts` (`retryVoiceOver`).
- **API contract**: `docs/api-spec.yml` gains the route.
- **Blocked on (hard gate before any code)**:
  - **`generate-voice-over` (JOS-136), groups 4-6**: the voice provider port and adapter, the voice-over phase and its launch, and the session representation. None of it exists in code on any branch yet. Only its records and state machine are merged.
  - **`bounded-retry-policy` (JOS-184)**: `startNewCycle`, cycles and scheduled attempts. Nothing implemented yet.
  - **`view-progress-by-phase` (JOS-168)**: the phase sections and `phaseActions`. This branch stacks on it.
- **Open product question**: should a manual retry be offered after a *not-retryable* voice failure, for example a 4xx rejection? This proposal says yes (design Decision 3). The product owner must confirm, together with JOS-184's open question 4 ("retried until it recovers").
- **Out of scope**:
  - retrying any other phase (US-24 to US-27);
  - choosing or switching the voice provider (§11.2);
  - editing the script (§4.2);
  - regenerating a completed narration, which is refused by `canLaunchVoiceOver`.
