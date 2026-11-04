## ADDED Requirements

### Requirement: An image request is submitted once and followed until it ends

Each image attempt SHALL send exactly one submission to the image provider's queue (`POST https://queue.fal.run/<model>`; the reference model when the session has a reference image). The submission SHALL carry the queue start window (`X-Fal-Request-Start-Timeout`, 1800 s). The system SHALL then follow that same request through the status, result and cancel addresses the provider returned, until it completes, fails, or reaches its ceiling (`stage-execution-time-limit`). While the request can still finish, the system SHALL NOT send another submission for that scene.

#### Scenario: A request completes

- **WHEN** a scene's image attempt is submitted and its status later reports `COMPLETED` with no error
- **THEN** the result is fetched from the returned result address and the image is downloaded, checked and stored as today
- **AND** exactly one submission was sent for that attempt

#### Scenario: A request waits in the provider's queue

- **WHEN** a submitted request reports `IN_QUEUE` on several status checks and then `IN_PROGRESS` and `COMPLETED`
- **THEN** no second submission is sent while it waits
- **AND** the scene succeeds on that attempt

#### Scenario: A request ends with a provider error

- **WHEN** a request reports `COMPLETED` with an error
- **THEN** the attempt is a transient failure handed to the scene's retry path, whatever the provider's error type (the retry budget bounds the cost, and the provider does not bill a request that failed on its side)

#### Scenario: The provider rejects the submission

- **WHEN** the submission is answered with an HTTP error
- **THEN** it is classified as today (`classifyHttpStatus`; a rejected reference image is not retryable)

### Requirement: Follow-up addresses are checked before the key is sent

The system SHALL send the image provider key only to addresses on `https://queue.fal.run`. A status, result or cancel address returned by the provider that is not on that origin SHALL be refused without sending the key, and the attempt SHALL be a transient failure.

#### Scenario: The provider returns an unexpected address

- **WHEN** a submission response carries a status address outside `https://queue.fal.run`
- **THEN** no request is sent to that address
- **AND** the attempt is a transient failure whose reason does not include the address

### Requirement: A status check that fails is not an attempt

A status check that cannot reach the provider, or is answered with HTTP 5xx, SHALL NOT end the attempt and SHALL NOT use up an attempt. The next status check SHALL follow on the normal interval. Only the start window and the ceiling (`stage-execution-time-limit`) end the wait.

#### Scenario: One status check fails

- **WHEN** one status check of an in-flight request fails with a network error and the next reports `COMPLETED`
- **THEN** the scene succeeds on the same attempt

### Requirement: An automatic image retry waits the retry delay

An automatic image retry SHALL be submitted only after the retry delay of the bounded retry policy (`retryDelaySeconds`: exponential from the base, capped). When the provider answered HTTP 429 with `Retry-After`, the delay SHALL be at least that value. The wait SHALL NOT count against the image stage's maximum time, and the retry SHALL count as the next attempt of the cycle.

#### Scenario: The provider asks for a later retry

- **WHEN** a submission is answered HTTP 429 with `Retry-After: 30`
- **THEN** the next submission for that scene is sent no earlier than 30 s later
- **AND** it counts as the scene's next attempt

#### Scenario: A transient failure is not resent at once

- **WHEN** an image attempt fails transiently with budget left
- **THEN** the next submission is sent only after the retry delay
