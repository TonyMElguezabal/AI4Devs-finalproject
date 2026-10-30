## RENAMED Requirements

- FROM: `### Requirement: A scene-level image request is limited at the provider call`
- TO: `### Requirement: A scene-level image request is limited from when the provider starts it`

## MODIFIED Requirements

### Requirement: The execution clock starts when the attempt is sent

The execution time of an attempt SHALL be measured from the moment its request is sent to the provider, except for the image stage, whose clock starts when the provider starts the job (see "A scene-level image request is limited from when the provider starts it"). Time an attempt spends waiting before it is sent — queued behind the per-stage request limit, held by a pause, or waiting for a scheduled retry — SHALL NOT count against the maximum time and SHALL NOT count as an attempt.

#### Scenario: A scene waits behind the request limit

- **WHEN** a scene's image attempt waits longer than the image stage's maximum time before being sent, and completes promptly once sent
- **THEN** the attempt succeeds
- **AND** no timeout is recorded

#### Scenario: A session is paused before an attempt is sent

- **WHEN** an attempt is held by a pause for longer than its stage's maximum time and then sent after the User continues
- **THEN** its execution time starts when it is sent

### Requirement: A scene-level image request is limited from when the provider starts it

The image stage, which records no attempt row, SHALL time each image request in three parts:

1. **Queue wait.** While the provider reports the request as `IN_QUEUE`, no execution time SHALL be counted. The wait SHALL be bounded by the start window sent with the request (1800 s from that request's own submission, enforced by the provider). A request whose start window passed never ran; it SHALL be a transient failure of the scene's attempt.
2. **Execution.** The image stage's maximum time SHALL count from the first status check that reports `IN_PROGRESS`.
3. **Past the maximum time.** The system SHALL keep following the same request, without sending a new one, until twice the maximum time has passed since `IN_PROGRESS`. At that ceiling it SHALL ask the provider once to cancel the request and SHALL mark the scene `failed` with the reason "the image request did not finish within <2 × limit> s (twice the <limit> s limit); the provider may still finish and bill it", with no further automatic retry in that cycle. If the provider answers the cancel by saying the request had already completed, its result SHALL be fetched and accepted.

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

#### Scenario: The request finished just before the cancel

- **WHEN** the cancel at the ceiling is answered that the request had already completed
- **THEN** its result is fetched and the scene's image stage succeeds

#### Scenario: A scene waited behind the request limit

- **WHEN** a scene waited longer than the image stage's maximum time for a request slot and its request then completes promptly
- **THEN** the image is accepted and no timeout is recorded
