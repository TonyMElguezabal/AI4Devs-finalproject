## ADDED Requirements

### Requirement: The clip request shows the provider task and when it was last checked

While `videoRequest` is present, it SHALL also carry:
- `taskId`: the provider's task id of the current attempt, as returned by the provider when the request was sent.
- `lastCheckedAt`: the instant of the most recent check of that task that answered "still running", or null when the task has not been checked since the application started.
- `waitEndsAt`: the instant at which the scene fails if the task is still unfinished (the send time plus the clip wait ceiling), or null when the video stage has no time limit.

Each check that answers "still running" SHALL update `lastCheckedAt` and publish a fresh snapshot to the live stream. The expanded scene details SHALL show the task id, how long ago the last check was (updated live by the page's clock, or "Not checked yet" when null) and "Gives up at <time> if unfinished" when `waitEndsAt` is not null. A new attempt SHALL start with `lastCheckedAt` null, so a retry never shows the previous task's check.

#### Scenario: A clip being followed
- **GIVEN** scene 10's clip request was sent at 22:43:08 as task `abc123`, with a 2400 s ceiling
- **AND** the provider answered "still running" at 22:50:42
- **WHEN** the User expands scene 10 at 22:50:52
- **THEN** the details show task `abc123`, last checked 10 s ago and "Gives up at 23:23:08 if unfinished"

#### Scenario: The next check arrives
- **GIVEN** the details show last checked 10 s ago
- **WHEN** the provider answers "still running" again
- **THEN** the page receives a new snapshot and shows last checked 0 s ago without a reload

#### Scenario: After a restart
- **GIVEN** a clip in flight when the application restarts
- **WHEN** the User opens the session before the first check after the restart
- **THEN** the details show the same task id and "Not checked yet"
- **AND** after the first check they show how long ago it was

#### Scenario: A retry
- **GIVEN** scene 10's first task failed and a second task `def456` was sent
- **WHEN** the User reads the details before the second task's first check
- **THEN** they show task `def456` and "Not checked yet"

#### Scenario: No time limit
- **GIVEN** the video stage has no time limit configured
- **WHEN** the User reads the details of a clip in flight
- **THEN** `waitEndsAt` is null and no "Gives up at" row is shown

#### Scenario: Clip finished
- **GIVEN** scene 10's clip is complete or the scene failed
- **WHEN** the User reads the details
- **THEN** no task id, last check or wait end is shown, because `videoRequest` is absent

#### Scenario: The task id is not part of the request body
- **GIVEN** a clip request in flight with task `abc123`
- **WHEN** the User opens the request as sent
- **THEN** the body shown contains only the prompt, the duration, the resolution and the first frame named `scene {index} image`, and no task id
- **AND** the provider's upload URL, endpoint and credentials appear nowhere in the read or the snapshot
