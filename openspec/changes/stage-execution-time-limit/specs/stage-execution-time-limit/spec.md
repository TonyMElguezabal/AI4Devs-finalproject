# Stage execution time limit

Requirements for deciding when a sent provider attempt has taken too long, and what happens to its result if it arrives afterwards. The retry budget that acts on a timeout is owned by `stage-retry-policy`; resuming in-flight requests after a restart by US-28; the general rule against duplicate confirmations by US-29.

## ADDED Requirements

### Requirement: The execution clock starts when the attempt is sent

The execution time of an attempt SHALL be measured from the moment its request is sent to the provider. Time an attempt spends waiting before it is sent — queued behind the per-stage request limit, held by a pause, or waiting for a scheduled retry — SHALL NOT count against the maximum time and SHALL NOT count as an attempt.

#### Scenario: A scene waits behind the request limit

- **WHEN** a scene's image attempt waits longer than the image stage's maximum time before being sent, and completes promptly once sent
- **THEN** the attempt succeeds
- **AND** no timeout is recorded

#### Scenario: A session is paused before an attempt is sent

- **WHEN** an attempt is held by a pause for longer than its stage's maximum time and then sent after the User continues
- **THEN** its execution time starts when it is sent

### Requirement: An attempt that exceeds the maximum time is a transient failure

When a sent attempt has produced no result after its stage's hardcoded maximum time, the system SHALL record the attempt as timed out, SHALL classify it as a transient failure, and SHALL hand it to the retry policy, which schedules the next attempt or declares the cycle exhausted.

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

### Requirement: A late result is accepted once, or discarded

When a result arrives for an attempt that already timed out, the system SHALL accept it as the stage instance's result if the stage instance has no successful result yet, and SHALL cancel any retry of that stage instance that has been scheduled but not sent. If the stage instance already has a successful result, the system SHALL record the late result as superseded and discard it. In no case SHALL the stage instance complete more than once or launch its next stage more than once.

#### Scenario: A late success arrives before the retry is sent

- **WHEN** a timed-out attempt's success arrives while its retry is scheduled but not sent
- **THEN** the late result is accepted as the stage instance's result
- **AND** the scheduled retry is cancelled and never sent

#### Scenario: A late success arrives while the retry is in flight

- **WHEN** a timed-out attempt's success arrives while its retry has been sent and has not answered
- **THEN** the late result is accepted as the stage instance's result
- **AND** when the retry later succeeds, its result is recorded as superseded and discarded

#### Scenario: A late success arrives after the stage already succeeded

- **WHEN** a timed-out attempt's success arrives after a later attempt already succeeded
- **THEN** the late result is recorded as superseded and discarded
- **AND** the next stage is not launched again

#### Scenario: A late success arrives after the cycle was exhausted

- **WHEN** a timed-out attempt's success arrives after the stage instance became `failed` by exhaustion and before any manual retry
- **THEN** the late result is accepted as the stage instance's result
- **AND** the stage instance leaves `failed`

#### Scenario: A late failure arrives

- **WHEN** a timed-out attempt later reports a failure
- **THEN** the failure is recorded against that attempt
- **AND** no additional attempt is consumed or scheduled because of it

### Requirement: The clock survives a restart

After a restart, the elapsed time of an attempt that was in flight SHALL be measured from its recorded send time, not from the restart.

#### Scenario: The application restarts during an attempt

- **WHEN** the application restarts while an attempt is in flight
- **THEN** the attempt times out at its recorded send time plus its stage's maximum time

#### Scenario: The limit passed while the application was down

- **WHEN** the application restarts after an in-flight attempt's maximum time has already passed
- **THEN** the attempt is recorded as timed out promptly after startup, unless its result is recovered first
