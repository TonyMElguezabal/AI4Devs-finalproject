## MODIFIED Requirements

### Requirement: An interrupted clip resumes after a restart

A chunk left in `video-generating` when the application stops SHALL be reconciled on boot by asking the bound provider for the same request's result (§12.1). A finished result SHALL be applied as a normal delivery, even when the clip wait ceiling has passed while the application was down. A request the provider no longer holds SHALL count as one failed attempt of the video stage and follow the retry rule. A request still in progress SHALL keep being followed, with no new task sent. The video phase limit and the clip wait ceiling SHALL be counted from the moment the request was originally sent, not from the boot, so a restart never extends the wait. When no send time is stored, they SHALL be counted from the boot. A request still in progress at the ceiling SHALL fail as the requirement "A clip past its limit keeps its one provider task" (video-stage-time-limit) describes.

#### Scenario: The clip finished while the application was down

- **GIVEN** a chunk in `video-generating` whose provider request succeeded while the application was stopped
- **WHEN** the application boots
- **THEN** the clip is stored and the chunk is `chunk-complete`

#### Scenario: The provider no longer holds the request

- **GIVEN** a chunk in `video-generating` whose provider request is unknown to the provider after a restart
- **WHEN** the application boots
- **THEN** one failed attempt of the video stage is recorded and the retry rule decides the next step

#### Scenario: A clip exceeds the phase limit

- **GIVEN** a clip attempt still unfinished at the recorded video phase limit
- **WHEN** the limit is reached
- **THEN** the same request keeps being followed and no failure is recorded

#### Scenario: A restart while a clip is past its limit (AC4)

- **GIVEN** a chunk whose clip request was sent 1300 seconds ago, is past the limit and still running, when the application stops
- **WHEN** the application boots
- **THEN** polling resumes for the same provider task, no new task is sent, and the ceiling is still reached 2400 seconds after the original send

#### Scenario: A clip that finished past the ceiling while the application was down

- **GIVEN** a chunk whose clip request was sent 3000 seconds before the boot and succeeded while the application was stopped
- **WHEN** the application boots
- **THEN** the clip is stored and the chunk is `chunk-complete`
