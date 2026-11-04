# stage-execution-time-limit Specification

## Purpose
Requirements for deciding when a sent provider attempt has taken too long, and what happens to its result if it arrives afterwards. The retry budget that acts on a timeout is owned by `stage-retry-policy`; resuming in-flight requests after a restart by US-28; the general rule against duplicate confirmations by US-29. Established by `stage-execution-time-limit`.
## Requirements
### Requirement: The execution clock starts when the attempt is sent

The execution time of an attempt SHALL be measured from the moment its request is sent to the provider, except for the image stage, whose clock starts when the provider starts the job (see "A scene-level image request is limited from when the provider starts it"). Time an attempt spends waiting before it is sent — queued behind the per-stage request limit, held by a pause, or waiting for a scheduled retry — SHALL NOT count against the maximum time and SHALL NOT count as an attempt.

#### Scenario: A scene waits behind the request limit

- **WHEN** a scene's image attempt waits longer than the image stage's maximum time before being sent, and completes promptly once sent
- **THEN** the attempt succeeds
- **AND** no timeout is recorded

#### Scenario: A session is paused before an attempt is sent

- **WHEN** an attempt is held by a pause for longer than its stage's maximum time and then sent after the User continues
- **THEN** its execution time starts when it is sent

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

### Requirement: A scene-level image request is limited from when the provider starts it

The image stage, which records no attempt row, SHALL time each image request in three parts:

1. **Queue wait.** While the provider reports the request as `IN_QUEUE`, no execution time SHALL be counted. The wait SHALL be bounded by the start window sent with the request (1800 s from that request's own submission, enforced by the provider). A request whose start window passed never ran; it SHALL be a transient failure of the scene's attempt.
2. **Execution.** The image stage's maximum time SHALL count from the first status check that reports `IN_PROGRESS`.
3. **Past the maximum time.** The system SHALL keep following the same request, without sending a new one, until twice the maximum time has passed since `IN_PROGRESS`. At that ceiling it SHALL ask the provider once to cancel the request and SHALL mark the scene `failed` with the reason "the image request did not finish within <2 × limit> s (twice the <limit> s limit); the provider may still finish and bill it", with no further automatic retry in that cycle. If the provider answers the cancel by saying the request had already completed, its result SHALL be fetched and accepted.

A request SHALL also be bounded from its submission, so that a provider or network that stops answering status checks cannot leave a scene generating for ever: when the queue start window plus twice the maximum time have passed since the submission without a result, the system SHALL treat the request as having reached its ceiling (one cancel, then the scene `failed` with the same reason).

#### Scenario: A long queue wait does not time out

- **WHEN** a request stays `IN_QUEUE` for longer than the image stage's maximum time and then completes promptly once `IN_PROGRESS`
- **THEN** the image is accepted on that attempt and no timeout is recorded

#### Scenario: The start window passes

- **WHEN** the provider reports that a request's start window passed before the job started
- **THEN** the attempt is a transient failure and the scene's retry path decides the next attempt

#### Scenario: A request runs past the maximum time but finishes before the ceiling

- **WHEN** a request is `IN_PROGRESS` for longer than the maximum time and completes before twice the maximum time
- **THEN** its image is accepted
- **AND** no new submission was sent for the scene

#### Scenario: A request reaches the ceiling

- **WHEN** a request is still `IN_PROGRESS` twice the maximum time after it started
- **THEN** one cancel is sent for it
- **AND** the scene is `failed` with the ceiling reason
- **AND** no automatic retry is scheduled in that cycle

#### Scenario: The provider stops answering status checks

- **WHEN** every status check of a request fails, and the queue start window plus twice the maximum time have passed since its submission
- **THEN** one cancel is sent and the scene is `failed` with the ceiling reason

#### Scenario: The request finished just before the cancel

- **WHEN** the cancel at the ceiling is answered that the request had already completed
- **THEN** its result is fetched and the scene's image stage succeeds

#### Scenario: A scene waited behind the request limit

- **WHEN** a scene waited longer than the image stage's maximum time for a request slot and its request then completes promptly
- **THEN** the image is accepted and no timeout is recorded

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
