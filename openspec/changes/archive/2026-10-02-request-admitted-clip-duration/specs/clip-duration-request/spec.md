# Clip duration request

Requirements for choosing, storing and locking each chunk's requested clip duration (JOS-147, US-14; PRD §6.1.1, §7.2, §11, §11.2, AC06). The narration interval comes from `narration-intervals` (JOS-143). Sending the clip request belongs to JOS-146, and the applied speed factor and its limit warning to JOS-148.

## ADDED Requirements

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
