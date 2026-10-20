# clip-duration-request Specification

## Purpose
TBD - created by archiving change request-admitted-clip-duration. Update Purpose after archive.
## Requirements
### Requirement: The requested duration is the admitted duration needing the smallest speed change

Each registered chunk's requested duration SHALL be chosen from the video provider's hardcoded admitted durations as the one whose speed change to match the chunk's narrated duration (`end - start` of its interval) is smallest, where the speed change is `max(requested / narrated, narrated / requested)`. It SHALL be chosen even when it is shorter than the interval. An exact tie SHALL go to the longer duration.

#### Scenario: Smallest speed change, not fewest seconds

- **GIVEN** the admitted durations 5 to 15 whole seconds and a chunk whose interval lasts 5.49 s
- **WHEN** the chunk is registered
- **THEN** its requested duration is 6 s (a speed change of 1.093), not 5 s (1.098), even though 5 s is fewer seconds away

#### Scenario: A shorter admitted duration is chosen when it is closer

- **GIVEN** a chunk whose interval lasts 9.4 s
- **WHEN** the chunk is registered
- **THEN** its requested duration is 9 s, which is shorter than the interval

#### Scenario: An exact tie goes to the longer duration

- **GIVEN** a chunk whose interval lasts √30 s (about 5.477 s), equally far from 5 s and 6 s by speed change
- **WHEN** the chunk is registered
- **THEN** its requested duration is 6 s

### Requirement: The requested duration stays within the admitted range

A chunk whose interval is shorter than the smallest admitted duration SHALL request the smallest admitted duration. No requested duration SHALL exceed the largest admitted duration.

#### Scenario: Below the minimum

- **GIVEN** a chunk whose interval lasts 3.2 s (a whole script below the lower bound, §6.1.1)
- **WHEN** the chunk is registered
- **THEN** its requested duration is 5 s and it has no duration warning

#### Scenario: At the maximum

- **GIVEN** a chunk whose interval lasts exactly 15 s
- **WHEN** the chunk is registered
- **THEN** its requested duration is 15 s and it has no duration warning

### Requirement: An interval over the maximum requests the maximum with a warning

A chunk whose interval is longer than the largest admitted duration (a sentence that cannot be split, §6.1.1) SHALL request the largest admitted duration and SHALL record the duration warning `exceeds-maximum`. The warning SHALL NOT fail the chunk or the session.

#### Scenario: Unsplittable sentence

- **GIVEN** a chunk whose interval lasts 17.4 s
- **WHEN** the chunk is registered
- **THEN** its requested duration is 15 s, its duration warning is `exceeds-maximum`, and it is `submitted` like any other chunk

### Requirement: The requested duration is stored with the chunk and never changes

Registration SHALL store each chunk's requested duration and duration warning in the same transaction that stores its interval. Once a chunk is registered, neither value SHALL change through any operation, and the store SHALL refuse an update of either with a `locked:` error. A later version of the application with different admitted durations SHALL NOT alter an established chunk's requested duration or warning.

#### Scenario: Stored and read back

- **GIVEN** a registered decomposition
- **WHEN** its chunks are read from the database
- **THEN** each chunk carries the requested duration and warning registration chose

#### Scenario: Direct update refused

- **GIVEN** a registered chunk
- **WHEN** an update of its requested duration or duration warning is attempted in the database
- **THEN** the store refuses it with `locked: scenes.requested_duration_seconds cannot be modified once the chunk is established` (or the `duration_warning` equivalent), and the values are unchanged

#### Scenario: A different admitted set later

- **GIVEN** a chunk registered while the admitted durations were 5 to 15 s, with an interval of 17.4 s and a stored request of 15 s
- **WHEN** the requested duration would now be chosen from 5 to 20 s
- **THEN** the chunk still reads 15 s with the `exceeds-maximum` warning

### Requirement: The requested duration is readable

The session read and each scene event SHALL expose `requestedDurationSeconds` and, when a warning is recorded, `durationWarning`, read-only. A scene without a stored request (created by the pre-decomposition skeleton path) SHALL omit both. No request schema SHALL accept either field.

#### Scenario: Exposed on the session read

- **GIVEN** a session whose chunk has an interval of 17.4 s
- **WHEN** the client reads the session
- **THEN** that scene carries `requestedDurationSeconds: 15` and `durationWarning: "exceeds-maximum"`, and the other scenes carry their requested duration without `durationWarning`

#### Scenario: Skeleton scene

- **GIVEN** a scene created without a decomposition
- **WHEN** it is read
- **THEN** it has neither `requestedDurationSeconds` nor `durationWarning`

### Requirement: The speed-adjustment factor is derived from the requested duration and the narrated interval

Each registered chunk's speed-adjustment factor SHALL be computed as `max(requestedDurationSeconds / narratedDurationSeconds, narratedDurationSeconds / requestedDurationSeconds)`, using the chunk's own `requestedDurationSeconds` (chosen per "The requested duration is the admitted duration needing the smallest speed change") and its own narrated interval (`end - start`). It SHALL NOT be computed from, or depend on, any later-generated clip's actual length, and it SHALL NOT be set independently of this computation.

#### Scenario: A slow-down

- **GIVEN** a chunk whose narrated interval lasts 9 s and whose requested duration is 11 s
- **WHEN** its speed-adjustment factor is computed
- **THEN** the factor is 11 / 9 ≈ 1.222

#### Scenario: A speed-up

- **GIVEN** a chunk whose narrated interval lasts 17.4 s and whose requested duration is 15 s (the unsplittable-sentence case)
- **WHEN** its speed-adjustment factor is computed
- **THEN** the factor is 17.4 / 15 = 1.16

#### Scenario: The factor is always at least 1

- **GIVEN** any registered chunk
- **WHEN** its speed-adjustment factor is computed
- **THEN** the factor is never less than 1, regardless of whether the requested duration is above or below the narrated interval

### Requirement: The speed-adjustment factor is stored with the chunk and never changes

Registration SHALL store each chunk's speed-adjustment factor in the same transaction that stores its requested duration. Once a chunk is registered, the factor SHALL NOT change through any operation, and the store SHALL refuse an update of it with a `locked:` error. A later version of the application with a different acceptable limit SHALL NOT alter an established chunk's factor or warning.

#### Scenario: Stored and read back

- **GIVEN** a registered decomposition
- **WHEN** its chunks are read from the database
- **THEN** each chunk carries the speed-adjustment factor registration computed

#### Scenario: Direct update refused

- **GIVEN** a registered chunk
- **WHEN** an update of its speed-adjustment factor or speed-factor warning is attempted in the database
- **THEN** the store refuses it with `locked: scenes.speed_factor cannot be modified once the chunk is established` (or the `speed_factor_warning` equivalent), and the values are unchanged

#### Scenario: A different acceptable limit later

- **GIVEN** a chunk registered while the acceptable limit was lower, with a stored factor above today's limit but below a later, raised limit
- **WHEN** the chunk is read after the limit changes
- **THEN** the chunk still carries the `speed_factor_warning` recorded at registration, unaffected by the later limit

### Requirement: A factor exceeding the acceptable limit records a warning, not a failure

When a chunk's speed-adjustment factor exceeds the hardcoded acceptable limit (`SPEED_FACTOR_LIMIT`), registration SHALL record a `speed_factor_warning` for that chunk. This warning SHALL NOT fail the chunk or the session, and it is independent of the `duration_warning` the requested-duration requirement may already record: a chunk MAY carry either, both, or neither.

#### Scenario: The factor exceeds the limit

- **GIVEN** a chunk whose computed speed-adjustment factor exceeds the hardcoded acceptable limit
- **WHEN** the chunk is registered
- **THEN** its `speed_factor_warning` is recorded and the chunk is registered normally, not failed

#### Scenario: The factor is within the limit

- **GIVEN** a chunk whose computed speed-adjustment factor does not exceed the hardcoded acceptable limit
- **WHEN** the chunk is registered
- **THEN** it has no `speed_factor_warning`

#### Scenario: Both warnings on the same chunk

- **GIVEN** an unsplittable sentence whose interval exceeds the largest admitted duration (recording `duration_warning: exceeds-maximum`) and whose resulting factor also exceeds the acceptable limit
- **WHEN** the chunk is registered
- **THEN** it carries both `durationWarning: "exceeds-maximum"` and `speedFactorWarning`, each recorded independently

### Requirement: The speed-adjustment factor is readable

The session read and each scene event SHALL expose `speedFactor` and, when recorded, `speedFactorWarning`, read-only, alongside `requestedDurationSeconds`. A scene without a stored request (the pre-decomposition skeleton path) SHALL omit all three. No request schema SHALL accept any of them.

#### Scenario: Exposed on the session read

- **GIVEN** a session whose chunk has a requested duration of 15 s and a narrated interval of 17.4 s
- **WHEN** the client reads the session
- **THEN** that scene carries `requestedDurationSeconds: 15`, `speedFactor: 1.16`, and `speedFactorWarning` if the factor exceeds the hardcoded limit

#### Scenario: Skeleton scene

- **GIVEN** a scene created without a decomposition
- **WHEN** it is read
- **THEN** it has neither `requestedDurationSeconds`, `speedFactor`, nor `speedFactorWarning`

### Requirement: The scene-details panel shows the requested duration and speed factor

The frontend's scene-details panel SHALL show a chunk's requested duration and speed factor, and any recorded duration or speed-factor warning, when the scene carries them.

#### Scenario: A scene's details are opened

- **GIVEN** a chunk with `requestedDurationSeconds: 15`, `speedFactor: 1.16`, and no warnings
- **WHEN** its scene details are expanded
- **THEN** the panel shows the requested duration and the speed factor

#### Scenario: A warning is shown alongside the value it qualifies

- **GIVEN** a chunk whose `speedFactorWarning` is recorded
- **WHEN** its scene details are expanded
- **THEN** the panel shows the warning next to the speed factor, distinguishable from a `durationWarning`

#### Scenario: A skeleton scene's details omit the fields

- **GIVEN** a scene created without a decomposition (no stored request)
- **WHEN** its scene details are expanded
- **THEN** the panel shows neither a requested duration nor a speed factor

