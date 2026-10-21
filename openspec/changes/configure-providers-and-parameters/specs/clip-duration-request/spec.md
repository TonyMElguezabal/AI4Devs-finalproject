## MODIFIED Requirements

### Requirement: The requested duration is the admitted duration needing the smallest speed change

Each registered chunk's requested duration SHALL be chosen from the video provider's configured admitted durations (every whole second from the configured minimum to the configured maximum, read from the settings at start-up) as the one whose speed change to match the chunk's narrated duration (`end - start` of its interval) is smallest, where the speed change is `max(requested / narrated, narrated / requested)`. It SHALL be chosen even when it is shorter than the interval. An exact tie SHALL go to the longer duration.

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

#### Scenario: Configured admitted durations

- **GIVEN** the admitted durations are configured as 6 to 10 whole seconds and a chunk whose interval lasts 12.3 s
- **WHEN** the chunk is registered
- **THEN** its requested duration is 10 s
