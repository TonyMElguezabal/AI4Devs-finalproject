## ADDED Requirements

### Requirement: Voice, decomposition and video requests are given 600 seconds

The voice, decomposition (visual instructions) and video stages SHALL each allow a request 600 seconds from the moment it is sent before it counts as exceeding its phase limit. A request that is still being processed within that time SHALL NOT be failed and SHALL NOT be retried. The limits SHALL be the ones recorded in PRD §11.3, and the configuration SHALL equal that row.

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

- **GIVEN** a clip request sent 601 seconds ago that the provider still reports as running
- **WHEN** the stage polls it
- **THEN** the attempt is recorded as a transient failure naming the 600 s phase limit

#### Scenario: Configuration and PRD agree

- **WHEN** the configured per-phase maximum times are compared with PRD §11.3's row
- **THEN** every numeric value is equal, and a change to either alone is caught
