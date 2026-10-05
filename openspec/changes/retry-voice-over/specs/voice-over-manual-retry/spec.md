# voice-over-manual-retry

Requirements for retrying a failed voice-over by hand (PRD §4.2, §10.2, §10.3 voice row, §11.2; US-23). The voice-over phase itself is owned by `voice-over-generation` (US-03), retry cycles by `stage-retry-policy` (US-22), pause by `session-pause` (US-20), and the phase sections by `session-phase-progress` (US-18).

## ADDED Requirements

### Requirement: A failed voice-over can be retried by command

The system SHALL accept `POST /sessions/:sessionId/voice-over/retry` for a session that derives `failed` with `failedPhase: "voice-over"` and whose failure is retryable (`manualRetryAvailable`). An accepted retry SHALL answer 200 with `held` saying whether a pause holds it. The command SHALL refuse with 409 and a reason, and SHALL send no provider request, when:

- the session is not failed in the voice-over phase (`not-failed-in-voice-over`);
- `canLaunchVoiceOver` refuses (`narration-complete`);
- the failure is not retryable (`not-retryable`);
- a retry is already pending or running (`retry-already-pending`).

An unknown or malformed session identifier SHALL answer 404. A request body with any field SHALL answer 400.

#### Scenario: Retry after an exhausted cycle

- **GIVEN** a session `failed` in voice-over after four transient attempts
- **WHEN** the User retries the voice-over
- **THEN** the command answers 200 with `held: false` and a new voice-over attempt is sent

#### Scenario: Retry refused after a not-retryable failure

- **GIVEN** a session `failed` in voice-over with `retryable: false`
- **WHEN** the User retries the voice-over
- **THEN** the command answers 409 with `not-retryable`, no provider request is sent, and no cycle is opened

#### Scenario: Session not failed in voice-over

- **GIVEN** a session in `chunks-processing`, or `failed` with `failedPhase: "decomposition"`
- **WHEN** a voice-over retry is requested
- **THEN** the command answers 409 with `not-failed-in-voice-over` and no provider request is sent

#### Scenario: Narration already complete

- **GIVEN** a session that has a voice-over record
- **WHEN** a voice-over retry is requested
- **THEN** the command answers 409 and no provider request is sent, and the stored MP3 is unchanged

#### Scenario: Two retries at once

- **GIVEN** a session `failed` in voice-over
- **WHEN** two retry requests arrive concurrently
- **THEN** exactly one answers 200, the other answers 409 with `retry-already-pending`, and exactly one new cycle is opened

#### Scenario: Unknown session

- **WHEN** a voice-over retry is requested for an identifier that matches no session
- **THEN** the command answers 404

#### Scenario: A body is sent

- **WHEN** a voice-over retry is requested with a body `{ "script": "another text" }`
- **THEN** the command answers 400 and nothing is changed or sent

### Requirement: The retry uses the same script

The retried generation SHALL send the session's stored script, byte for byte, with the session's language and the hardcoded voice, quality and speed. The retry SHALL NOT modify the script, title or language (§4.2, §10.3).

#### Scenario: Same text as the first attempt

- **GIVEN** a session whose first voice-over attempt failed
- **WHEN** the voice-over is retried
- **THEN** the text the voice provider receives is identical to the stored script and to the text of the first attempt
- **AND** the stored script is unchanged

### Requirement: The retry uses the session's bound voice provider

The retry SHALL use the voice provider bound to the session on its first attempt, and SHALL NOT bind, change or switch it (§11.2). If the bound provider has no configured adapter, the new attempt SHALL fail as not retryable with a readable cause, and no request SHALL be sent.

#### Scenario: Bound provider reused

- **GIVEN** a session bound to voice provider A whose configured default is now provider B
- **WHEN** the voice-over is retried
- **THEN** the request goes to provider A and the binding is still A

#### Scenario: Bound provider without an adapter

- **GIVEN** a session bound to a voice provider that has no configured adapter
- **WHEN** the voice-over is retried
- **THEN** no request is sent and the session is `failed` in voice-over with a cause naming the missing configuration, and no credential

### Requirement: A retry deletes nothing

A voice-over retry SHALL NOT delete or rewrite the session, its project folder, any file in it, or any earlier attempt record. The earlier failure SHALL remain recorded until the new cycle succeeds or fails. A successful retry SHALL store the MP3 without replacing any existing file (§10.2, AC3).

#### Scenario: Failed retry

- **GIVEN** a session `failed` in voice-over, with a snapshot of its project folder and records
- **WHEN** the voice-over is retried and the new cycle fails again
- **THEN** every file and record in the snapshot still exists unchanged, except for the session's failure, which holds the new cause
- **AND** the new attempts are added

#### Scenario: Successful retry

- **GIVEN** a session `failed` in voice-over
- **WHEN** the voice-over is retried and succeeds
- **THEN** one MP3 is added to the project folder, the session reaches `voice-over-complete`, and every earlier file and attempt record still exists

### Requirement: A retry opens a new cycle through the launch gate

An accepted retry SHALL open a new cycle on the session's voice-over stage instance, allowing up to four attempts with automatic retries before it can fail again, and SHALL keep earlier cycles recorded (§10.2, D06). It SHALL go through the phase-launch gate. While the session is paused, the retry SHALL be accepted and recorded as pending, SHALL send nothing, and SHALL be sent once when the User continues (§9).

#### Scenario: New cycle after a manual retry

- **GIVEN** a session `failed` in voice-over after one cycle
- **WHEN** the voice-over is retried and its next four attempts fail transiently
- **THEN** the session is `failed` again after the fourth attempt of the second cycle, and all eight attempts are recorded

#### Scenario: Retry during a pause

- **GIVEN** a paused session `failed` in voice-over
- **WHEN** the User retries the voice-over
- **THEN** the command answers 200 with `held: true`, and no request is sent
- **AND** the voice-over phase reports one held unit
- **AND** when the User continues, exactly one request is sent

### Requirement: An accepted retry shows the voice-over in progress

From the moment a voice-over retry is accepted until its cycle ends, the session SHALL derive `voice-over-generating`, and the voice-over phase SHALL be `in-progress` with no `failure`. This SHALL hold whether the retry's attempt is scheduled, held by a pause, waiting for a request-cap slot, or in flight (§8.1). If the cycle then fails, the session SHALL derive `failed` again with the new failure.

#### Scenario: Accepted and running

- **WHEN** a voice-over retry is accepted and its attempt is in flight
- **THEN** the session derives `voice-over-generating`

#### Scenario: Accepted and held

- **GIVEN** a paused session
- **WHEN** a voice-over retry is accepted
- **THEN** the session derives `voice-over-generating` and remains paused, and the voice-over phase shows its held unit

### Requirement: The page offers the retry on a failed voice-over phase

`phaseActions` SHALL return a retry action for the voice-over phase when it is `failed` and its failure is retryable, and none otherwise. The Voice-over phase section SHALL show a `Retry voice-over` button for it. A click SHALL call the retry command, and the button SHALL be disabled while the request is outstanding. A 409 refusal SHALL be shown in the section as a readable sentence. The new state SHALL come from the live update, not from an optimistic change on the page.

#### Scenario: Button on a failed voice-over

- **GIVEN** a session read with the voice-over phase `failed`
- **WHEN** the page renders
- **THEN** the Voice-over phase section shows `Retry voice-over`

#### Scenario: No button otherwise

- **GIVEN** a voice-over phase `in-progress` or `complete`, or `failed` with `retryable: false`
- **WHEN** the page renders
- **THEN** no `Retry voice-over` button is shown

#### Scenario: Refusal shown

- **GIVEN** a page whose retry request is answered 409 with `retry-already-pending`
- **WHEN** the answer arrives
- **THEN** the Voice-over section shows that a retry is already in progress, and the button is enabled again
