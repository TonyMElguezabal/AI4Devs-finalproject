# decomposition-manual-retry

Requirements for retrying a failed decomposition by hand (PRD §10.2, §10.3 timestamps and decomposition rows, §11.1; US-24). Obtaining the timestamps is owned by `obtain-narration-timestamps` (US-06), division into chunks by `segment-script-into-chunks` and `assign-scene-identifiers` (US-07, US-11), retry cycles by `stage-retry-policy` (US-22), pause by `session-pause` (US-20), and the phase sections by `session-phase-progress` (US-18).

## ADDED Requirements

### Requirement: A failed decomposition can be retried by command

The system SHALL accept `POST /sessions/:sessionId/decomposition/retry` for a session that derives `failed` with `failedPhase: "decomposition"` and has no chunks, and whose failure is retryable (`manualRetryAvailable`). An accepted retry SHALL answer 200 with `held` saying whether a pause holds it. The command SHALL refuse with 409 and a reason, and SHALL call no provider, when:

- the session is not failed in decomposition (`not-failed-in-decomposition`);
- it has chunks (`already-registered`);
- a retry is already pending or running (`retry-already-pending`);
- the failure is not retryable (`not-retryable`).

An unknown or malformed session identifier SHALL answer 404. A request body with any field SHALL answer 400.

#### Scenario: Retry accepted

- **GIVEN** a session `failed` in decomposition with no chunks
- **WHEN** the User retries the decomposition
- **THEN** the command answers 200 with `held: false`

#### Scenario: Retry refused after a not-retryable failure

- **GIVEN** a session whose segmentation was refused with `retryable: false`
- **WHEN** the User retries the decomposition
- **THEN** the command answers 409 with `not-retryable`, no provider is called, and no cycle is opened

#### Scenario: Session already has chunks

- **GIVEN** a session whose chunks are registered
- **WHEN** a decomposition retry is requested
- **THEN** the command answers 409 with `already-registered`, no provider is called, and the chunks are unchanged

#### Scenario: Session not failed in decomposition

- **GIVEN** a session in `chunk-decomposing`, or `failed` with `failedPhase: "voice-over"`
- **WHEN** a decomposition retry is requested
- **THEN** the command answers 409 with `not-failed-in-decomposition` and no provider is called

#### Scenario: Two retries at once

- **GIVEN** a session `failed` in decomposition
- **WHEN** two retry requests arrive concurrently
- **THEN** exactly one answers 200, the other answers 409 with `retry-already-pending`, and exactly one new cycle is opened

#### Scenario: Unknown session or a body

- **WHEN** a decomposition retry is requested for an unknown identifier, or with a body `{ "script": "x" }`
- **THEN** the command answers 404 or 400 respectively, and nothing is changed or sent

### Requirement: A timestamps retry runs on the same audio

When the session has no stored timestamps, the retry SHALL obtain them again from the session's stored MP3. If an earlier attempt judged the native timestamps unusable, the retry SHALL go directly to forced alignment without re-checking them (§10.3, §11.1). The new attempt SHALL be recorded under the `timestamps` stage.

#### Scenario: Alignment unavailable, then retried

- **GIVEN** a session whose forced alignment failed transiently and whose cycle is exhausted
- **WHEN** the User retries the decomposition and the alignment provider answers
- **THEN** the timestamps are obtained from the same MP3, the chunks are registered, and the session leaves `failed`

#### Scenario: Native timestamps were unusable

- **GIVEN** a session whose native timestamps were judged unusable and whose alignment then failed
- **WHEN** the User retries the decomposition
- **THEN** the retry sends the stored MP3 to the alignment provider and does not read the native timestamps again

### Requirement: A division retry re-divides the same script

When the session has stored timestamps and no chunks, the retry SHALL segment the session's locked script again from those stored timestamps, request the `IMAGE` and `VIDEO` instructions again, and register the chunks. The retry SHALL NOT obtain the timestamps again, and SHALL NOT change the script, title or language (§10.3).

#### Scenario: Reasoning provider failed, then retried

- **GIVEN** a session with stored timestamps whose instruction request failed
- **WHEN** the User retries the decomposition and the reasoning provider answers
- **THEN** the same script is divided from the same timestamps, the chunks are registered in order, and the session moves to `chunks-processing`
- **AND** no `timestamps` attempt is added
- **AND** the stored script is unchanged

#### Scenario: Fragments reconstruct the same script

- **WHEN** a division retry registers its chunks
- **THEN** the chunks' `PROMPT` fields, in order, reconstruct the stored script exactly

### Requirement: The division step is recorded as an attempt

Each try of the division step SHALL record one attempt under the `decomposition` stage, in flight before segmentation or any request. It SHALL end `success` when the chunks are registered, `transient` for a retryable failure and `not-retryable` otherwise. A failure the step writes SHALL carry the attempt's cycle and its position in that cycle.

#### Scenario: A failed division is recorded

- **GIVEN** a division whose instruction request fails retryably
- **THEN** one `decomposition` attempt is recorded as `transient`, and the session's failure names cycle 1 and one attempt

#### Scenario: A retried division is recorded in a new cycle

- **GIVEN** a failed division that is retried and fails again
- **THEN** the new attempt is in cycle 2, the first attempt is still recorded, and the new failure names cycle 2

### Requirement: A decomposition retry never regenerates the voice-over

No decomposition retry SHALL call the voice provider, or write or delete the voice-over's MP3, its record or its native timestamps file (§10.3, AC3).

#### Scenario: Voice untouched on a timestamps retry

- **GIVEN** a session with a stored MP3 whose timestamps step failed
- **WHEN** the decomposition is retried, whether the retry succeeds or fails
- **THEN** the voice provider receives no request, and the MP3's bytes, the voice-over record and the native timestamps file are unchanged

#### Scenario: Voice untouched on a division retry

- **GIVEN** a session whose division step failed
- **WHEN** the decomposition is retried
- **THEN** the voice provider receives no request and the MP3's bytes are unchanged

### Requirement: A retry opens a new cycle on the failed step, through the launch gate

An accepted retry SHALL open a new cycle on the stage instance of the failed step: `timestamps` when no timestamps are stored, `decomposition` otherwise. It SHALL keep earlier cycles recorded (§10.2, D06), and SHALL be launched through the phase-launch gate by the `decomposition` stage launcher. While the session is paused, the retry SHALL be accepted, counted as one held unit of the decomposition stage, and launched exactly once when the User continues (§9).

#### Scenario: Cycle on the timestamps instance

- **GIVEN** a session failed in its timestamps step
- **WHEN** the decomposition is retried
- **THEN** a new cycle is opened on the session's `timestamps` stage instance and not on its `decomposition` instance

#### Scenario: Retry during a pause

- **GIVEN** a paused session `failed` in decomposition
- **WHEN** the User retries the decomposition
- **THEN** the command answers 200 with `held: true`, no provider is called, and the held list shows the decomposition stage with one unit
- **AND** when the User continues, the decomposition runs exactly once

### Requirement: An accepted retry shows the decomposition in progress

From the moment a decomposition retry is accepted until its cycle ends, the session SHALL derive `chunk-decomposing`, and the decomposition phase SHALL be `in-progress` with no `failure`. This SHALL hold whether the retry's attempt is scheduled, held, waiting for a request-cap slot, or in flight, and for either step (§8.1).

#### Scenario: Division retry in progress

- **WHEN** a division retry is accepted
- **THEN** the session derives `chunk-decomposing` until the chunks are registered or the cycle fails

#### Scenario: The retry fails again

- **GIVEN** a decomposition retry in progress
- **WHEN** its cycle ends in failure
- **THEN** the session derives `failed` with `failedPhase: "decomposition"` and the new cause

### Requirement: The page offers the retry on a failed decomposition phase

`phaseActions` SHALL return a retry action for the decomposition phase when it is `failed` and its failure is retryable, and none otherwise. The Decomposition phase section SHALL show a `Retry decomposition` button for it. A click SHALL call the retry command, and the button SHALL be disabled while the request is outstanding. A 409 refusal SHALL be shown in the section as a readable sentence. The new state SHALL come from the live update.

#### Scenario: Button on a failed decomposition

- **GIVEN** a session read with the decomposition phase `failed`
- **WHEN** the page renders
- **THEN** the Decomposition phase section shows `Retry decomposition`

#### Scenario: No button otherwise

- **GIVEN** a decomposition phase `pending`, `in-progress` or `complete`, or `failed` with `retryable: false`
- **WHEN** the page renders
- **THEN** no `Retry decomposition` button is shown
