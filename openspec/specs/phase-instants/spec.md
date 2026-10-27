# phase-instants Specification

## Purpose
TBD - created by archiving change record-phase-instants-and-pipeline-report. Update Purpose after archive.
## Requirements
### Requirement: Each phase records its start and end instant once
The system SHALL store, per session and phase (`voice-over`, `decomposition`, `scenes`, `assembly`), the instant the phase started and the instant it ended. Each instant SHALL be written once; a later retry, rebuild or restart SHALL NOT change it.

#### Scenario: A session runs through every phase
- **WHEN** a session completes voice-over, decomposition, scenes and assembly
- **THEN** each of the four phases has a start instant and an end instant, and each start is not after its end

#### Scenario: A phase is retried
- **WHEN** a phase's attempt fails and a later attempt completes the phase
- **THEN** the phase's start is the first attempt's instant and its end is the completion instant

#### Scenario: The final video is rebuilt
- **WHEN** a completed session's final video is rebuilt
- **THEN** the assembly phase's instants are unchanged

### Requirement: The scenes phase spans scene registration to the last completed scene
The scenes phase SHALL start when the decomposition registers the scenes and end when the last scene is complete.

#### Scenario: Scenes complete
- **WHEN** the decomposition registers three scenes and the third one completes
- **THEN** the scenes phase starts at the registration instant and ends at the third scene's completion

### Requirement: Existing sessions keep no instants
The migration SHALL NOT create phase instants for sessions that exist before it; a phase with no recorded instant SHALL be read as having no time.

#### Scenario: Upgrade of an existing database
- **WHEN** the application starts on a database holding a completed session
- **THEN** that session has no phase instants and every other table is unchanged

