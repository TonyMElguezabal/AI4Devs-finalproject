# pipeline-handoffs Specification

## Purpose
TBD - created by archiving change run-session-end-to-end. Update Purpose after archive.
## Requirements
### Requirement: Decomposition starts when the narration is stored

When a session's voice-over is stored, the system SHALL start the session's decomposition phase (PRD §5 step 3) without user action, through the launch gate. The hand-off SHALL happen for every way a voice-over can be stored: the first attempt, a retried attempt, and an accepted late result. The session SHALL move from `voice-over-complete` to `chunk-decomposing` and the change SHALL be published to open session pages as every other state change is.

#### Scenario: First voice-over attempt succeeds

- **GIVEN** a new session whose first voice-over attempt succeeds
- **WHEN** the voice-over is stored
- **THEN** a decomposition run starts for that session
- **AND** the session's state becomes `chunk-decomposing` without any request from the user

#### Scenario: A retried voice-over attempt succeeds

- **GIVEN** a session whose first voice-over attempt failed transiently and whose retry succeeds
- **WHEN** the retried attempt's voice-over is stored
- **THEN** a decomposition run starts for that session

#### Scenario: A late voice-over result is accepted

- **GIVEN** a session whose voice-over attempt timed out and whose provider result arrives late and is accepted
- **WHEN** the late result's voice-over is stored
- **THEN** a decomposition run starts for that session

#### Scenario: The voice-over fails

- **GIVEN** a session whose voice-over attempts end in failure
- **WHEN** the session records the voice-over failure
- **THEN** no decomposition run starts

### Requirement: A session is handed to decomposition at most once

The system SHALL start decomposition automatically only for a session that has a stored voice-over, no scenes, no recorded failure, and no `timestamps` or `decomposition` attempt in any outcome. Any further trigger for the same session (a second stored-voice-over signal, a continue, a restart) SHALL start nothing. A decomposition retry keeps the rules of `decomposition-manual-retry`.

#### Scenario: Two triggers for the same session

- **GIVEN** a session whose decomposition has already started
- **WHEN** the hand-off is triggered again for that session
- **THEN** no second decomposition run starts and no attempt is added

#### Scenario: The decomposition failed

- **GIVEN** a session whose decomposition failed and is waiting for a manual retry
- **WHEN** the session is continued or the process restarts
- **THEN** no decomposition run starts automatically

#### Scenario: The session already has scenes

- **GIVEN** a session whose scenes are registered
- **WHEN** the hand-off is triggered for that session
- **THEN** no decomposition run starts

### Requirement: A paused session waits for continue before decomposition

A session that is paused when its voice-over is stored SHALL NOT start decomposition. Its page SHALL report the decomposition as held work while it stays at `voice-over-complete`. Continue SHALL start the decomposition.

#### Scenario: Paused before the narration was stored

- **GIVEN** a session paused while its voice-over attempt is in flight
- **WHEN** the voice-over is stored
- **THEN** no decomposition run starts and the session stays at `voice-over-complete` with one held decomposition unit

#### Scenario: Continue after the narration

- **GIVEN** a paused session at `voice-over-complete` with a stored voice-over and no decomposition attempt
- **WHEN** the user continues the session
- **THEN** a decomposition run starts for that session

### Requirement: Decomposition that never started resumes at restart

When the process starts, the system SHALL start decomposition for every session that is not paused and has a stored voice-over, no scenes, no recorded failure, and no `timestamps` or `decomposition` attempt. Sessions with scenes keep the boot rules they have today.

#### Scenario: The process stopped right after the narration

- **GIVEN** a stored session at `voice-over-complete` with no decomposition attempt, not paused
- **WHEN** the process starts
- **THEN** a decomposition run starts for that session

#### Scenario: A paused session at restart

- **GIVEN** a stored session at `voice-over-complete` with no decomposition attempt, paused
- **WHEN** the process starts
- **THEN** no decomposition run starts and the session still waits for continue

### Requirement: The running application assembles with the real tool by default

When the server starts, it SHALL register the ffmpeg assembly tool unless `USE_STUB_ASSEMBLY_TOOL` names a stub mode, in which case it SHALL register that stub. A session reaching assembly SHALL NOT fail with "no assembly tool is configured" in the running application.

#### Scenario: No stub flag

- **WHEN** the server starts without `USE_STUB_ASSEMBLY_TOOL`
- **THEN** the registered assembly tool is the ffmpeg tool

#### Scenario: Stub flag set

- **WHEN** the server starts with `USE_STUB_ASSEMBLY_TOOL=success`
- **THEN** the registered assembly tool is the stub in `success` mode

### Requirement: A session created through the API reaches its final video

A session created with `POST /sessions` SHALL progress through voice-over, decomposition, scene images, scene clips and assembly to `final-video` with no request to a test-only endpoint and no user action other than creating it.

#### Scenario: Script to final video with stubbed providers

- **GIVEN** the voice, alignment, visual-instruction, image and video providers are stubbed, and the assembly tool is stubbed
- **WHEN** a session is created with `POST /sessions`
- **THEN** the session reaches `final-video` without any call to `/internal/test/*`

