## ADDED Requirements

### Requirement: The report gives time and attempts per stage
For one session the report SHALL list, for each session-level stage (voice-over, timestamps, decomposition, assembly) and for the scene stages (image, video), the elapsed seconds between the stage's first send and last finish, the number of attempts, and the number of attempts stored as timed out.

#### Scenario: Stage with a retry
- **WHEN** a session's voice-over has two attempts, the first stored as `timed-out` and the second as `success`
- **THEN** the voice-over row shows 2 attempts, 1 timed out, and the elapsed time from the first send to the last finish

#### Scenario: Stage that never ran
- **WHEN** a session failed before assembly
- **THEN** the assembly row shows no attempts and no time, not zero

### Requirement: The report gives time per clip
For each scene the report SHALL list the requested clip duration, the generation seconds of the successful video attempt, the number of video attempts and the final outcome.

#### Scenario: Clip generated on the second attempt
- **WHEN** a clip's first video attempt timed out and its second succeeded after 540 s
- **THEN** the clip row shows 2 attempts, 540 s generation time and outcome success

#### Scenario: Clip that failed
- **WHEN** a clip has no successful attempt
- **THEN** the clip row shows no generation time and the last attempt's outcome

### Requirement: The report states the margin of a limit that was reached
When any attempt of a stage was stored as timed out, the report SHALL give that stage's limit, the slowest successful attempt time, and the margin (limit divided by the slowest successful time). When no successful attempt exists the margin SHALL be shown as not computable, never as a number.

#### Scenario: Limit reached
- **WHEN** the video limit is 1200 s, one clip timed out, and the slowest successful clip took 960 s
- **THEN** the report gives margin 1.25 for video

#### Scenario: No attempt reached a limit
- **WHEN** no attempt of a stage timed out
- **THEN** the report gives the slowest successful time for the stage and no margin

### Requirement: The report reads, never writes
The report SHALL open a copy of the database read-only, SHALL fail with a clear message when the session is not found, and SHALL NOT modify the database or the project folders.

#### Scenario: Unknown session
- **WHEN** the report is requested for a session id that is not in the database
- **THEN** it exits with an error naming the id and prints no tables

#### Scenario: Database untouched
- **WHEN** the report runs
- **THEN** the database file is byte-identical afterwards
