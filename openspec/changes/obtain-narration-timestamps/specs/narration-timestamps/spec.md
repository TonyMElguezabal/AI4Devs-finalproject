# Narration timestamps

Requirements for obtaining where each part of the script sits in the narration (JOS-139, US-06; PRD §5 step 3, §8.1, §10.3, §11.1). Segmenting the script, turning timestamps into narration intervals, and the retry budget and scheduling belong to their own capabilities.

## ADDED Requirements

### Requirement: Obtaining timestamps starts the decomposition phase

The system SHALL obtain timestamps only for a session that has a completed voice-over. Before any timestamps are read or any provider is called, the system SHALL record a `timestamps` stage attempt, and from then on, until chunks exist or the phase fails, the session state SHALL be `chunk-decomposing`. A session whose timestamps are already stored SHALL NOT obtain them again.

#### Scenario: Decomposition starts from a completed voice-over

- **GIVEN** a session in `voice-over-complete`
- **WHEN** timestamps are obtained for it
- **THEN** a `timestamps` stage attempt is recorded before any provider request
- **AND** the session state is `chunk-decomposing`

#### Scenario: The session has no voice-over

- **GIVEN** a session without a completed voice-over
- **WHEN** timestamps are requested for it
- **THEN** the request is refused and nothing is recorded

#### Scenario: The timestamps are already stored

- **GIVEN** a session whose timestamps are stored
- **WHEN** timestamps are requested again
- **THEN** the request is refused and the stored timestamps are unchanged

### Requirement: Usable native timestamps are used

When the voice-over has native timestamps and they are usable, the system SHALL use them and SHALL NOT call the alignment provider. Timestamps SHALL be usable only when they contain at least one character, their characters joined reproduce the locked script, every time is non-negative and finite, each character ends no earlier than it starts, starts never go backwards, and the last end is within the MP3's duration plus half a second.

#### Scenario: The native timestamps are usable

- **GIVEN** a voice-over whose native timestamps reproduce the script with valid times
- **WHEN** timestamps are obtained
- **THEN** the native timestamps are stored with mechanism `native`
- **AND** the alignment provider is not called

#### Scenario: The native timestamps do not match the script

- **GIVEN** native timestamps whose characters do not reproduce the script
- **WHEN** they are checked
- **THEN** they are unusable

#### Scenario: The native timestamps have invalid times

- **GIVEN** native timestamps with a negative time, a character ending before it starts, starts going backwards, or an end beyond the MP3's duration
- **WHEN** they are checked
- **THEN** they are unusable

### Requirement: Forced alignment is used when native timestamps are missing or unusable

When the voice-over has no native timestamps, or its native timestamps are unusable, the system SHALL send the stored MP3 and the locked script to the alignment provider and SHALL use its result if it is usable. The result SHALL be usable under the same rules as native timestamps, except that its characters need to reproduce the script only apart from whitespace. The voice provider SHALL NOT be called and the MP3 SHALL NOT change.

#### Scenario: The voice provider delivered no timestamps

- **GIVEN** a voice-over without native timestamps
- **WHEN** timestamps are obtained
- **THEN** the alignment provider receives the stored MP3 and the locked script
- **AND** its timestamps are stored with mechanism `alignment`

#### Scenario: The native timestamps are unusable

- **GIVEN** a voice-over whose native timestamps are unusable
- **WHEN** timestamps are obtained
- **THEN** the alignment provider is called in the same attempt
- **AND** its timestamps are stored with mechanism `alignment`
- **AND** the voice provider is not called and the MP3 is unchanged

### Requirement: Obtained timestamps are stored once and never replaced

The system SHALL store the obtained timestamps once per session, in one format whatever the mechanism (per character: its text, start and end, and the mechanism used), as a file in the session's project folder and a record referencing it. Neither SHALL ever be modified, deleted or replaced.

#### Scenario: Timestamps are stored

- **GIVEN** usable timestamps
- **WHEN** they are stored
- **THEN** the project folder holds them in the common format, and the session's record names the mechanism and the file

#### Scenario: The record is changed directly in the store

- **GIVEN** stored timestamps
- **WHEN** their record is updated or deleted
- **THEN** the store refuses it

### Requirement: Failing to obtain timestamps is a decomposition failure

When neither mechanism yields usable timestamps, the system SHALL complete the attempt as failed and SHALL record a failure of the `decomposition` phase on the session, retryable unless the alignment provider answered a client error other than 408 or 429. It SHALL NOT record a voice failure, and the voice-over SHALL remain unchanged.

#### Scenario: Alignment cannot produce usable timestamps

- **GIVEN** a voice-over without usable native timestamps and an alignment provider that fails or returns unusable timestamps
- **WHEN** timestamps are obtained
- **THEN** the session state is `failed` with failed phase `decomposition`
- **AND** no voice failure is recorded and the voice-over is unchanged
- **AND** no timestamps are stored

### Requirement: A retry after unusable native timestamps goes straight to alignment

Once a session's native timestamps have been judged unusable, every later attempt of the `timestamps` stage for that session SHALL call the alignment provider directly, without checking the native timestamps again, without calling the voice provider and without regenerating the MP3.

#### Scenario: The stage is retried after unusable native timestamps

- **GIVEN** a session whose earlier `timestamps` attempt found the native timestamps unusable and then failed
- **WHEN** the stage is attempted again
- **THEN** the alignment provider is called directly
- **AND** the voice provider is not called and the MP3 is unchanged
