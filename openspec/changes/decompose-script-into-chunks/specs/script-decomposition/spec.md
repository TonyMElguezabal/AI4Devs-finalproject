# Script decomposition

Requirements for turning a session's locked script and completed voice-over into an ordered set of chunks with narration intervals and visual instructions. Retrying failed attempts, the per-stage request cap, pausing a launch, and resuming in-flight requests after a restart are owned by `stage-retry-policy`, `stage-execution-time-limit` and their siblings; this capability covers when the phase starts, how timestamps are obtained, how the script is segmented, what a valid result must satisfy, and how its two recoverable failures are retried. Assigning chunk identifiers, generating the `IMAGE` and `VIDEO` instructions, checking the finished structure (four fields, §6.1 bounds, script reconstruction) and registering the chunks moved to `assign-scene-identifiers` (JOS-144); this capability hands it the ordered fragments. Starting the decomposition phase and obtaining the narration timestamps (native or forced alignment) moved to `obtain-narration-timestamps` (JOS-139); this capability receives the stored timestamps. Cutting the script into fragments of whole sentences within the duration bounds, including a script shorter than the lower bound, moved to `segment-script-into-chunks` (JOS-140); the clause-boundary requirements below stay here for JOS-141.

## ADDED Requirements

### Requirement: A sentence exceeding the upper bound is split at a clause boundary

When a single sentence's narrated duration by itself exceeds the video provider's maximum admitted duration, the system SHALL split it at a clause boundary (comma, semicolon, or conjunction). This SHALL be the only division permitted inside a sentence.

#### Scenario: One sentence alone exceeds the maximum

- **WHEN** a single sentence's narrated duration exceeds the video provider's maximum admitted duration
- **THEN** it is split at a clause boundary into two chunks
- **AND** no sentence is split at any point other than a clause boundary

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

### Requirement: Chunk intervals partition the voice-over without gaps or overlaps

The system SHALL verify, before completing decomposition, that the chunks' narration intervals, taken in ascending identifier order, are contiguous and non-overlapping, starting at second 0 and ending at the voice-over's total duration. A violation SHALL be treated as a decomposition failure of the system.

#### Scenario: The partition is valid

- **WHEN** decomposition completes for a session
- **THEN** the chunks' narration intervals cover from second 0 to the voice-over's total duration with no gap and no overlap

#### Scenario: A gap or overlap exists

- **WHEN** the computed chunk intervals leave a gap or overlap
- **THEN** decomposition is recorded as failed as a system defect

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
