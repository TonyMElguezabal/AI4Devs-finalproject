# Voice-over generation

Requirements for producing a session's single narration from its locked script. Retrying failed attempts (US-22, US-23), holding a launch while paused (US-20), capping simultaneous requests (US-37), resuming in-flight requests after a restart (US-28) and interpreting timestamps (US-06) are owned by their own stories; this capability covers when generation starts, what is sent, how the provider is bound, what is kept, how failures are classified and reported, and why a completed narration is never produced again.

## ADDED Requirements

### Requirement: Generation starts automatically from a registered session

The system SHALL launch voice-over generation for a session registered in `submitted` without any further action from the User. The session SHALL be in state `voice-over-generating` before the request is sent to the voice provider.

#### Scenario: A session has just been registered

- **WHEN** a session is registered in state `submitted`
- **THEN** voice-over generation is launched without further User action
- **AND** the session state is `voice-over-generating` before the provider request is sent

#### Scenario: The User observes the session while generation is in progress

- **WHEN** the session is read while the voice provider has not yet responded
- **THEN** its state is `voice-over-generating`

### Requirement: The locked script is sent to the provider unaltered

The text sent to the voice provider SHALL be identical to the session's stored script. The voice, quality and speed SHALL be the hardcoded values, and the language SHALL be the session's selected language. The system SHALL NOT trim, summarise, rewrite or split the script to fit a provider restriction.

#### Scenario: A script is sent for narration

- **WHEN** the voice request for a session is built
- **THEN** the text it carries is identical to the session's stored script
- **AND** the voice, quality and speed are the hardcoded values
- **AND** the language is the session's selected language

#### Scenario: A very long script is sent

- **WHEN** a session whose script is far longer than the 1500-word reference is narrated
- **THEN** the text sent is the complete script, unaltered

### Requirement: The voice provider is bound to the session

On the first voice attempt for a session, the system SHALL record the provider used as the session's voice provider. Every later voice attempt for that session SHALL use the bound provider.

#### Scenario: The first attempt is sent

- **WHEN** the first voice attempt for a session is sent
- **THEN** the provider used is recorded as the session's voice provider

#### Scenario: A later attempt is sent

- **WHEN** a later voice attempt for the same session is sent
- **THEN** it uses the session's bound voice provider

### Requirement: Each attempt is recorded before its request is sent

The system SHALL persist a record of each voice attempt — stage, provider, attempt sequence, and queued and sent times — before the request reaches the provider. The record SHALL be completed with its outcome and, where the provider supplies one, its external request identifier.

#### Scenario: The provider has not yet responded

- **WHEN** a voice request has been sent and no response has arrived
- **THEN** an attempt record exists for it with outcome `in-flight`

#### Scenario: An attempt finishes

- **WHEN** the provider responds to a voice request
- **THEN** its attempt record carries the outcome and the finish time

### Requirement: A successful generation yields exactly one MP3

When the voice provider returns audio, the system SHALL store exactly one MP3 for the session in the session's project folder, referenced by a path relative to that folder, and SHALL record its duration and size. The MP3 SHALL be decodable with a duration greater than zero. The session state SHALL then be `voice-over-complete`.

#### Scenario: The provider returns audio

- **WHEN** the voice provider returns audio for a session
- **THEN** exactly one MP3 is stored for that session in its project folder
- **AND** its duration and size are recorded
- **AND** the session state is `voice-over-complete`

#### Scenario: The returned audio cannot be decoded

- **WHEN** the voice provider reports success but the audio is not a decodable MP3 with a duration above zero
- **THEN** the attempt is recorded as failed
- **AND** the session does not reach `voice-over-complete`

### Requirement: Native timestamps returned with the audio are kept

When the voice provider returns timestamps together with the audio, the system SHALL store them unmodified alongside the MP3 and record that they are available. When it returns none, the system SHALL record that none are available. This capability SHALL NOT interpret or validate the timestamps.

#### Scenario: The provider returns timestamps

- **WHEN** the voice provider returns timestamps with the audio
- **THEN** they are stored unmodified next to the MP3
- **AND** the voice-over records that native timestamps are available

#### Scenario: The provider returns no timestamps

- **WHEN** the voice provider returns audio without timestamps
- **THEN** the voice-over records that native timestamps are not available

### Requirement: A not-retryable failure is reported without altering the script

When the voice provider rejects a request for a reason it signals as not retryable — including a content-filter rejection or an input it cannot accept — the system SHALL record the attempt as not retryable, SHALL place the session in `failed` with the failed phase `voice-over` and a comprehensible cause, and SHALL NOT make an automatic retry. No MP3 SHALL be stored and the script SHALL remain unchanged.

#### Scenario: The provider rejects the script's content

- **WHEN** the voice provider rejects the script for a not-retryable reason
- **THEN** the attempt is recorded as not retryable with the provider's cause
- **AND** the session state is `failed` with failed phase `voice-over` and the cause shown
- **AND** no automatic retry is made

#### Scenario: The provider cannot accept the script's length

- **WHEN** the voice provider refuses the script because it exceeds a limit of the provider
- **THEN** the cause is reported
- **AND** the stored script is unchanged and no shortened version is sent

### Requirement: A transient failure is classified and handed to the retry policy

When the voice provider fails for a reason that may succeed on a later attempt, the system SHALL record the attempt as transient with its cause and hand it to the automatic retry policy. Where no retry policy is in place, the session SHALL be placed in `failed` with failed phase `voice-over`.

#### Scenario: The provider times out

- **WHEN** a voice request fails for a transient reason
- **THEN** the attempt is recorded as transient with its cause

#### Scenario: No retry policy is available

- **WHEN** a voice attempt fails transiently and no automatic retry policy is in place
- **THEN** the session state is `failed` with failed phase `voice-over`

### Requirement: A missing credential fails without calling the provider

When the voice provider's credential is absent from the local environment and the local secrets file, the system SHALL NOT send the request, SHALL place the session in `failed` with failed phase `voice-over`, and SHALL report a cause naming the missing credential without revealing any secret value.

#### Scenario: The credential is not configured

- **WHEN** a voice attempt is launched and the provider credential is absent
- **THEN** no request is sent to the provider
- **AND** the session state is `failed` with a cause naming the missing credential
- **AND** the cause contains no secret value

### Requirement: A session has at most one voice-over

The store SHALL enforce that a session has at most one voice-over. A repeated success confirmation SHALL NOT create a second MP3 or voice-over record and SHALL NOT launch any following phase again. No operation SHALL launch voice generation for a session in `voice-over-complete` or any later state.

#### Scenario: The same success confirmation arrives twice

- **WHEN** a success confirmation for a session that already has a voice-over is processed
- **THEN** no second voice-over is stored
- **AND** nothing is launched again

#### Scenario: Two confirmations arrive concurrently

- **WHEN** two success confirmations for the same session are processed at the same time
- **THEN** exactly one voice-over is stored

#### Scenario: Generation is requested after completion

- **WHEN** voice generation is requested for a session in `voice-over-complete` or a later state
- **THEN** no request is sent to the provider
- **AND** the stored MP3 is unchanged

### Requirement: The session exposes the voice-over outcome

The session representation SHALL expose the voice-over's provider, duration, native-timestamp availability and completion time once it exists, and the failed phase, cause and retryability when the voice-over failed. It SHALL NOT expose a download of the MP3. Each voice-over state change SHALL be published to the live-update mechanism.

#### Scenario: The voice-over is complete

- **WHEN** a session in `voice-over-complete` is read
- **THEN** its representation includes the voice provider, the duration, whether native timestamps are available and the completion time

#### Scenario: The voice-over failed

- **WHEN** a session whose voice-over failed is read
- **THEN** its representation includes the failed phase `voice-over`, the cause and whether it is retryable

#### Scenario: A download of the MP3 is sought

- **WHEN** the application's download options for a session are inspected
- **THEN** no download of the voice-over MP3 is offered

#### Scenario: The state changes while the session page is open

- **WHEN** the session moves between `submitted`, `voice-over-generating`, `voice-over-complete` and `failed`
- **THEN** each change is published to the live-update mechanism
