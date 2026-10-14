## ADDED Requirements

### Requirement: A clip is given 600 seconds to be generated

The video stage SHALL allow a clip request 600 seconds from the moment it is sent before it counts as exceeding its phase limit. A request that is still being generated within that time SHALL NOT be failed and SHALL NOT be retried. The limit SHALL be the one recorded in PRD §11.3, and the configuration SHALL equal that row.

#### Scenario: A clip that takes about six minutes

- **GIVEN** a clip request sent 344 seconds ago that the provider still reports as running
- **WHEN** the stage polls it
- **THEN** the request is still pending, no failure is recorded and no new request is sent

#### Scenario: A clip that exceeds the limit

- **GIVEN** a clip request sent 601 seconds ago that the provider still reports as running
- **WHEN** the stage polls it
- **THEN** the attempt is recorded as a transient failure naming the 600 s phase limit

#### Scenario: Configuration and PRD agree

- **WHEN** the configured per-phase maximum times are compared with PRD §11.3's row
- **THEN** every numeric value is equal, and a change to either alone is caught
