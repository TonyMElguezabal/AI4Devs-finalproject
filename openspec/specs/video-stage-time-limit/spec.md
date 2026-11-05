# video-stage-time-limit Specification

## Purpose
TBD - created by archiving change raise-video-time-limit. Update Purpose after archive.
## Requirements
### Requirement: Voice and decomposition requests are given 600 seconds and clip requests 1200 seconds

The voice and decomposition (visual instructions) stages SHALL each allow a request 600 seconds, and the video stage 1200 seconds, from the moment it is sent before it counts as exceeding its phase limit. The video limit covers the longest admitted clip (15 s). A request that is still being processed within that time SHALL NOT be failed and SHALL NOT be retried. A clip request that passes the video limit SHALL follow the requirement "A clip past its limit keeps its one provider task" instead of being failed. The limits SHALL be the ones recorded in PRD §11.3, and the configuration SHALL equal that row.

#### Scenario: A clip that takes about six minutes

- **GIVEN** a clip request sent 344 seconds ago that the provider still reports as running
- **WHEN** the stage polls it
- **THEN** the request is still pending, no failure is recorded and no new request is sent

#### Scenario: A narration of a full-size script

- **GIVEN** a voice-over request for a 10,000-character script sent 151 seconds ago that the provider has not answered
- **WHEN** the attempt deadlines are checked
- **THEN** the attempt is still in flight and no retry is scheduled

#### Scenario: A decomposition of a full-size script

- **GIVEN** a decomposition attempt for 67 fragments sent 209 seconds ago that the reasoning provider has not answered
- **WHEN** the attempt deadlines are checked
- **THEN** the attempt is still in flight and no retry is scheduled

#### Scenario: A clip that exceeds the limit

- **GIVEN** a clip request sent 1201 seconds ago that the provider still reports as running
- **WHEN** the stage polls it
- **THEN** the same request is still followed, no failure is recorded and no new request is sent

#### Scenario: A 14-second clip

- **GIVEN** a clip request for a 14-second clip sent 640 seconds ago that the provider still reports as running
- **WHEN** the stage polls it
- **THEN** the request is still pending, no failure is recorded and no new request is sent

#### Scenario: Configuration and PRD agree

- **WHEN** the configured per-phase maximum times and the clip wait ceiling are compared with PRD §11.3's row
- **THEN** every numeric value is equal, and a change to either alone is caught

### Requirement: A clip past its limit keeps its one provider task

When a clip request passes the video phase limit while the provider still reports it as running, the video stage SHALL keep polling that same provider task. It SHALL NOT record a failure, SHALL NOT send a new task for the scene, and SHALL keep the request's concurrency slot. A result that arrives after the limit SHALL be applied like one inside it. A task the provider reports as failed, or no longer holds, SHALL be recorded and follow the automatic retry rule, as it does inside the limit.

The wait SHALL end at the clip wait ceiling, twice the video phase limit (2400 s), counted from the moment the task was sent. If the task is still running at the ceiling, the scene SHALL fail its video stage as not retryable, with a reason that names the ceiling and says the provider task may still be running, and no new task SHALL be sent automatically. A manual retry by the User SHALL then send a new task. When the video stage has no phase limit, there SHALL be no ceiling (JOS-204; PRD §10.1, §11.3).

#### Scenario: Polling continues past the limit (AC1)

- **GIVEN** a clip request sent 1300 seconds ago that the provider still reports as running
- **WHEN** the stage polls it
- **THEN** it polls the same provider task, the scene stays `video-generating` with one attempt, no failure is recorded and no new task is submitted

#### Scenario: A result after the limit is accepted (AC2)

- **GIVEN** a clip request that passed the 1200 s limit while still running
- **WHEN** the provider reports success at 1500 seconds
- **THEN** the clip is stored, the scene is `chunk-complete`, and it took one attempt and one provider task

#### Scenario: A failure after the limit follows the retry rule (AC3)

- **GIVEN** a clip request that passed the 1200 s limit while still running
- **WHEN** the provider reports the task as failed, or no longer holds it
- **THEN** one failed transient attempt is recorded and the retry rule decides whether a new task is sent

#### Scenario: The ceiling is reached

- **GIVEN** a clip request sent 2401 seconds ago that the provider still reports as running
- **WHEN** the stage polls it
- **THEN** the scene fails its video stage as not retryable, the reason names the 2400 s ceiling and says the provider task may still be running, and no new task is sent

#### Scenario: The User retries after the ceiling

- **GIVEN** a scene that failed at the clip wait ceiling
- **WHEN** the User retries the scene
- **THEN** a new task is sent to the provider

#### Scenario: No limit, no ceiling

- **GIVEN** a video stage with no phase limit
- **WHEN** a clip request is still running after fifty minutes
- **THEN** the same task is still polled and the scene is not failed
