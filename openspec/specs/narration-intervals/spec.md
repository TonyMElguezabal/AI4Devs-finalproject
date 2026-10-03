# narration-intervals Specification

## Purpose
TBD - created by archiving change assign-narration-intervals. Update Purpose after archive.
## Requirements
### Requirement: Intervals come from the shared boundary rule

Each fragment's narration interval SHALL be taken from the boundaries `unitBoundaries` computes for segmentation (D11 rule A: the previous scene absorbs the silence that follows it). A fragment covering units `first..last` SHALL have the interval `[b_first, b_(last+1)]`. The fragment's narrated duration SHALL be `end - start` of that interval, so the duration that chose the clip length and the interval the clip is fitted to cannot disagree.

#### Scenario: Interval of a multi-unit fragment

- **GIVEN** units with boundaries `[0, 4.2, 9.1, 13.5, 20.0]` and a fragment covering units 2..3
- **WHEN** segmentation produces the fragment
- **THEN** its interval is `[4.2, 13.5]` and its narrated duration is 9.3 s

#### Scenario: Pause between two fragments goes to the earlier one

- **GIVEN** fragment 1 whose last unit's speech ends at 6.0 s and fragment 2 whose first unit's speech starts at 6.8 s
- **WHEN** intervals are assigned
- **THEN** fragment 1's interval ends at 6.8 s and fragment 2's interval starts at 6.8 s

### Requirement: The intervals partition the voice-over

The intervals of a session's chunks, in chunk order, SHALL be contiguous and non-overlapping (each starts exactly where the previous one ends), SHALL each have a positive length, and SHALL cover the voice-over from 0 s to the MP3's measured duration (AC19, AC1-AC3 of JOS-143). Registration SHALL check this against the voice-over duration its caller passes (the same value segmentation measured with) before generating visual instructions or writing any chunk. A violation SHALL be recorded as a retryable decomposition failure whose cause says the system's decomposition was invalid and the User's script is unchanged, and no chunk SHALL be registered.

#### Scenario: Valid partition is registered

- **GIVEN** fragments with intervals `[0, 7.4]`, `[7.4, 15.0]`, `[15.0, 21.3]` and a voice-over of 21.3 s
- **WHEN** the decomposition is registered
- **THEN** three chunks are registered, carrying those intervals

#### Scenario: Silence before the first word and after the last

- **GIVEN** timestamps whose first spoken character starts at 0.1 s and whose last ends 0.35 s before the MP3's end
- **WHEN** intervals are assigned
- **THEN** the first interval starts at 0 s and the last ends at the MP3's measured duration

#### Scenario: A gap between intervals is refused

- **GIVEN** fragments with intervals `[0, 7.4]` and `[7.6, 15.0]` and a voice-over of 15.0 s
- **WHEN** the decomposition is registered
- **THEN** no chunk is registered and the session records a retryable decomposition failure naming the gap after scene 1

#### Scenario: An overlap is refused

- **GIVEN** fragments with intervals `[0, 7.4]` and `[7.2, 15.0]`
- **WHEN** the decomposition is registered
- **THEN** no chunk is registered and the session records a retryable decomposition failure

#### Scenario: Not starting at 0 or not reaching the end is refused

- **GIVEN** fragments whose first interval starts at 0.1 s, or whose last interval ends before the voice-over's measured duration
- **WHEN** the decomposition is registered
- **THEN** no chunk is registered and the session records a retryable decomposition failure

#### Scenario: Invalid voice-over duration

- **GIVEN** a decomposition registered with a voice-over duration of 0, a negative number or NaN
- **WHEN** registration checks the partition
- **THEN** no chunk is registered and the session records a decomposition failure, since the partition cannot be checked

### Requirement: The interval is stored with the chunk

Registration SHALL store each chunk's interval start and end, in seconds, in the same transaction that registers the chunk, so either every chunk exists with its interval or none does.

#### Scenario: Interval persisted and read back

- **GIVEN** a registered decomposition
- **WHEN** the session's chunks are read from the database
- **THEN** each chunk carries the interval registration gave it

### Requirement: The interval is immutable

Once a chunk is registered, its interval SHALL NOT change through any operation: processing, automatic retries, manual retries or corrections of visual instructions (PRD §3 "No permitida", JOS-143 AC4). The database SHALL refuse an update of either interval column with a `locked:` error, and no API route SHALL accept an interval as input.

#### Scenario: Direct update refused

- **GIVEN** a registered chunk
- **WHEN** an update of its interval start or end is attempted in the database
- **THEN** the database refuses it with `locked: scenes.narration_start_seconds cannot be modified once the chunk is established` (or the `narration_end_seconds` equivalent) and the interval is unchanged

#### Scenario: Retry leaves the interval unchanged

- **GIVEN** a registered chunk whose image stage failed and was retried, and whose image instruction was corrected
- **WHEN** the chunk is read again
- **THEN** its interval is the one registered

#### Scenario: Second decomposition does not replace intervals

- **GIVEN** a session whose chunks are registered
- **WHEN** another decomposition is attempted for it
- **THEN** it is refused as already registered and the stored intervals are unchanged

### Requirement: The interval is readable

The session read and each scene event SHALL expose the chunk's interval as `narrationInterval: { startSeconds, endSeconds }`, read-only, documented in `docs/api-spec.yml` and the generated OpenAPI. A scene without a stored interval (created by the pre-decomposition skeleton path) SHALL omit the field.

#### Scenario: Interval in the session read

- **GIVEN** a session with registered chunks
- **WHEN** the client reads the session
- **THEN** every scene carries `narrationInterval` with the registered start and end

#### Scenario: Skeleton scene without an interval

- **GIVEN** a scene created without a decomposition
- **WHEN** it is read
- **THEN** it has no `narrationInterval` field

