# Content lock

Requirements for what in a session can never change once set (JOS-137, US-04): the script, title and language from registration onward, and the narration once it is complete. This capability also states why retrying a voice attempt that failed before producing valid audio is not a regeneration. The retry endpoints themselves belong to JOS-154 and JOS-155.

## ADDED Requirements

### Requirement: The script, title and language cannot be modified after registration

From the moment a session is registered in `submitted`, and in every later state, the system SHALL refuse any modification of its script, title or language. This SHALL hold while the session is paused and after a voice failure. The refusal SHALL be enforced by the store itself, so that it applies to every caller, and the stored values SHALL remain exactly as submitted.

#### Scenario: A modification is attempted on a submitted session

- **GIVEN** a session in state `submitted`
- **WHEN** a modification of its script is attempted
- **THEN** the modification is refused
- **AND** the stored script is unchanged

#### Scenario: A modification is attempted while the session is paused

- **GIVEN** a paused session
- **WHEN** a modification of its script is attempted
- **THEN** the modification is refused
- **AND** the stored script is unchanged

#### Scenario: A modification is attempted after a voice failure

- **GIVEN** a session whose voice-over failed
- **WHEN** a modification of its script is attempted
- **THEN** the modification is refused
- **AND** the stored script is unchanged

#### Scenario: The title or language is modified

- **GIVEN** a registered session
- **WHEN** a modification of its title or its language is attempted
- **THEN** the modification is refused
- **AND** both are unchanged

#### Scenario: Other session fields still change normally

- **GIVEN** a registered session
- **WHEN** it is paused, continued, bound to a voice provider or marked failed
- **THEN** that change is stored
- **AND** the script, title and language are unchanged

#### Scenario: A session created before this rule existed

- **GIVEN** a session stored before the lock was introduced
- **WHEN** a modification of its script is attempted after the upgrade
- **THEN** the modification is refused

### Requirement: No API operation modifies the locked content

The API SHALL offer no operation that modifies a session's script, title or language, or that regenerates or replaces its narration. An operation that accepts a request body SHALL NOT change the script, title or language, even if the body names them.

#### Scenario: The API's operations are inspected

- **WHEN** the operations the API offers on a session are listed
- **THEN** none of them modifies the script, title or language
- **AND** none of them regenerates, replaces or deletes the voice-over

#### Scenario: A request body names the script

- **GIVEN** a registered session with a scene
- **WHEN** a request to an operation that accepts a body includes a different script
- **THEN** the session's script is unchanged

### Requirement: A completed narration is never replaced

Once a session has a voice-over, the system SHALL NOT replace, modify or delete its record, and SHALL NOT overwrite its MP3 file. A second voice-over for the same session SHALL be refused, as `voice-over-generation` already requires. These refusals SHALL be enforced by the store and by the file write itself, not only by the calling code.

#### Scenario: The voice-over record is modified

- **GIVEN** a session with a completed voice-over
- **WHEN** a modification of its voice-over record is attempted
- **THEN** the modification is refused
- **AND** the record is unchanged

#### Scenario: The voice-over record is deleted

- **GIVEN** a session with a completed voice-over
- **WHEN** a deletion of its voice-over record is attempted
- **THEN** the deletion is refused
- **AND** the record still exists

#### Scenario: The MP3 file is written again

- **GIVEN** a session whose MP3 already exists in its project folder
- **WHEN** another MP3 is written to the same path
- **THEN** the write is refused
- **AND** the existing file is unchanged

### Requirement: Voice generation does not launch for a completed narration

The system SHALL decide whether voice generation may launch for a session from whether that session has a voice-over, and SHALL refuse the launch when it has one. Every caller that launches voice generation SHALL use this decision.

#### Scenario: Regeneration is requested for a completed narration

- **GIVEN** a session with a completed voice-over
- **WHEN** voice generation is requested for it
- **THEN** the launch is refused as a completed narration
- **AND** no request is sent to the voice provider
- **AND** the MP3 is unchanged

#### Scenario: A later phase failed after the narration completed

- **GIVEN** a session with a completed voice-over that later failed in another phase
- **WHEN** voice generation is requested for it
- **THEN** the launch is refused as a completed narration

### Requirement: A retry after a failed voice attempt is allowed

A session whose voice attempts all failed before producing valid audio SHALL have no voice-over, and voice generation SHALL be allowed to launch for it again. That launch SHALL NOT be treated as regenerating a completed narration.

#### Scenario: The voice provider rejected the request

- **GIVEN** a session whose voice attempt failed and which has no voice-over
- **WHEN** voice generation is requested for it again
- **THEN** the launch is allowed

#### Scenario: The provider returned audio that could not be decoded

- **GIVEN** a session whose voice attempt returned audio that was not a decodable MP3, so no voice-over was stored
- **WHEN** voice generation is requested for it again
- **THEN** the launch is allowed

#### Scenario: A session that has not started narration yet

- **GIVEN** a session in `submitted` with no voice attempt
- **WHEN** voice generation is requested for it
- **THEN** the launch is allowed
