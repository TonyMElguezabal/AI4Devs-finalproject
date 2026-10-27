# pipeline-time-report Specification

## Purpose
TBD - created by archiving change record-phase-instants-and-pipeline-report. Update Purpose after archive.
## Requirements
### Requirement: The pipeline-time report gives elapsed seconds per phase
The system SHALL provide an Administrator report for a period `[from, to)` giving, for each phase started in the period, the elapsed seconds between its start and end instants per session, and in aggregate the number of sessions, the median and the 95th percentile.

#### Scenario: Two sessions in the period
- **WHEN** two sessions' voice-over phases took 20 s and 40 s and the report is requested for their period
- **THEN** the voice-over row lists both sessions, counts 2 sessions, and gives a median of 20 s

#### Scenario: A phase without an end
- **WHEN** a session's decomposition phase has a start but no end
- **THEN** the report shows no time for it and does not count it in the aggregate

### Requirement: A phase with no recorded instant shows no time
The report SHALL show no time, never an estimate, for a phase without both recorded instants.

#### Scenario: Session from before the instants were recorded
- **WHEN** the report is requested for a period containing a session that has no phase instants
- **THEN** that session shows no time for any phase

### Requirement: The report counts timed-out, late and superseded attempts
For voice-over, decomposition and assembly, the report SHALL give per phase the number of attempts sent in the period that timed out, finished late (`late-success`) or were superseded. For the scenes phase these counts SHALL be reported as not recorded.

#### Scenario: Attempts by stored outcome
- **WHEN** a period holds voice-over attempts stored as one `timed-out`, one `late-success` and one `superseded`
- **THEN** the voice-over row counts timed out 1, finished late 1 and superseded 1

#### Scenario: Scenes phase
- **WHEN** the report is requested
- **THEN** the scenes row gives its elapsed times and reports the three attempt counts as not recorded

### Requirement: The report requires the Administrator password
The report endpoint SHALL answer 401 to a request without the Administrator password and SHALL NOT run the query.

#### Scenario: No password
- **WHEN** the report is requested without the Administrator password
- **THEN** the response is 401

#### Scenario: Invalid period
- **WHEN** the report is requested with `from` not before `to`
- **THEN** the response is 400

