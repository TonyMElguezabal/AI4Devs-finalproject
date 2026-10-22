## MODIFIED Requirements

### Requirement: The requested duration is stored with the chunk and never changes

Registration SHALL store each chunk's requested duration and duration warning in the same transaction that stores its interval. Once a chunk is registered, neither value SHALL change through any operation, and the store SHALL refuse an update of either with a `locked:` error. A later version of the application with different admitted durations SHALL NOT alter an established chunk's requested duration or warning. The one exception is the Administrator's explicit move of a failed video stage to the active provider (failed-stage-move), which chooses the duration again from the new provider's admitted durations for a chunk whose clip failed and has no result; that operation is the only one that may change them, and the store SHALL keep refusing every other update.

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

#### Scenario: The locks hold again after a move

- **GIVEN** a failed clip that the Administrator moved to a provider admitting other durations
- **WHEN** an update of its requested duration is then attempted directly in the database
- **THEN** the store refuses it with the `locked:` error

### Requirement: The speed-adjustment factor is stored with the chunk and never changes

Registration SHALL store each chunk's speed-adjustment factor in the same transaction that stores its requested duration. Once a chunk is registered, the factor SHALL NOT change through any operation, and the store SHALL refuse an update of it with a `locked:` error. A later version of the application with a different acceptable limit SHALL NOT alter an established chunk's factor or warning. The one exception is the same explicit move of a failed video stage (failed-stage-move), which records the factor and warning that follow from the requested duration chosen again.

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
