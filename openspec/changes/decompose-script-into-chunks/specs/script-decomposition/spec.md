# Script decomposition

Requirements for turning a session's locked script and completed voice-over into an ordered set of chunks with narration intervals and visual instructions. Retrying failed attempts, the per-stage request cap, pausing a launch, and resuming in-flight requests after a restart are owned by `stage-retry-policy`, `stage-execution-time-limit` and their siblings; this capability covers when the phase starts, how timestamps are obtained, how the script is segmented, what a valid result must satisfy, and how its two recoverable failures are retried.

## ADDED Requirements

### Requirement: Decomposition starts automatically from a completed voice-over

The system SHALL launch decomposition for a session in `voice-over-complete` without any further action from the User. The session SHALL be in state `chunk-decomposing` before any provider is called for this phase.

#### Scenario: A voice-over has just completed

- **WHEN** a session reaches `voice-over-complete`
- **THEN** decomposition is launched without further User action
- **AND** the session state is `chunk-decomposing` before any provider request is sent

### Requirement: Native timestamps are used when usable, alignment otherwise

The system SHALL use the voice-over's native timestamps to derive chunk intervals when they are available and usable. When native timestamps are not available, or are available but not usable, the system SHALL invoke the alignment provider with the generated MP3 and the locked script to obtain them. Neither case SHALL call the voice provider again.

#### Scenario: Native timestamps are usable

- **WHEN** a session's voice-over has native timestamps available and usable
- **THEN** decomposition derives chunk intervals from them
- **AND** the alignment provider is not called

#### Scenario: No native timestamps were returned

- **WHEN** a session's voice-over has no native timestamps
- **THEN** the alignment provider is called with the MP3 and the script

#### Scenario: Native timestamps exist but are unusable

- **WHEN** a session's voice-over has native timestamps that are too coarse to place a sentence boundary
- **THEN** the alignment provider is called with the MP3 and the script
- **AND** the voice provider is not called again

### Requirement: Failure to obtain timestamps by either mechanism is a decomposition failure

When neither native timestamps nor forced alignment produce usable timestamps, the system SHALL classify the failure as a decomposition failure, not a voice failure, and SHALL hand it to the `timestamps` stage instance's retry policy.

#### Scenario: Alignment cannot produce timestamps

- **WHEN** the alignment provider fails to return usable timestamps
- **THEN** the failure is recorded against the `timestamps` stage instance
- **AND** it is not recorded as a voice-over failure

### Requirement: Chunks are cut on sentence boundaries within provider-admitted durations

The system SHALL group one or more complete consecutive sentences into each chunk, cutting only at sentence boundaries. A chunk's narrated duration SHALL NOT exceed the active video provider's maximum admitted duration and SHALL NOT fall below the hardcoded lower bound, except as provided by the edge cases below. Among groupings that satisfy both bounds, the system SHALL prefer the one whose narrated duration is closest to a duration the video provider admits.

#### Scenario: A script segments into ordinary chunks

- **WHEN** a script's sentences can be grouped so every chunk's narrated duration is between the lower bound and the video provider's maximum
- **THEN** each chunk is formed from one or more complete consecutive sentences
- **AND** no chunk boundary falls inside a sentence

#### Scenario: A grouping is chosen closest to an admitted duration

- **WHEN** more than one valid grouping of consecutive sentences satisfies both bounds for a candidate chunk
- **THEN** the grouping whose narrated duration is closest to a duration the video provider admits is chosen

### Requirement: A sentence exceeding the upper bound is split at a clause boundary

When a single sentence's narrated duration by itself exceeds the video provider's maximum admitted duration, the system SHALL split it at a clause boundary (comma, semicolon, or conjunction). This SHALL be the only division permitted inside a sentence.

#### Scenario: One sentence alone exceeds the maximum

- **WHEN** a single sentence's narrated duration exceeds the video provider's maximum admitted duration
- **THEN** it is split at a clause boundary into two chunks
- **AND** no sentence is split at any point other than a clause boundary

### Requirement: A script shorter than the lower bound becomes one chunk

When the entire script's narrated duration is below the hardcoded lower bound, the system SHALL produce a single chunk covering the whole script.

#### Scenario: The whole script is very short

- **WHEN** a script's total narrated duration is below the hardcoded lower bound
- **THEN** exactly one chunk is produced for the entire script

### Requirement: A short sentence borrows a clause-bounded prefix from the next sentence

When a sentence's narrated duration is below the lower bound and grouping it with the following sentence would exceed the upper bound, the system SHALL split the following sentence at a clause boundary and group the short sentence with that split's first part.

#### Scenario: A short sentence cannot be grouped whole with the next

- **WHEN** a sentence below the lower bound would exceed the upper bound if grouped with the whole following sentence
- **THEN** the following sentence is split at a clause boundary
- **AND** the short sentence is grouped with the first part of that split

### Requirement: A sentence with no clause boundary is kept whole despite exceeding the upper bound

When a sentence must be split — because it exceeds the upper bound alone, or because it is the following sentence in the short-sentence case above — but contains no comma, semicolon, or conjunction to split at, the system SHALL keep it whole in a single chunk even though that chunk exceeds the upper bound, and SHALL record a speed-factor warning for it. This SHALL NOT be treated as a failure.

#### Scenario: An oversized sentence has no clause boundary

- **WHEN** a sentence that must be split has no comma, semicolon, or conjunction
- **THEN** it is kept whole in one chunk exceeding the upper bound
- **AND** a speed-factor warning is recorded for that chunk
- **AND** decomposition does not fail because of it

### Requirement: Each chunk receives a consecutive, session-scoped, immutable identifier

The system SHALL assign each chunk a numeric identifier from 1 to N by order of appearance in the script. The identifier SHALL be unique within the session, but not necessarily unique across sessions, and SHALL NOT change during processing or any later retry.

#### Scenario: Chunks are numbered by appearance order

- **WHEN** a script decomposes into N chunks
- **THEN** their identifiers are the consecutive integers 1 to N in order of appearance in the script

#### Scenario: A chunk is retried

- **WHEN** a chunk's image or video stage is retried
- **THEN** its identifier is unchanged

### Requirement: Every chunk receives complete visual instructions

For every chunk, the system SHALL generate an `IMAGE` instruction and a `VIDEO` instruction from that chunk's `PROMPT`, using the reasoning provider. Generating these instructions SHALL NOT be treated as a modification of the script.

#### Scenario: A chunk is produced

- **WHEN** a chunk is produced by decomposition
- **THEN** it carries a non-empty `IMAGE` instruction and a non-empty `VIDEO` instruction generated from its `PROMPT`

### Requirement: The joined chunk prompts reconstruct the script exactly

The system SHALL verify, before completing decomposition, that the `PROMPT` fields of all chunks, joined in ascending identifier order, are identical to the session's locked script except for normalized whitespace. A mismatch SHALL be treated as a decomposition failure of the system, never as an error in the User's script.

#### Scenario: The reconstruction matches

- **WHEN** decomposition completes for a session
- **THEN** the chunks' `PROMPT` fields joined in order equal the locked script, aside from whitespace normalization

#### Scenario: The reconstruction does not match

- **WHEN** the joined `PROMPT` fields do not reconstruct the locked script
- **THEN** decomposition is recorded as failed
- **AND** the failure is attributed to the system, not to the User's script

### Requirement: Chunk intervals partition the voice-over without gaps or overlaps

The system SHALL verify, before completing decomposition, that the chunks' narration intervals, taken in ascending identifier order, are contiguous and non-overlapping, starting at second 0 and ending at the voice-over's total duration. A violation SHALL be treated as a decomposition failure of the system.

#### Scenario: The partition is valid

- **WHEN** decomposition completes for a session
- **THEN** the chunks' narration intervals cover from second 0 to the voice-over's total duration with no gap and no overlap

#### Scenario: A gap or overlap exists

- **WHEN** the computed chunk intervals leave a gap or overlap
- **THEN** decomposition is recorded as failed as a system defect

### Requirement: An incomplete chunk structure is a decomposition failure

The system SHALL verify, before completing decomposition, that every chunk carries all four content fields (`ID`, `PROMPT`, `IMAGE`, `VIDEO`). A chunk missing any of them SHALL be treated as a decomposition failure of the system, never as an error in the User's script.

#### Scenario: A chunk is missing a field

- **WHEN** any produced chunk lacks one of its four content fields
- **THEN** decomposition is recorded as failed
- **AND** the failure is attributed to the system, not to the User's script

### Requirement: Timestamps and decomposition are retried as separate stage instances

The system SHALL track `timestamps` and `decomposition` as two distinct stage instances of the session, each with its own retry budget under `stage-retry-policy` and its own maximum execution time under `stage-execution-time-limit`. Exhausting one instance's budget SHALL NOT consume the other's.

#### Scenario: Timestamps fail transiently and recover

- **WHEN** the `timestamps` stage instance fails transiently and later succeeds within its own retry budget
- **THEN** the `decomposition` stage instance starts with a full retry budget of its own

### Requirement: A manual retry of timestamps stays on the same audio and mechanism-appropriate provider

When the User manually retries a failed `timestamps` stage instance, the system SHALL retry against the same MP3. If native timestamps were returned but judged unusable, the retry SHALL go directly to the alignment provider without calling the voice provider again.

#### Scenario: A manual retry follows an unusable-native-timestamps failure

- **WHEN** the User manually retries a `timestamps` stage instance that failed because native timestamps were unusable
- **THEN** the retry is sent to the alignment provider
- **AND** the voice provider is not called

### Requirement: A manual retry of decomposition re-splits the same script

When the User manually retries a failed `decomposition` stage instance, the system SHALL re-run segmentation on the same locked script and the same timestamps, without rewriting the script or regenerating the voice-over.

#### Scenario: Decomposition is retried manually

- **WHEN** the User manually retries a failed `decomposition` stage instance
- **THEN** the script and the voice-over are unchanged
- **AND** segmentation is re-run to produce a new set of chunks
