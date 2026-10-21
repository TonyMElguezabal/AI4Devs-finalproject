## MODIFIED Requirements

### Requirement: A stage without a defined maximum time is not timed

A stage whose maximum time is not set in the settings SHALL have no deadline, and its attempts SHALL NOT be timed out. Setting the value and restarting SHALL be enough to start timing that stage.

#### Scenario: A stage with an undetermined limit

- **WHEN** an attempt of a stage whose maximum time is undetermined has been in flight for any length of time
- **THEN** no timeout is recorded for it

### Requirement: An attempt that exceeds the maximum time is a transient failure

When a sent attempt has produced no result after its stage's configured maximum time, the system SHALL record the attempt as timed out, SHALL classify it as a transient failure, and SHALL hand it to the retry policy, which schedules the next attempt or declares the cycle exhausted.

#### Scenario: A sent attempt never answers

- **WHEN** a sent attempt has no result after its stage's maximum time
- **THEN** the attempt is recorded as timed out
- **AND** the next attempt is scheduled by the retry policy

#### Scenario: The fourth attempt of a cycle times out

- **WHEN** the fourth attempt of a cycle times out
- **THEN** the stage instance is `failed` as an exhausted, retryable failure

#### Scenario: Each stage uses its own limit

- **WHEN** attempts of two different stages are in flight
- **THEN** each is timed against the maximum time of its own stage
