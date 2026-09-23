# Stage retry policy

Requirements for retrying the failures of stages that call a provider. Classifying a failure as transient or not retryable is each provider adapter's responsibility; the per-phase maximum execution time is US-22b's; manual-retry endpoints belong to US-23 to US-27; pausing and the request cap are US-20's and US-37's. This capability covers what happens after a failure is classified.

## ADDED Requirements

### Requirement: The retry budget belongs to a stage instance and a cycle

The system SHALL count attempts per stage instance and per cycle. A stage instance SHALL be identified by the session and stage for the voice, decomposition and assembly stages, and by the session, scene and stage for the image and video stages. A cycle SHALL allow at most four attempts: the initial attempt and up to three automatic retries.

#### Scenario: Two scenes fail at the same stage

- **WHEN** the image stage of scene 1 and the image stage of scene 2 each fail transiently
- **THEN** each scene's attempts are counted against its own budget

#### Scenario: The same scene fails at two stages

- **WHEN** a scene exhausts its image budget in one cycle and is later retried to success
- **THEN** its video stage starts with a full budget of its own

### Requirement: A transient failure with budget left is retried automatically

When an attempt fails transiently and the current cycle holds fewer than four attempts, the system SHALL schedule the next attempt for the same stage instance after the hardcoded delay and SHALL send it through the phase-launch gate. The session or scene SHALL remain in its in-progress state.

#### Scenario: The first attempt fails transiently

- **WHEN** the first attempt of a stage instance fails transiently
- **THEN** a second attempt is scheduled for the same stage instance
- **AND** the session or scene remains in its in-progress state

#### Scenario: Three transient failures are followed by a success

- **WHEN** three attempts fail transiently and the fourth succeeds
- **THEN** the stage instance completes
- **AND** no fifth attempt is made

#### Scenario: The provider asks for a later retry

- **WHEN** a transient failure carries a provider instruction to wait before retrying
- **THEN** the next attempt is not sent before that time

### Requirement: An exhausted cycle fails the stage instance

When the fourth attempt of a cycle fails transiently, the system SHALL set the stage instance to `failed` with a comprehensible cause, marked retryable and with a manual retry available, and SHALL NOT schedule any further automatic attempt.

#### Scenario: Four attempts fail transiently

- **WHEN** the fourth attempt of a cycle fails transiently
- **THEN** the stage instance is `failed` with a comprehensible cause
- **AND** the failure is marked retryable with a manual retry available
- **AND** no further automatic attempt is scheduled

### Requirement: A not-retryable failure fails the stage instance at once

When an attempt fails with a not-retryable classification, the system SHALL set the stage instance to `failed` with the cause, marked not retryable, and SHALL NOT schedule any automatic attempt, regardless of how many attempts the cycle holds.

#### Scenario: The first attempt is rejected by a content filter

- **WHEN** the first attempt of a stage instance fails as not retryable
- **THEN** the stage instance is `failed` with the cause shown
- **AND** the failure is marked not retryable
- **AND** no automatic attempt is scheduled

### Requirement: No mechanism can exceed the budget

The store SHALL reject a fifth attempt in a cycle of a stage instance. Provider adapters SHALL NOT retry on their own: HTTP-client and SDK automatic retries SHALL be disabled, and each provider call SHALL correspond to exactly one recorded attempt. A queue or job redelivery SHALL NOT create a new attempt, and a request resumed after a restart SHALL remain the same attempt.

#### Scenario: Two failure notifications for the same attempt are processed concurrently

- **WHEN** two failure notifications for the fourth attempt of a cycle are processed at the same time
- **THEN** no fifth attempt is recorded

#### Scenario: An adapter's underlying client would retry

- **WHEN** a provider call fails inside an adapter
- **THEN** the adapter makes no further call on its own
- **AND** exactly one attempt is recorded for that call

#### Scenario: A job is redelivered

- **WHEN** the job that sends an attempt is delivered twice
- **THEN** only one attempt is recorded and only one provider call is made

### Requirement: A retry resumes at the failed stage instance

An automatic or manual retry SHALL re-run only the failed stage instance, with the same inputs and the provider bound to it. Completed results of earlier stages and of other scenes SHALL remain untouched.

#### Scenario: A scene's video stage is retried

- **WHEN** the video stage of a scene is retried
- **THEN** its image is reused and not generated again
- **AND** no other scene's results change

#### Scenario: The retry uses the bound provider

- **WHEN** a stage instance is retried
- **THEN** the attempt is sent to the provider bound to it at its first attempt

### Requirement: A manual retry opens a new cycle

When a manual retry is triggered for a stage instance in `failed`, the system SHALL start a new cycle for it, allowing up to four attempts before it can return to `failed`. Attempts of earlier cycles SHALL remain recorded and available to diagnostics.

#### Scenario: A manual retry is followed by four transient failures

- **WHEN** a stage instance in `failed` is retried manually and the next four attempts fail transiently
- **THEN** the stage instance returns to `failed` after the fourth attempt of the new cycle

#### Scenario: Earlier attempts are consulted after a manual retry

- **WHEN** a stage instance has been retried manually
- **THEN** the attempts of every earlier cycle remain recorded

#### Scenario: A manual retry is requested for a stage instance that has not failed

- **WHEN** a manual retry is requested for a stage instance that is not `failed`
- **THEN** no new cycle is started

### Requirement: Pause holds retries

A retry that becomes due while its session is paused SHALL NOT be sent until the User continues.

#### Scenario: A retry becomes due during a pause

- **WHEN** a scheduled retry becomes due while its session is paused
- **THEN** it is not sent
- **AND** it is sent after the User continues

### Requirement: Scheduled retries survive a restart

A scheduled retry SHALL be persisted with the time at which it becomes due. After a restart, every scheduled retry SHALL be sent exactly once.

#### Scenario: The application restarts before a retry is sent

- **WHEN** the application restarts while a retry is scheduled but not sent
- **THEN** the retry is sent after the restart
- **AND** it is sent exactly once

### Requirement: The failure exposes its retry state

The failure of a stage instance, in the session representation and in live-update events, SHALL include its cause, whether it is retryable, whether a manual retry is available, the cycle number and the number of attempts in that cycle. The cause SHALL NOT include credentials or raw provider payloads.

#### Scenario: A failed stage instance is consulted

- **WHEN** a session with a failed stage instance is read
- **THEN** the failure shows its cause, retryability, manual-retry availability, cycle and attempts in cycle

#### Scenario: A provider error contains sensitive detail

- **WHEN** a provider error includes credentials or a raw payload
- **THEN** none of it appears in the cause shown to the User
